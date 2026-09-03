// Prints what the running extension actually sees, rather than what the source
// says it should. LinkedIn's markup is brittle by constraint and the content
// script is route-gated, so "the selector missed" and "the route table does not
// list this section here" look identical from the outside. This is the command
// that tells them apart without reading code.
//
// Everything below is read out of the live browser: the worker's own view of
// its id and permissions, the tabs it can see, the popup rendered against real
// storage, and the managed attributes on the page. Nothing is defaulted, and a
// field that could not be read says so rather than reporting a plausible value.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { printHelpAndExit } from './help.mjs'
import { resolveChromiumExecutable } from './browsers.mjs'

printHelpAndExit(`
Usage: pnpm inspect:chrome [url] [--help]

Loads dist/ in a headed Chromium, opens a LinkedIn URL, and prints a JSON
snapshot of the running extension: its id, the permissions the browser actually
granted, the resolved chrome.commands binding, the tabs the worker can see,
storage contents, the popup's rendered controls, and the data-ltfb-* attributes
currently on the page. Then it closes.

The point is getting the browser's answer before reasoning from the source.
Fields it could not read are reported as an error string, never as a default:
a snapshot that invents plausible state is worse than no snapshot.

Signed out, LinkedIn redirects the supported routes to an auth wall and the
content script correctly matches nothing. The snapshot says which page it
landed on so that is visible rather than confusing.

Environment
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium-family binary to launch
  INSPECT_PROFILE_DIR             reuse a profile directory instead of a
                                  throwaway one; point it at
                                  .e2e/linkedin-real-profile to inspect a
                                  signed-in session
  INSPECT_SETTLE_MS               how long to let the page settle before
                                  reading it (default: 4000)

Note: pnpm inspect:chrome builds dist/ before this script runs, so run
node scripts/inspect-chromium.mjs --help to read this without building.

See docs/testing.md.
`)

// Imported after the help check rather than at the top, so `--help` answers
// without paying for Playwright's module graph.
const { chromium } = await import('@playwright/test')

const extensionPath = path.resolve(process.cwd(), 'dist')
const startUrl = process.argv[2] ?? 'https://www.linkedin.com/feed/'
const settleMs = Number(process.env.INSPECT_SETTLE_MS ?? 4000)
const reusedProfile = process.env.INSPECT_PROFILE_DIR
const profileDir = path.resolve(
  process.cwd(),
  reusedProfile ??
    path.join('node_modules', '.tmp', 'chromium-profiles', 'inspect'),
)

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build first.`,
  )
}

if (!reusedProfile) {
  fs.rmSync(profileDir, { recursive: true, force: true })
}
fs.mkdirSync(profileDir, { recursive: true })

/**
 * Runs one read and keeps the failure in the snapshot instead of aborting the
 * run or substituting a default. A partial snapshot that says which part is
 * missing is still usable; one that quietly fills a gap is not.
 */
const attempt = async read => {
  try {
    return await read()
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const executablePath = resolveChromiumExecutable()
const context = await chromium.launchPersistentContext(profileDir, {
  ...(executablePath ? { executablePath } : { channel: 'chromium' }),
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
})

const snapshot = {
  binary: executablePath ?? 'channel: chromium',
  profile: path.relative(process.cwd(), profileDir),
  profileReused: Boolean(reusedProfile),
}

try {
  const isExtensionWorker = worker =>
    worker.url().startsWith('chrome-extension://')

  const worker =
    context.serviceWorkers().find(isExtensionWorker) ??
    (await context.waitForEvent('serviceworker', {
      predicate: isExtensionWorker,
      timeout: 30_000,
    }))

  const extensionId = new URL(worker.url()).hostname
  snapshot.extensionId = extensionId
  snapshot.workerUrl = worker.url()

  // The manifest's declared permissions and the ones the browser granted are
  // different questions, and only the second one explains a failing call.
  snapshot.grantedPermissions = await attempt(() =>
    worker.evaluate(
      () =>
        new Promise(resolve => {
          chrome.permissions.getAll(resolve)
        }),
    ),
  )

  // The binding the browser resolved, which is not always the manifest's
  // suggested one: Chrome drops a suggested key that collides with something
  // it already owns, and the in-page fallback then matches keys nothing is
  // bound to. `src/shared/shortcut.ts` exists because of this.
  snapshot.commands = await attempt(() =>
    worker.evaluate(
      () =>
        new Promise(resolve => {
          chrome.commands.getAll(resolve)
        }),
    ),
  )

  snapshot.storage = await attempt(() =>
    worker.evaluate(
      () =>
        new Promise(resolve => {
          chrome.storage.local.get(null, resolve)
        }),
    ),
  )

  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settleMs)

  // Asked of the worker, not of Playwright, because what matters is which tabs
  // the extension can see through its host permissions.
  snapshot.visibleTabs = await attempt(() =>
    worker.evaluate(
      () =>
        new Promise(resolve => {
          chrome.tabs.query({}, tabs => {
            resolve(
              tabs.map(tab => ({
                id: tab.id,
                url: tab.url,
                active: tab.active,
              })),
            )
          })
        }),
    ),
  )

  // The managed attributes are what makes restore possible, so they are also
  // the evidence that blocking took hold. Read off the live page rather than
  // restated here, so a new section appears with no change to this file.
  snapshot.page = await attempt(() =>
    page.evaluate(() => {
      const managed = Array.from(
        document.querySelectorAll('[data-ltfb-feed-hidden]'),
      )
      const all = Array.from(document.querySelectorAll('*')).flatMap(element =>
        Array.from(element.attributes)
          .filter(attribute => attribute.name.startsWith('data-ltfb-'))
          .map(attribute => ({
            attribute: attribute.name,
            value: attribute.value,
            display: getComputedStyle(element).display,
            tag: element.tagName.toLowerCase(),
          })),
      )

      return {
        href: location.href,
        pathname: location.pathname,
        title: document.title,
        managedElements: all,
        managedAttributes: [
          ...new Set(all.map(entry => entry.attribute)),
        ].sort(),
        stillVisible: all.filter(entry => entry.display !== 'none').length,
        feedMarkedCount: managed.length,
      }
    }),
  )

  snapshot.popup = await attempt(async () => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`)
    // `attached`, not the default `visible`: the popup styles the native
    // checkbox out of view and paints a switch over it, so waiting for
    // visibility waits for something that never happens.
    await popup.waitForSelector('input[type=checkbox]', { state: 'attached' })

    const controls = await popup.evaluate(() =>
      Array.from(document.querySelectorAll('label'))
        .filter(label => label.querySelector('input[type=checkbox]'))
        .map(label => ({
          label: label.textContent?.replace(/\s+/g, ' ').trim(),
          checked: label.querySelector('input[type=checkbox]').checked,
        })),
    )

    await popup.close()
    return { controls }
  })
} finally {
  console.log(JSON.stringify(snapshot, null, 2))
  await context.close()
}
