// Saves real LinkedIn pages once, so the README media can be recorded from them
// offline as many times as it takes. LinkedIn signs a session out within a page
// load or two once the browser navigates programmatically, so this script never
// navigates. It opens a window, you sign in if asked and click through to Home
// and My Network yourself, and it saves each page as you arrive on it. The
// extension is not loaded, so the saved markup is LinkedIn's own.
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

Opens a headed Chromium on the real-site profile, without the extension, and
waits for you to visit LinkedIn Home and My Network (Grow) by hand. It saves
each page's DOM when you land on it, plus a HAR of every response, and exits
once both are saved. pnpm media:capture records the README media from this
snapshot and never contacts LinkedIn.

The snapshot holds your own session's pages: names, faces, and posts. It lives
under .e2e/, which git ignores. The capture blurs personal content before
anything is written for publication.

If the profile is signed out, sign in in the same window. Stay in the first
tab: the script watches that one.

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
    // Its Trusted Types rule refuses the capture's overlay, and with the
    // page's scripts gone there is nothing left for it to protect.
    'meta[http-equiv="Content-Security-Policy" i]',
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

const pageKey = url => {
  const { origin, pathname } = new URL(url)
  return `${origin}${pathname.endsWith('/') ? pathname : `${pathname}/`}`
}
const pending = new Map(PAGES.map(entry => [pageKey(entry.url), entry]))

let failed = false
try {
  const page = context.pages()[0] ?? (await context.newPage())
  await page.setContent(
    `<p style="font: 18px sans-serif; margin: 40px">Open LinkedIn in this tab
    and visit ${PAGES.map(entry => entry.url).join(' and ')}.</p>`,
  )
  console.log(
    `Visit these by hand, in the first tab:\n${PAGES.map(
      entry => `  ${entry.url}`,
    ).join('\n')}`,
  )
  while (pending.size > 0) {
    await page.waitForURL(url => pending.has(pageKey(url.href)), {
      timeout: 0,
    })
    await page.waitForTimeout(SETTLE_MS)
    const entry = pending.get(pageKey(page.url()))
    if (!entry) {
      continue
    }
    fs.writeFileSync(
      path.join(snapshotDir, `${entry.name}.html`),
      await page.evaluate(serializePage),
    )
    pending.delete(pageKey(entry.url))
    console.log(`saved ${entry.name}`)
  }
} catch (error) {
  console.error(
    `Stopped before saving ${[...pending.values()]
      .map(entry => entry.name)
      .join(', ')}: ${error.message.split('\n')[0]}`,
  )
  failed = true
} finally {
  // The HAR is written when the context closes.
  await context.close().catch(() => {})
}

if (failed) {
  process.exit(1)
}
console.log(`snapshot in ${path.relative(process.cwd(), snapshotDir)}`)
