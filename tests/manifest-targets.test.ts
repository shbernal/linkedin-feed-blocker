import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isolateExtTarget, loadManifest } from './helpers/manifest'

isolateExtTarget()

describe('the Chrome manifest', () => {
  it('uses a module service worker', async () => {
    const manifest = await loadManifest()

    expect(manifest.background).toEqual({
      service_worker: 'src/background/service-worker.ts',
      type: 'module',
    })
  })

  // The key means nothing to Chrome, and shipping it would put an add-on id in
  // the Chrome Web Store package for no reason.
  it('carries no Gecko settings', async () => {
    const manifest = await loadManifest()

    expect(manifest).not.toHaveProperty('browser_specific_settings')
  })

  it('is what any value other than firefox builds', async () => {
    expect(await loadManifest('chrome')).toEqual(await loadManifest())
    expect(await loadManifest('')).toEqual(await loadManifest())
  })
})

describe('the Firefox manifest', () => {
  it('uses a background script, because Gecko has no service workers', async () => {
    const manifest = await loadManifest('firefox')

    expect(manifest.background).toEqual({
      scripts: ['src/background/service-worker.ts'],
    })
  })

  // Changing this id does not rename the add-on: it creates a different one and
  // strands every installed user. It is set once and never again.
  it('declares the permanent add-on id', async () => {
    const manifest = await loadManifest('firefox')

    expect(manifest.browser_specific_settings).toEqual({
      gecko: {
        id: 'linkedin-feed-blocker@shbernal.github.io',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
    })
  })
})

// The rule the whole dual-build rests on: one source tree, one set of assets,
// and a manifest that differs in exactly two documented places. Anything else
// diverging means the two packages are no longer the same extension.
describe('the two targets', () => {
  it('differ only in the background entry and the Gecko settings', async () => {
    const chrome = await loadManifest()
    const firefox = await loadManifest('firefox')

    const keys = [
      ...new Set([...Object.keys(chrome), ...Object.keys(firefox)]),
    ].filter(key => key !== 'background' && key !== 'browser_specific_settings')

    for (const key of keys) {
      expect(firefox[key], key).toEqual(chrome[key])
    }
  })
})

// The manifest binds the command, the background script mirrors whatever the
// browser resolved into storage, and `src/shared/shortcut.ts` holds the default
// the in-page fallback falls back to when the command is unbound. The two
// spellings have to agree or the fallback answers keys nothing is bound to.
describe('the toggle shortcut', () => {
  it('matches the default in src/shared/shortcut.ts', async () => {
    const manifest = await loadManifest()
    const commands = manifest.commands as Record<
      string,
      { suggested_key: { default: string } }
    >
    const suggested =
      commands['toggle-current-page-block'].suggested_key.default

    const source = readFileSync(
      resolve(process.cwd(), 'src/shared/shortcut.ts'),
      'utf8',
    )

    expect(source).toContain(
      `export const DEFAULT_TOGGLE_SHORTCUT = '${suggested}'`,
    )
  })
})
