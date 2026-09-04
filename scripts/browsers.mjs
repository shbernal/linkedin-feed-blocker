// Where the dev launchers and the Gecko validator find a browser to drive.
//
// Playwright's bundled Chromium is the headless shell, which cannot load an
// extension at all, so anything that needs `--load-extension` has to be handed
// a real system Chromium. The candidate paths live in `chromium-paths.json`
// rather than here because `e2e/fixtures/extensionRuntime.ts` needs the same
// list and cannot import this file: `scripts/` is plain ESM run by node and is
// not part of a TypeScript project reference. Both read the JSON instead.
import fs from 'node:fs'
import process from 'node:process'

/** @type {string[]} */
const CHROMIUM_CANDIDATES = JSON.parse(
  fs.readFileSync(new URL('./chromium-paths.json', import.meta.url), 'utf8'),
)

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
