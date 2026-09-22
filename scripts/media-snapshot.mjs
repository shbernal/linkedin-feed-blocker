// Saves real LinkedIn pages once, so the README media can be recorded from them
// offline as many times as it takes. LinkedIn signs an automated session out
// after a couple of page loads, so recording against the live site costs a
// manual sign-in per attempt. This script makes the smallest visit that yields
// everything the recording needs: Home and My Network, once each, with the
// extension not loaded, so the saved markup is LinkedIn's own.
//
// Each page is saved as its DOM with scripts removed and every readable
// stylesheet inlined, next to a HAR of every response the visit received. The
// recording serves the DOM for the page URL and the HAR for everything else,
// and nothing reaches the network.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { printHelpAndExit } from './help.mjs'
import { resolveChromiumExecutable } from './browsers.mjs'

const defaultSnapshotDir = '.e2e/media-snapshot'
const defaultProfileDir = '.e2e/linkedin-real-profile'

printHelpAndExit(`
Usage: pnpm media:snapshot [--help]

Opens LinkedIn Home and My Network in a headed Chromium on the signed-in
real-site profile, without the extension, and saves each page's DOM plus a HAR
of every response. pnpm media:capture records the README media from this
snapshot and never contacts LinkedIn.

The snapshot holds your own session's pages: names, faces, and posts. It lives
under .e2e/, which git ignores. The capture blurs personal content before
anything is written for publication.

Sign the profile in first with pnpm e2e:real:setup. LinkedIn signs automated
sessions out quickly, so the script stops rather than saving a login page.

Environment
  MEDIA_SNAPSHOT_DIR              output directory (default: ${defaultSnapshotDir})
  LINKEDIN_REAL_PROFILE_DIR       signed-in profile (default: ${defaultProfileDir})
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium-family binary to launch

See docs/media-capture.md.
`)

const { chromium } = await import('@playwright/test')

const PAGES = [
  { name: 'feed', url: 'https://www.linkedin.com/feed/' },
  { name: 'network', url: 'https://www.linkedin.com/mynetwork/grow/' },
]
const SETTLE_MS = 8000

const snapshotDir = path.resolve(
  process.cwd(),
  process.env.MEDIA_SNAPSHOT_DIR ?? defaultSnapshotDir,
)
const profileDir = path.resolve(
  process.cwd(),
  process.env.LINKEDIN_REAL_PROFILE_DIR ?? defaultProfileDir,
)

if (!fs.existsSync(profileDir)) {
  throw new Error(
    `Missing profile at ${profileDir}. Run pnpm e2e:real:setup first.`,
  )
}

// Runs in the page. Stylesheets LinkedIn builds at runtime exist only as CSSOM
// rules, so their text is read back out of the CSSOM; a cross-origin sheet
// that refuses that read keeps its <link> and is served from the HAR.
const serializePage = () => {
  const inlined = []
  const sheets = [...document.styleSheets, ...document.adoptedStyleSheets]
  for (const sheet of sheets) {
    try {
      inlined.push([...sheet.cssRules].map(rule => rule.cssText).join('\n'))
      sheet.ownerNode?.setAttribute('data-media-inlined', '')
    } catch {
      // Cross-origin without CORS: left in place.
    }
  }

  const clone = document.documentElement.cloneNode(true)
  const drop = [
    'script',
    'noscript',
    '[data-media-inlined]',
    'link[rel="preload"]',
    'link[rel="modulepreload"]',
    'link[rel="prefetch"]',
  ]
  for (const element of clone.querySelectorAll(drop.join(', '))) {
    element.remove()
  }
  for (const element of clone.querySelectorAll('*')) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('on')) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  for (const frame of clone.querySelectorAll('iframe')) {
    frame.removeAttribute('src')
    frame.removeAttribute('srcdoc')
  }

  const style = document.createElement('style')
  style.textContent = inlined.join('\n')
  clone.querySelector('head').append(style)

  return `<!doctype html>\n${clone.outerHTML}`
}

fs.rmSync(snapshotDir, { recursive: true, force: true })
fs.mkdirSync(snapshotDir, { recursive: true })

const executablePath = resolveChromiumExecutable()
const context = await chromium.launchPersistentContext(profileDir, {
  ...(executablePath ? { executablePath } : { channel: 'chromium' }),
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: ['--no-sandbox', '--mute-audio'],
  recordHar: { path: path.join(snapshotDir, 'assets.har.zip') },
})

let failed = false
try {
  const page = context.pages()[0] ?? (await context.newPage())
  for (const { name, url } of PAGES) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(SETTLE_MS)
    if (new URL(page.url()).pathname !== new URL(url).pathname) {
      console.error(
        `${name}: landed on ${page.url()}, not ${url}. The profile is signed ` +
          'out; run pnpm e2e:real:setup and try again.',
      )
      failed = true
      break
    }
    fs.writeFileSync(
      path.join(snapshotDir, `${name}.html`),
      await page.evaluate(serializePage),
    )
    console.log(`saved ${name}`)
  }
} finally {
  // The HAR is written when the context closes.
  await context.close()
}

if (failed) {
  process.exit(1)
}
console.log(`snapshot in ${path.relative(process.cwd(), snapshotDir)}`)
