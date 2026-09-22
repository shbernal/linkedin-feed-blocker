// Records the README demo and the stills it is built from, with the built
// extension loaded, against the LinkedIn pages pnpm media:snapshot saved. Every
// request is answered from that snapshot or refused, so the recording never
// contacts LinkedIn and never needs a session. Run it through
// scripts/capture-media.sh, which caps node and every Chromium process in a
// systemd unit; the guards in this file are a second layer, not the only one.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { printHelpAndExit } from './help.mjs'
import { resolveChromiumExecutable } from './browsers.mjs'

const defaultOutDir = 'media-capture'
const defaultSnapshotDir = '.e2e/media-snapshot'

printHelpAndExit(`
Usage: pnpm media:capture [--help]

Replays the pages saved by pnpm media:snapshot in headless Chromium with dist/
loaded, walks through blocking Home and My Network, and writes screencast
frames plus stills of each state and the popup. Names, faces, and posts are
blurred. Run pnpm media:encode afterwards to turn the frames into the GIF and
the before/after composite.

Environment
  MEDIA_CAPTURE_DIR               output directory (default: ${defaultOutDir})
  MEDIA_SNAPSHOT_DIR              snapshot to replay (default: ${defaultSnapshotDir})
  MEDIA_CAPTURE_WATCHDOG_MS       give up after this long (default: 180000)
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium-family binary to launch

See docs/media-capture.md.
`)

const WATCHDOG_MS = Number(process.env.MEDIA_CAPTURE_WATCHDOG_MS ?? 180_000)
const MEMORY_ABORT_BYTES = 2.2 * 1024 ** 3
const MIN_AVAILABLE_BYTES = 3 * 1024 ** 3
const MAX_FRAMES = 700

const FEED_URL = 'https://www.linkedin.com/feed/'
const NETWORK_URL = 'https://www.linkedin.com/mynetwork/grow/'

const extensionPath = path.resolve(process.cwd(), 'dist')
const outDir = path.resolve(
  process.cwd(),
  process.env.MEDIA_CAPTURE_DIR ?? defaultOutDir,
)
const snapshotDir = path.resolve(
  process.cwd(),
  process.env.MEDIA_SNAPSHOT_DIR ?? defaultSnapshotDir,
)
const log = (...args) =>
  console.log(new Date().toISOString().slice(11, 19), ...args)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build first.`,
  )
}

const snapshotPages = {
  [FEED_URL]: path.join(snapshotDir, 'feed.html'),
  [NETWORK_URL]: path.join(snapshotDir, 'network.html'),
}
const harPath = path.join(snapshotDir, 'assets.har.zip')
for (const file of [...Object.values(snapshotPages), harPath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run pnpm media:snapshot first.`)
  }
}

// Refuse to start on a machine that is already short on memory.
const meminfo = fs.readFileSync('/proc/meminfo', 'utf8')
const available = Number(/MemAvailable:\s+(\d+)/.exec(meminfo)[1]) * 1024
if (available < MIN_AVAILABLE_BYTES) {
  log(`only ${(available / 1024 ** 3).toFixed(1)}G available, not starting`)
  process.exit(4)
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ltfb-media-'))

let context
let exiting = false
const shutdown = async (code, reason) => {
  if (exiting) {
    return
  }
  exiting = true
  log(`shutdown (${reason}), exit ${code}`)
  await Promise.race([context?.close().catch(() => {}), sleep(5000)])
  fs.rmSync(profile, { recursive: true, force: true })
  process.exit(code)
}
setTimeout(() => shutdown(3, 'watchdog'), WATCHDOG_MS)
process.on('SIGTERM', () => shutdown(143, 'SIGTERM'))
process.on('SIGINT', () => shutdown(130, 'SIGINT'))
// A failed top-level await surfaces as an uncaught exception, not a rejection.
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.on(event, error => {
    log('error:', error?.message?.split('\n')[0])
    shutdown(1, 'error')
  })
}

// Inside the systemd unit this cgroup holds node and every Chromium process.
// Outside one it is the login session's cgroup, which is not a useful budget,
// so the check only runs when the wrapper says it is capped.
if (process.env.MEDIA_CAPTURE_CAPPED === '1') {
  const cgroupPath = fs
    .readFileSync('/proc/self/cgroup', 'utf8')
    .split(':')[2]
    .trim()
  const memoryFile = `/sys/fs/cgroup${cgroupPath}/memory.current`
  let peak = 0
  setInterval(() => {
    const current = Number(fs.readFileSync(memoryFile, 'utf8'))
    peak = Math.max(peak, current)
    if (current > MEMORY_ABORT_BYTES) {
      shutdown(5, `memory ${(current / 1024 ** 3).toFixed(2)}G over budget`)
    }
  }, 1000)
  setInterval(() => log(`memory peak ${(peak / 1024 ** 2).toFixed(0)}M`), 15000)
}

// Everything that identifies a person: the signed-in member's own card and
// avatar, the authors and bodies of posts, and the people on My Network. These
// images are published, and none of those people agreed to be in them.
const BLUR_SELECTORS = []

// Runs in the page before the content script. It blurs personal content and
// draws a cursor and a caption pill, since headless Chromium draws no pointer.
// Nothing here ships.
const demoInit = blurSelectors => {
  const install = () => {
    if (document.getElementById('demo-style')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'demo-style'
    style.textContent = `
      ${blurSelectors.join(',\n')} { filter: blur(7px) !important; }
      #demo-cursor { position: fixed; z-index: 2147483647; left: 0; top: 0;
        width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(255,255,255,.9); border: 2px solid #1d2226;
        box-shadow: 0 2px 10px rgba(0,0,0,.35); pointer-events: none; }
      #demo-cursor.down { transform: scale(.7); background: #0a66c2; }
      #demo-caption { position: fixed; z-index: 2147483647; left: 50%;
        bottom: 36px; transform: translateX(-50%); padding: 12px 22px;
        border-radius: 999px; background: rgba(29,34,38,.94); color: #fff;
        pointer-events: none; white-space: nowrap;
        font: 600 20px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI',
          Roboto, sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,.3); }
      #demo-caption:empty { display: none; }
      #demo-caption kbd { font: 700 16px ui-monospace, monospace;
        padding: 2px 8px; border-radius: 6px; background: #3a4147;
        border: 1px solid #5c656c; }
    `
    document.documentElement.appendChild(style)

    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.style.left = '900px'
    cursor.style.top = '420px'
    const caption = document.createElement('div')
    caption.id = 'demo-caption'
    document.documentElement.append(cursor, caption)

    addEventListener(
      'mousemove',
      event => {
        cursor.style.left = `${event.clientX}px`
        cursor.style.top = `${event.clientY}px`
      },
      true,
    )
    addEventListener('mousedown', () => cursor.classList.add('down'), true)
    addEventListener('mouseup', () => cursor.classList.remove('down'), true)
  }

  if (document.documentElement) {
    install()
  }
  document.addEventListener('DOMContentLoaded', install)
}

log('launching chromium')
context = await chromium.launchPersistentContext(profile, {
  executablePath: resolveChromiumExecutable(),
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  timeout: 30_000,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
    '--mute-audio',
    '--renderer-process-limit=4',
    '--js-flags=--max-old-space-size=768',
    '--disable-background-networking',
  ],
})
context.setDefaultTimeout(15_000)
context.setDefaultNavigationTimeout(30_000)

// The last route registered is consulted first. A saved page answers its own
// URL, the HAR answers what the visit fetched, and anything else is refused.
await context.route(/^https?:/, route => route.abort())
await context.routeFromHAR(harPath, { url: /^https?:/, notFound: 'fallback' })
await context.route(/^https:\/\/www\.linkedin\.com\//, route => {
  const file = snapshotPages[route.request().url()]
  if (!file) {
    return route.fallback()
  }
  return route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: fs.readFileSync(file),
  })
})
await context.addInitScript(demoInit, BLUR_SELECTORS)

// Read the id now: an idle MV3 worker can be gone by the end of the run.
const worker =
  context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const extensionId = new URL(worker.url()).hostname

const setSettings = settings =>
  worker.evaluate(
    value =>
      new Promise(resolve => {
        chrome.storage.local.set({ extensionSettings: value }, resolve)
      }),
    settings,
  )
const allSections = enabled => ({
  active: enabled,
  feed: enabled,
  rightFeed: enabled,
  networkPuzzle: enabled,
  networkPremium: enabled,
  networkSuggestions: enabled,
  jobSidebar: enabled,
})

const page = await context.newPage()

const caption = html =>
  page.evaluate(markup => {
    const element = document.getElementById('demo-caption')
    if (element) {
      element.innerHTML = markup
    }
  }, html)

const setDemoChrome = visible =>
  page.evaluate(show => {
    for (const id of ['demo-cursor', 'demo-caption']) {
      const element = document.getElementById(id)
      if (element) {
        element.style.visibility = show ? 'visible' : 'hidden'
      }
    }
  }, visible)

const still = async name => {
  await setDemoChrome(false)
  await page.screenshot({ path: path.join(outDir, `${name}.png`) })
  await setDemoChrome(true)
  log('still', name)
}

const failureShot = name =>
  page
    .screenshot({ path: path.join(outDir, `fail-${name}.png`) })
    .catch(() => {})

const moveTo = async (locator, name) => {
  try {
    await locator.waitFor({ state: 'visible' })
  } catch (error) {
    await failureShot(name)
    log(`${name} not visible at`, page.url())
    throw error
  }
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 24,
  })
  await page.waitForTimeout(250)
}

const click = async () => {
  await page.mouse.down()
  await page.waitForTimeout(140)
  await page.mouse.up()
}

const hiddenCount = attribute => page.locator(`[${attribute}]`).count()

const waitForHidden = async (attribute, name) => {
  try {
    await page.waitForFunction(
      value => document.querySelector(`[${value}]`) !== null,
      attribute,
      { timeout: 10_000 },
    )
  } catch (error) {
    await failureShot(name)
    log(`nothing carries ${attribute} at`, page.url())
    throw error
  }
}

// Home starts unblocked for the "before" still. My Network is already on, so
// following the nav link lands on a blocked page.
await setSettings({
  ...allSections(true),
  feed: false,
  rightFeed: false,
})

log('opening Home')
await page.goto(FEED_URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.mouse.move(900, 420)
await still('feed-unblocked')

// Frames go straight to disk rather than being held in memory.
const cdp = await context.newCDPSession(page)
const frames = []
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  if (frames.length >= MAX_FRAMES) {
    return
  }
  const file = `frames/${String(frames.length).padStart(5, '0')}.jpg`
  fs.writeFileSync(path.join(outDir, file), Buffer.from(data, 'base64'))
  frames.push({ file, timestamp: metadata.timestamp })
  if (frames.length === MAX_FRAMES) {
    log('frame cap reached')
  }
})
await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 88,
  maxWidth: 1280,
  maxHeight: 800,
})
log('recording')

await caption('LinkedIn Home, as it ships')
await page.waitForTimeout(2400)

await caption('Press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>7</kbd>')
await page.waitForTimeout(1100)
await page.keyboard.press('Control+Shift+7')
await waitForHidden('data-ltfb-feed-hidden', 'feed-blocked')
await caption('The feed and the right rail are gone')
await page.waitForTimeout(2600)
await still('feed-blocked')

await caption('Press it again to bring them back')
await page.waitForTimeout(900)
await page.keyboard.press('Control+Shift+7')
await page.waitForTimeout(1600)
await page.keyboard.press('Control+Shift+7')
await waitForHidden('data-ltfb-feed-hidden', 'feed-reblocked')
await page.waitForTimeout(1200)

await caption('My Network')
await moveTo(
  page.locator('header a[href*="/mynetwork/"]').first(),
  'network-link',
)
await click()
await page.waitForURL(NETWORK_URL)
await waitForHidden('data-ltfb-network-suggestions-hidden', 'network-blocked')
await page.waitForTimeout(600)
// A full page load, so the caption element is new.
await caption('Invitations stay. Puzzles, Premium and suggestions go')
await page.waitForTimeout(3200)

await cdp.send('Page.stopScreencast')
const end = Date.now() / 1000
log(
  'hidden on My Network:',
  await hiddenCount('data-ltfb-network-puzzle-hidden'),
  await hiddenCount('data-ltfb-network-premium-hidden'),
  await hiddenCount('data-ltfb-network-suggestions-hidden'),
)
await still('network-blocked')

fs.writeFileSync(
  path.join(outDir, 'frames.json'),
  JSON.stringify(
    frames.map((frame, index) => ({
      file: frame.file,
      duration: Math.max(
        (frames[index + 1]?.timestamp ?? end) - frame.timestamp,
        0.01,
      ),
    })),
    null,
    2,
  ),
)
log('frames', frames.length)

// The popup at 2x, with every section on, which is how it installs.
await setSettings(allSections(true))
const popup = await context.newPage()
await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`)
const popupBox = await popup.locator('.popup-container').boundingBox()
const popupCdp = await context.newCDPSession(popup)
await popupCdp.send('Emulation.setDeviceMetricsOverride', {
  width: 320,
  height: Math.ceil(popupBox.height),
  deviceScaleFactor: 2,
  mobile: false,
})
const { data: popupPng } = await popupCdp.send('Page.captureScreenshot', {
  format: 'png',
})
fs.writeFileSync(
  path.join(outDir, 'popup.png'),
  Buffer.from(popupPng, 'base64'),
)
log('still popup')

await shutdown(0, 'done')
