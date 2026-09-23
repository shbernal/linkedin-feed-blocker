// Writes the Chrome Web Store and AMO screenshot set from the LinkedIn pages
// pnpm media:snapshot saved, with the built extension loaded. Every request is
// answered from that snapshot or refused, so it never contacts LinkedIn and
// never needs a session. Run it through scripts/capture-media.sh, which caps
// node and every Chromium process in a systemd unit.
//
// Nothing is copied into store/screenshots/ for you. The blur selectors are
// checked by eye, not by a test, and these images go on two public listings.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { printHelpAndExit } from './help.mjs'
import { resolveChromiumExecutable } from './browsers.mjs'
import {
  defaultSnapshotDir,
  FEED_URL,
  installSnapshotRoutes,
  NETWORK_URL,
  resolveSnapshot,
} from './snapshot-replay.mjs'

const defaultOutDir = 'media-capture/store'

printHelpAndExit(`
Usage: pnpm store:shots [--help]

Replays the pages saved by pnpm media:snapshot in headless Chromium with dist/
loaded and writes the 1280x800 store screenshot set. Names, faces, and posts
are blurred. Review every image before copying it into store/screenshots/.

The GitHub callout in the set is a designed card rather than a capture, so it
is not written here and is not regenerated.

Environment
  STORE_SHOTS_DIR                 output directory (default: ${defaultOutDir})
  MEDIA_SNAPSHOT_DIR              snapshot to replay (default: ${defaultSnapshotDir})
  STORE_SHOTS_WATCHDOG_MS         give up after this long (default: 180000)
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium-family binary to launch

See docs/chrome-web-store.md.
`)

const WATCHDOG_MS = Number(process.env.STORE_SHOTS_WATCHDOG_MS ?? 180_000)
const MEMORY_ABORT_BYTES = 2.2 * 1024 ** 3
const MIN_AVAILABLE_BYTES = 3 * 1024 ** 3
const WIDTH = 1280
const HEIGHT = 800

// How long a replayed page is given to lay out before it is photographed. The
// snapshot is served from disk, so this is settle time, not network time.
const SETTLE_MS = 4000

const extensionPath = path.resolve(process.cwd(), 'dist')
const outDir = path.resolve(
  process.cwd(),
  process.env.STORE_SHOTS_DIR ?? defaultOutDir,
)
const log = (...args) =>
  console.log(new Date().toISOString().slice(11, 19), ...args)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build first.`,
  )
}

const { pages: snapshotPages, harPath } = resolveSnapshot()

// Refuse to start on a machine that is already short on memory.
const meminfo = fs.readFileSync('/proc/meminfo', 'utf8')
const available = Number(/MemAvailable:\s+(\d+)/.exec(meminfo)[1]) * 1024
if (available < MIN_AVAILABLE_BYTES) {
  log(`only ${(available / 1024 ** 3).toFixed(1)}G available, not starting`)
  process.exit(4)
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
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
if (process.env.MEDIA_CAPTURE_CAPPED === '1') {
  const cgroupPath = fs
    .readFileSync('/proc/self/cgroup', 'utf8')
    .split(':')[2]
    .trim()
  const memoryFile = `/sys/fs/cgroup${cgroupPath}/memory.current`
  setInterval(() => {
    const current = Number(fs.readFileSync(memoryFile, 'utf8'))
    if (current > MEMORY_ABORT_BYTES) {
      shutdown(5, `memory ${(current / 1024 ** 3).toFixed(2)}G over budget`)
    }
  }, 1000)
}

log('launching chromium')
context = await chromium.launchPersistentContext(profile, {
  executablePath: resolveChromiumExecutable(),
  headless: true,
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  timeout: 30_000,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
    '--mute-audio',
    '--renderer-process-limit=4',
    '--disable-background-networking',
  ],
})
context.setDefaultTimeout(15_000)
context.setDefaultNavigationTimeout(30_000)

await installSnapshotRoutes(context, { pages: snapshotPages, harPath })

// Read the id now: an idle MV3 worker can be gone by the end of the run.
const worker =
  context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const extensionId = new URL(worker.url()).hostname
const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html`

const readSettings = () =>
  worker.evaluate(
    () =>
      new Promise(resolve => {
        chrome.storage.local.get('extensionSettings', value =>
          resolve(value.extensionSettings),
        )
      }),
  )

const writeSettings = settings =>
  worker.evaluate(
    value =>
      new Promise(resolve => {
        chrome.storage.local.set({ extensionSettings: value }, resolve)
      }),
    settings,
  )

/**
 * The popup's master switch is what produces the all-off object, and reading it
 * back is what gives this script the section list. Enumerating the sections
 * here instead would leave a second copy of the settings contract to forget: a
 * section added to `ExtensionSettings` would silently stay on in the "before"
 * image, which is the one image whose whole job is showing it off.
 */
const popup = await context.newPage()
await popup.goto(popupUrl)
await popup.waitForSelector('.popup-container')
await popup.getByText('Block all sections').click()
const allOff = await readSettings()

if (!allOff || Object.values(allOff).some(value => value !== false)) {
  throw new Error(
    `the popup master switch did not turn everything off: ${JSON.stringify(allOff)}`,
  )
}

const allOn = Object.fromEntries(
  Object.keys(allOff).map(section => [section, true]),
)
log(`sections read from the popup: ${Object.keys(allOff).length}`)

// Back on before the portrait is taken. The master switch was flipped to read
// the section list, and a popup photographed in that state would show every
// toggle off over a page that is plainly blocked.
await writeSettings(allOn)
await popup.reload()
await popup.waitForSelector('.popup-container')

// The popup at 2x, so it stays crisp composited at its 320px CSS width.
const popupBox = await popup.locator('.popup-container').boundingBox()
const popupCdp = await context.newCDPSession(popup)
await popupCdp.send('Emulation.setDeviceMetricsOverride', {
  width: Math.ceil(popupBox.width),
  height: Math.ceil(popupBox.height),
  deviceScaleFactor: 2,
  mobile: false,
})
const { data: popupPng } = await popupCdp.send('Page.captureScreenshot', {
  format: 'png',
})
await popup.close()
log('captured the popup')

const page = await context.newPage()

const show = async (url, settings) => {
  await writeSettings(settings)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(SETTLE_MS)
}

const write = async (name, buffer) => {
  const file = path.join(outDir, `linkedin-feedblocker-${name}.png`)
  fs.writeFileSync(file, buffer)
  log(`wrote ${path.basename(file)}`)
}

// Home, untouched. Kept as a buffer for the before/after and never written on
// its own: a store listing has no slot for LinkedIn as it already is.
await show(FEED_URL, allOff)
const feedUnblocked = await page.screenshot()

await show(FEED_URL, allOn)
const feedBlocked = await page.screenshot()
await write('2-home-feed-blocked', feedBlocked)

// The popup over the page it governs, in the state it installs in.
await page.evaluate(
  ({ png, width }) => {
    const frame = document.createElement('div')
    frame.style.cssText = `
      position: fixed; z-index: 2147483647; top: 12px; right: 16px;
      width: ${width}px; border-radius: 10px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.16);
    `
    const image = document.createElement('img')
    image.src = `data:image/png;base64,${png}`
    image.style.cssText = 'display: block; width: 100%;'
    frame.appendChild(image)
    document.documentElement.appendChild(frame)
  },
  { png: popupPng, width: Math.ceil(popupBox.width) },
)
await page.waitForTimeout(300)
await write('3-popup-controls', await page.screenshot())

await show(NETWORK_URL, allOn)
await write('4-my-network-blocked', await page.screenshot())

// The before/after lead image. Composited in the browser rather than by
// ImageMagick so the labels use the same font stack as everything else here.
const composite = await context.newPage()
await composite.setContent(
  `<!doctype html>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px;
      background: #F4F2EE; display: flex; flex-direction: column;
      gap: 22px; padding: 32px;
      font: 700 27px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI',
        Roboto, sans-serif;
    }
    /* Stacked full-width bands rather than two pages side by side. Half a
     * 1280x800 frame cannot hold a 1280x800 page at a useful size, and cropping
     * one to fit slices the right rail, which is most of what goes away. */
    /* min-height:0 on both: a flex item defaults to min-height:auto, so the
     * full-height image refuses to shrink, the first band takes the whole
     * frame and the second is pushed off the bottom. */
    .panel {
      flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px;
    }
    .label { color: #5B6670; }
    .label.on { color: #0A66C2; }
    .shot {
      flex: 1; min-height: 0; border-radius: 8px; overflow: hidden;
      background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,.14);
    }
    .shot img {
      display: block; width: 100%; height: 100%;
      object-fit: cover; object-position: top;
    }
  </style>
  <div class="panel">
    <div class="label">LinkedIn as it ships</div>
    <div class="shot"><img src="data:image/png;base64,${feedUnblocked.toString('base64')}"></div>
  </div>
  <div class="panel">
    <div class="label on">With LinkedIn Feed Blocker</div>
    <div class="shot"><img src="data:image/png;base64,${feedBlocked.toString('base64')}"></div>
  </div>`,
)
await composite.waitForTimeout(500)
await write('1-before-after', await composite.screenshot())

log(`done; review every image in ${outDir} before copying it into store/`)

// The watchdog timer holds the event loop open, so the run has to exit through
// shutdown rather than falling off the end. Without this the unit sits idle
// until RuntimeMaxSec kills it and the stage reports a failure it did not have.
await shutdown(0, 'done')
