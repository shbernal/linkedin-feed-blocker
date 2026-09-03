// Opens the built Chrome extension in a real Chromium on a throwaway profile,
// so the manual checklist in AGENTS.md has a starting line that is one command
// rather than a build, a browser, an unpacked-extension dialog and a URL.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { printHelpAndExit } from './help.mjs'
import { resolveChromiumExecutable } from './browsers.mjs'

printHelpAndExit(`
Usage: pnpm dev:chrome [url] [--help]

Opens dist/ as an unpacked extension in a real Chromium and leaves the window
open until you close it. The default URL is the LinkedIn feed.

The profile is thrown away and recreated on every launch, under
node_modules/.tmp/chromium-profiles/dev, so extension storage from the last
session cannot make this one lie about defaults. It is deliberately not under
.e2e/, which holds the real-site profile with a signed-in LinkedIn session.

Environment
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium-family binary to launch; otherwise
                                  the first of /usr/bin/chromium,
                                  chromium-browser, google-chrome or
                                  google-chrome-stable that exists

Note: pnpm dev:chrome builds dist/ before this script runs, so run
node scripts/open-chromium.mjs --help to read this without building.

See docs/testing.md.
`)

// Imported after the help check rather than at the top, so `--help` answers
// without paying for Playwright's module graph.
const { chromium } = await import('@playwright/test')

const extensionPath = path.resolve(process.cwd(), 'dist')
const profileDir = path.resolve(
  process.cwd(),
  'node_modules',
  '.tmp',
  'chromium-profiles',
  'dev',
)
const startUrl = process.argv[2] ?? 'https://www.linkedin.com/feed/'

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build first.`,
  )
}

fs.rmSync(profileDir, { recursive: true, force: true })
fs.mkdirSync(profileDir, { recursive: true })

// Playwright's bundled headless binary is the headless shell, which cannot load
// an extension at all. A system Chromium is required; `channel` is the fallback
// when none of the known paths exist.
const executablePath = resolveChromiumExecutable()

const context = await chromium.launchPersistentContext(profileDir, {
  ...(executablePath ? { executablePath } : { channel: 'chromium' }),
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
})

console.log(`
Chromium is open with dist/ loaded.

  Binary   ${executablePath ?? 'channel: chromium'}
  Profile  ${path.relative(process.cwd(), profileDir)} (thrown away next launch)
  URL      ${startUrl}

Close the window to end the session.
`)

const page = context.pages()[0] ?? (await context.newPage())
await page.goto(startUrl, { waitUntil: 'domcontentloaded' })

await context.waitForEvent('close', { timeout: 0 })
