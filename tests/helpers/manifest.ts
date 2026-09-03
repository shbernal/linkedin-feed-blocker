import { afterEach, beforeEach, vi } from 'vitest'

/**
 * `manifest.config.ts` reads `EXT_TARGET` at module scope, so each target needs
 * its own module instance. Shared by every guard that reads the manifest, so
 * there is one loader rather than one per test file.
 */
export const loadManifest = async (target?: string) => {
  vi.resetModules()

  if (target === undefined) {
    delete process.env.EXT_TARGET
  } else {
    process.env.EXT_TARGET = target
  }

  // `ManifestV3Export` also covers the promise and factory forms crxjs accepts;
  // this repo exports a plain object, which is what these assertions read.
  return (await import('../../manifest.config')).default as unknown as Record<
    string,
    unknown
  >
}

/**
 * Registers the hooks that keep `EXT_TARGET` from leaking between tests, or out
 * of the file into whatever ran before it. Call once at the top of a describe
 * block that loads the manifest.
 */
export const isolateExtTarget = () => {
  const originalTarget = process.env.EXT_TARGET

  beforeEach(() => {
    delete process.env.EXT_TARGET
  })

  afterEach(() => {
    if (originalTarget === undefined) {
      delete process.env.EXT_TARGET
    } else {
      process.env.EXT_TARGET = originalTarget
    }
  })
}
