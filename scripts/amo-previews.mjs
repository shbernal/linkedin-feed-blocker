// Decision logic for the AMO listing-asset sync, kept out of `publish-amo.mjs`
// so it can be unit-tested without an HTTP layer or a credential. Everything
// here is pure: it takes the manifest and whatever AMO reports, and returns the
// work to do.
import path from 'node:path'

// `ImageField` in addons-server rejects anything that is not a non-animated
// PNG or JPEG under `MAX_IMAGE_UPLOAD_SIZE`, which is 4MB. Checking locally
// turns a mid-release API rejection into a failure before anything is uploaded.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

export const imageContentType = file => {
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()]

  if (type === undefined) {
    throw new Error(`${file} is not a PNG or JPEG; AMO accepts only those`)
  }

  return type
}

export const checkImageBytes = (file, bytes) => {
  if (bytes > MAX_IMAGE_BYTES) {
    const megabytes = (bytes / 1024 / 1024).toFixed(1)
    throw new Error(`${file} is ${megabytes}MB; AMO rejects images over 4MB`)
  }
}

// Display order is the order of the file. `position` is derived from the index
// rather than written out, so there is only one place to change an ordering and
// no way for the two to disagree.
export const parsePreviewManifest = (raw, source = 'amo/previews.json') => {
  const fail = message => {
    throw new Error(`${source}: ${message}`)
  }

  if (!Array.isArray(raw)) {
    fail('must be an array of previews')
  }

  if (raw.length === 0) {
    fail('has no previews; AMO would be left with an empty listing')
  }

  const seen = new Set()

  return raw.map((entry, index) => {
    const at = `entry ${index}`

    if (typeof entry?.file !== 'string' || entry.file === '') {
      fail(`${at} has no "file"`)
    }

    imageContentType(entry.file)

    if (seen.has(entry.file)) {
      fail(`${at} repeats ${entry.file}`)
    }

    seen.add(entry.file)

    const caption = entry.caption?.['en-US']

    if (typeof caption !== 'string' || caption.trim() === '') {
      fail(`${at} has no "en-US" caption`)
    }

    return { file: entry.file, caption: entry.caption }
  })
}

// Creating a preview goes through AMO's add-on submission throttles, and three
// screenshots is already enough to trip them: the first upload succeeds and the
// next comes back 429 with a Retry-After of about a minute. DRF sets that header
// on every throttled response, so the wait is read rather than guessed; the
// fallback only matters if it ever goes missing. The extra second keeps a
// rounded-down header from retrying a moment early and burning an attempt.
export const FALLBACK_THROTTLE_WAIT_MS = 60_000

export const throttleWaitMs = retryAfter => {
  const seconds = Number(retryAfter)

  return seconds > 0 && Number.isFinite(seconds)
    ? seconds * 1000 + 1000
    : FALLBACK_THROTTLE_WAIT_MS
}

// Waits here span seconds to most of a day, so one unit reads badly at one end
// or the other.
export const describeWait = ms => {
  const seconds = Math.round(ms / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m`
  }

  const remainder = minutes % 60

  return remainder === 0
    ? `${minutes / 60}h`
    : `${Math.floor(minutes / 60)}h${remainder}m`
}

// Which bucket a 429 came from changes `Retry-After` by four orders of
// magnitude, and only some of them are worth waiting out. The per-minute limit
// answers in about a minute; crossing the hourly boundary has answered with
// 3454 seconds and then completed correctly. The daily limit answers with
// whatever is left of its 24 hours, and that is not a wait, it is a different
// day. The sibling tiktok-feed-blocker project lost its 1.4.1 release to
// exactly that: a `Retry-After` of 52277 seconds slept on inside a job GitHub
// cancels at six hours, which spent a whole runner, created no version, and
// left the only account of why in a log line six hours above the failure. Past
// the cap the run fails at once and says when the bucket refills.
//
// The ceiling has to clear the hourly boundary, which is the longest wait that
// is still a real wait, with margin for one that lands somewhat worse.
export const MAX_THROTTLE_WAIT_MS = 70 * 60_000

// Per-wait is not enough by itself: several waits each under the ceiling still
// add up past the job serving them. This bounds the run rather than the call.
// Five previews is five throttled writes, so this side of it is the one this
// repo is most likely to meet.
export const MAX_THROTTLE_TOTAL_MS = 2 * 60 * 60_000

export const planThrottleRetry = (
  retryAfter,
  { attempt, attempts, waited = 0 },
) => {
  const wait = throttleWaitMs(retryAfter)
  const stop = reason => ({ retry: false, wait, reason })

  if (attempt >= attempts) {
    return stop(`${attempts} throttled attempts is the limit`)
  }

  if (wait > MAX_THROTTLE_WAIT_MS) {
    return stop(
      `AMO asked for ${describeWait(wait)}, past the ` +
        `${describeWait(MAX_THROTTLE_WAIT_MS)} a single wait may take`,
    )
  }

  if (waited + wait > MAX_THROTTLE_TOTAL_MS) {
    return stop(
      `another ${describeWait(wait)} would put this run past the ` +
        `${describeWait(MAX_THROTTLE_TOTAL_MS)} it may spend throttled`,
    )
  }

  return { retry: true, wait }
}

// Identity is the part of this the reconcile cannot solve. AMO re-encodes every
// image on ingest, so a local file and its published copy never share a hash,
// and nothing on a preview says which manifest entry produced it. Reusing a
// remote preview would therefore mean assuming its bytes are still the ones on
// disk, and a swapped screenshot that silently never uploads is exactly the
// failure this is meant to prevent. So a sync replaces rather than reconciles:
// it uploads the whole manifest and drops whatever was there before.
//
// Uploads are ordered before deletes so a run that dies halfway leaves the
// listing with too many images rather than none.
export const planPreviewSync = (remote, manifest) => ({
  uploads: manifest.map((entry, index) => ({ ...entry, position: index })),
  deletes: remote.map(preview => preview.id),
})

// AMO re-encodes every image on ingest, so the published bytes never match the
// local ones and the listing itself cannot say whether it is current. The lock
// records what this repository last pushed, which is the only thing that can:
// with it a release uploads what changed and spends no submission budget on
// bytes AMO already has.
//
// It is checked in on purpose. It describes the live listing, so a fresh clone
// has to plan the same way the machine that last published would.
export const PREVIEW_LOCK = 'amo/previews.lock.json'

/**
 * Anything unreadable degrades to `null`, which every caller below treats as a
 * full replace. That direction is the load-bearing one: a lock that fails open
 * costs one extra upload, and a lock that fails closed silently leaves a
 * changed screenshot unpublished. A stale listing is worse than a slow release.
 */
export const readPreviewLock = raw => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null
  }

  let parsed

  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  const { icon, previews, remoteCount } = parsed

  if (typeof icon !== 'string' || !Array.isArray(previews)) {
    return null
  }

  const entries = previews.map(entry =>
    typeof entry?.file === 'string' && typeof entry?.hash === 'string'
      ? { file: entry.file, hash: entry.hash }
      : null,
  )

  if (entries.some(entry => entry === null)) {
    return null
  }

  return {
    icon,
    previews: entries,
    remoteCount: Number.isInteger(remoteCount) ? remoteCount : null,
  }
}

export const buildPreviewLock = ({ iconHash, previewHashes, remoteCount }) => ({
  icon: iconHash,
  previews: previewHashes,
  remoteCount,
})

/**
 * The lock a run leaves when it does not sync previews. Nothing was pushed, so
 * it lists only the previews an earlier lock already vouched for, and records
 * the count AMO reported so a later sync can tell whether the listing still
 * holds them.
 */
export const lockAfterSkippedSync = ({ lock, iconHash, remoteCount }) =>
  buildPreviewLock({
    iconHash,
    previewHashes: lock?.previews ?? [],
    remoteCount,
  })

/**
 * AMO resizes an uploaded preview in a background task, and `image_size` stays
 * empty until that task saves the row. Returns the ids still waiting on it.
 */
export const pendingResizes = (remote, ids) =>
  ids.filter(
    id => !(remote.find(preview => preview.id === id)?.image_size?.length > 0),
  )

/**
 * The uploaded previews whose published caption is not the one that was sent,
 * including any AMO no longer lists at all.
 */
export const missingCaptions = (remote, uploaded) =>
  uploaded
    .filter(({ id, caption }) => {
      const published = remote.find(preview => preview.id === id)?.caption

      return Object.entries(caption).some(
        ([locale, text]) => published?.[locale] !== text,
      )
    })
    .map(({ id }) => id)

/**
 * What a release still has to push.
 *
 * Previews are all-or-nothing because `planPreviewSync` replaces rather than
 * reconciles, for the identity reason above: there is no per-image decision to
 * make, only whether the set as a whole is already published.
 */
export const planListingAssetSync = ({
  lock,
  iconHash,
  previewHashes,
  remoteCount,
  syncPreviews,
}) => {
  if (!lock) {
    return {
      icon: { upload: true, reason: 'no usable lock' },
      previews: {
        sync: syncPreviews,
        reason: syncPreviews ? 'no usable lock' : 'not requested',
      },
    }
  }

  const icon =
    lock.icon === iconHash
      ? { upload: false, reason: 'unchanged since the last release' }
      : { upload: true, reason: 'changed since the last release' }

  if (!syncPreviews) {
    return { icon, previews: { sync: false, reason: 'not requested' } }
  }

  const changed =
    lock.previews.length !== previewHashes.length ||
    previewHashes.some(
      (entry, index) =>
        lock.previews[index]?.file !== entry.file ||
        lock.previews[index]?.hash !== entry.hash,
    )

  if (changed) {
    return { icon, previews: { sync: true, reason: 'the manifest changed' } }
  }

  // The count is the only part of the listing this can check, so a lock that
  // cannot account for it is treated like an unreadable one.
  if (lock.remoteCount === null) {
    return {
      icon,
      previews: {
        sync: true,
        reason: 'the lock never recorded a remote count',
      },
    }
  }

  // A run that skipped the sync records AMO's count without pushing anything,
  // so a count that disagrees with the lock's own previews means it lists
  // screenshots AMO was never sent.
  if (remoteCount !== lock.previews.length) {
    return {
      icon,
      previews: {
        sync: true,
        reason:
          `AMO reports ${remoteCount} previews where the lock lists ` +
          `${lock.previews.length}`,
      },
    }
  }

  // A listing edited by hand on AMO no longer matches what the lock describes.
  if (lock.remoteCount !== remoteCount) {
    return {
      icon,
      previews: {
        sync: true,
        reason:
          `AMO reports ${remoteCount} previews where the lock recorded ` +
          `${lock.remoteCount}`,
      },
    }
  }

  return {
    icon,
    previews: { sync: false, reason: 'unchanged since the last release' },
  }
}

// Printed on every release that does not pass `--sync-previews`, so a
// screenshot change nobody synced stays visible instead of going quiet. Equal
// counts are not proof the images match: there is nothing to compare bytes
// against, so a same-count swap looks identical from here.
export const describePreviewDrift = (remote, manifest) => {
  const state =
    remote.length === manifest.length
      ? 'same count, though the images themselves cannot be compared'
      : 'out of sync'

  return (
    `previews: ${manifest.length} in the manifest, ${remote.length} on AMO ` +
    `(${state}). Pass --sync-previews to reapply them.`
  )
}
