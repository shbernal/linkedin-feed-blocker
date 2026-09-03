import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isolateExtTarget, loadManifest } from './helpers/manifest'

// crxjs names each output chunk after its entry file's basename, so two entries
// with the same basename produce two chunks competing for one name. When the
// background and content-script entries were both `main.ts`, the generated
// `service-worker-loader.js` imported whichever `main.ts-<hash>.js` it resolved
// first, which was the content script: `chrome.commands.onCommand` registered
// in no shipped build while typecheck, both suites and the build stayed green.
// That is commit 7e10cad. Until this guard existed, the only thing standing
// between the repo and a recurrence was a comment in `manifest.config.ts`.
const SOURCE_PATH = /^src\/\S+$/

/**
 * Every `src/` path the manifest names, wherever it names it. Walking the whole
 * object rather than reading `background` and `content_scripts` by name means a
 * later `options_page` or `web_accessible_resources` entry is covered without
 * anyone remembering to add it here.
 */
const collectSourcePaths = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return SOURCE_PATH.test(value) ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectSourcePaths)
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(collectSourcePaths)
  }

  return []
}

const collidingBasenames = (paths: string[]) => {
  const byBasename = new Map<string, Set<string>>()

  // Deduplicated first: one file legitimately named twice, by two
  // `content_scripts` blocks with different `matches`, is one chunk and not a
  // collision. Two different files sharing a basename is the failure.
  for (const path of new Set(paths)) {
    const name = basename(path)
    byBasename.set(name, (byBasename.get(name) ?? new Set()).add(path))
  }

  return [...byBasename]
    .filter(([, files]) => files.size > 1)
    .map(([name, files]) => `${name}: ${[...files].sort().join(', ')}`)
}

isolateExtTarget()

describe.each([
  ['Chrome', undefined],
  ['Firefox', 'firefox'],
])('the %s manifest entries', (_label, target) => {
  it('do not share a basename', async () => {
    const paths = collectSourcePaths(await loadManifest(target))

    // Without this the guard passes on a manifest it failed to read.
    expect(paths.length).toBeGreaterThan(0)
    expect(collidingBasenames(paths)).toEqual([])
  })
})
