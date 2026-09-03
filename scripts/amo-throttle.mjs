// A budget model for AMO's write throttles, kept out of `publish-amo.mjs` so it
// can be unit-tested without an HTTP layer or a credential. Everything here is
// pure: it takes what has already been sent and the current time, and returns
// how long to wait before sending the next thing.
//
// Why a budget rather than only a retry: a request AMO rejects still spends
// budget on the windows it did not violate, so reacting to a 429 leaves the
// retry poorer than the request that failed. Pacing ahead of the limit is the
// version that converges. `planThrottleRetry` in `amo-previews.mjs` stays as
// the safety net for a 429 this model did not predict, which is a different
// question: this one decides when to send, that one decides when to give up.

/**
 * DRF applies every window on a scope at once, so the wait is the longest of
 * them. These are the rates addons-server advertises for add-on submission,
 * and they are the ones the preview sync actually meets: two calls per image
 * plus a delete each means five screenshots need more than an hour's budget.
 */
export const SUBMISSION_WINDOWS = [
  { limit: 3, windowMs: 60_000, label: '3/minute' },
  { limit: 10, windowMs: 60 * 60_000, label: '10/hour' },
  { limit: 24, windowMs: 24 * 60 * 60_000, label: '24/day' },
]

/**
 * Package uploads are billed to their own scope, whose rates are not documented
 * anywhere this repository can cite. Modelling them from a guess would pace
 * against a number nobody checked, so they are deliberately unmodelled and left
 * to the reactive 429 path. A release makes one upload, which is not where the
 * budget runs out.
 */
export const UNTHROTTLED = []

/**
 * Safe methods do not count against the submission scope, and this script makes
 * several of them: the credential check, the validation poll, and the read that
 * supplies the current preview list.
 */
export const scopeFor = (method, endpoint) => {
  if (method === 'GET' || method === 'HEAD') {
    return 'read'
  }

  if (endpoint.startsWith('/addons/upload/')) {
    return 'upload'
  }

  if (endpoint.startsWith('/addons/addon/')) {
    return 'submission'
  }

  return 'read'
}

export const windowsForScope = scope => {
  return scope === 'submission' ? SUBMISSION_WINDOWS : UNTHROTTLED
}

/**
 * How long to wait before a send in this scope stays inside every window.
 *
 * `sentAt` is the timestamps of previous sends, oldest first. A window is full
 * when it already holds `limit` sends, and it frees up when its oldest send
 * ages out, so the wait is measured from that one rather than from now.
 */
export const planThrottledSend = (windows, sentAt, now) => {
  let waitMs = 0
  let reason = null

  for (const { limit, windowMs, label } of windows) {
    const inWindow = sentAt.filter(at => now - at < windowMs)

    if (inWindow.length < limit) {
      continue
    }

    // The (length - limit + 1)-th oldest is the one whose expiry makes room.
    const frees = inWindow[inWindow.length - limit]
    const wait = frees + windowMs - now

    if (wait > waitMs) {
      waitMs = wait
      reason = label
    }
  }

  return { waitMs, reason }
}

/**
 * Tracks what has been sent per scope. The clock is injected so the tests can
 * drive it, and so a long throttle wait cannot be mistaken for elapsed time
 * that never happened.
 */
export const createThrottleLedger = (now = () => Date.now()) => {
  const sentAt = new Map()

  return {
    /** How long to wait before sending in this scope. */
    plan: scope => {
      return planThrottledSend(
        windowsForScope(scope),
        sentAt.get(scope) ?? [],
        now(),
      )
    },

    /** Called for every request that leaves, including ones AMO rejects. */
    record: scope => {
      if (windowsForScope(scope).length === 0) {
        return
      }

      const at = now()
      const entries = sentAt.get(scope) ?? []
      const longest = Math.max(
        ...windowsForScope(scope).map(entry => entry.windowMs),
      )

      sentAt.set(
        scope,
        [...entries, at].filter(entry => at - entry < longest),
      )
    },

    /** For assertions and for the dry-run summary. */
    sent: scope => (sentAt.get(scope) ?? []).length,
  }
}
