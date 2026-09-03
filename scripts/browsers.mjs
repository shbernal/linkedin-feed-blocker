// Where the dev launchers and the Gecko validator find a browser to drive.
//
// Playwright's bundled Chromium is the headless shell, which cannot load an
// extension at all, so anything that needs `--load-extension` has to be handed
// a real system Chromium. The same list lives in
// `e2e/fixtures/extensionRuntime.ts` for the Playwright lane, which cannot
// import this file: `scripts/` is plain ESM run by node and is not part of a
// TypeScript project reference.
import fs from 'node:fs'
import process from 'node:process'

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
]

/**
 * A real Chromium, or `undefined` to let Playwright fall back to
 * `channel: 'chromium'`. Never the bundled headless shell.
 */
export const resolveChromiumExecutable = () => {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  if (explicit) {
    return explicit
  }

  return CHROMIUM_CANDIDATES.find(candidate => fs.existsSync(candidate))
}

export const DEFAULT_FIREFOX_BINARY = '/usr/bin/firefox'
export const DEFAULT_ZEN_BINARY = '/usr/bin/zen-browser'

/**
 * The Gecko binary to drive. `FIREFOX_BINARY` is the single knob for it across
 * `pnpm validate:firefox`, `pnpm dev:firefox` and `pnpm dev:zen`, so a fork
 * that is not Zen needs no new script.
 */
export const resolveGeckoBinary = (fallback = DEFAULT_FIREFOX_BINARY) => {
  return process.env.FIREFOX_BINARY ?? fallback
}
