// Runtime validation for the Firefox build. Firefox exposes WebDriver BiDi on
// --remote-debugging-port, and BiDi's webExtension.install accepts an unpacked
// directory, so the packaged extension can be driven in a real Firefox without
// geckodriver, Playwright, or a signed build.
//
// Unlike the adjacent TikTok blocker, the surfaces this extension blocks are
// behind a LinkedIn login, so the page checks need an authenticated profile.
// The profile is persistent for exactly that reason: run headed once, sign in,
// and every later run reuses the session. Without one the extension-level
// checks still run and the page checks report SKIP.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { printHelpAndExit } from './help.mjs'
import { resolveGeckoBinary } from './browsers.mjs'

printHelpAndExit(`
Usage: pnpm validate:firefox [--help]

Drives the built Firefox extension in a real Firefox over WebDriver BiDi and
checks that the add-on installs, the background script runs, the popup renders
and persists its toggles, and the toggle command is bound. With a signed-in
profile it also visits real LinkedIn pages and checks hiding, restoring, the
in-page shortcut, and that pending invitations stay visible. Writes screenshots
and validation.json under test-results/firefox/<binary>, and exits non-zero if
any check fails. Requires a dist-firefox/ build.

The profile is persistent, at node_modules/.tmp/gecko-profiles/<binary>. Run
once with FIREFOX_VALIDATE_HEADED=1, sign in to LinkedIn in the window it
opens, and the page checks run on every later invocation. Until then they are
reported as SKIP, never as passes.

Environment
  FIREFOX_BINARY           Firefox-family binary to drive
                           (default: /usr/bin/firefox); set this to validate
                           Zen or another fork
  FIREFOX_VALIDATE_HEADED  set to 1 to watch the run, and to sign in; headless
                           otherwise
  FIREFOX_VALIDATE_PORT    remote debugging port (default: 9334)
  FIREFOX_PROFILE_DIR      override the persistent profile directory

Note: pnpm validate:firefox builds dist-firefox/ before this script runs, so
run node scripts/validate-firefox.mjs --help to read this without building.

See docs/build-targets.md.
`)

const extensionId = 'linkedin-feed-blocker@shbernal.github.io'
// Pinning the internal uuid in the profile makes the popup URL knowable before
// the extension is installed.
const extensionUuid = '8c4d19b7-2a05-4e63-9f1c-6d7b40e2a915'
const extensionOrigin = `moz-extension://${extensionUuid}`
const extensionPath = path.resolve(process.cwd(), 'dist-firefox')
const binary = resolveGeckoBinary()
// Namespaced by binary so a Zen run does not overwrite the Firefox proof, and
// so the two browsers never share a profile.
const proofDir = path.resolve(
  process.cwd(),
  'test-results',
  'firefox',
  path.basename(binary),
)
const profileDir = path.resolve(
  process.cwd(),
  process.env.FIREFOX_PROFILE_DIR ??
    path.join('node_modules', '.tmp', 'gecko-profiles', path.basename(binary)),
)
const headless = process.env.FIREFOX_VALIDATE_HEADED !== '1'
const remotePort = Number(process.env.FIREFOX_VALIDATE_PORT ?? 9334)
const viewport = { width: 1280, height: 900 }
const settleMs = 6000

// The routes `src/content/routes.ts` supports, and what each is here to prove.
const routes = [
  {
    key: 'feed',
    label: 'Home feed',
    url: 'https://www.linkedin.com/feed/',
    pathname: '/feed/',
  },
  {
    key: 'mynetwork',
    label: 'My Network',
    url: 'https://www.linkedin.com/mynetwork/grow/',
    pathname: '/mynetwork/grow/',
  },
]

// The popup's full control set, in render order. Asserting the labels rather
// than a count means adding or renaming a control fails here with the label in
// the message instead of an off-by-one.
const popupControlLabels = [
  'Block all sections',
  'Block feed',
  'Block right feed',
  'Block puzzle',
  'Block Premium',
  'Block suggestions',
]

// Matches `DEFAULT_TOGGLE_SHORTCUT` and the manifest's `suggested_key`.
const toggleShortcut = 'Ctrl+Shift+7'

const checks = []

const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const skip = (name, detail) => {
  checks.push({ name, skipped: true, detail })
  console.log(`SKIP  ${name}${detail ? `: ${detail}` : ''}`)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Persistent, so a LinkedIn session survives between runs. The page checks
// have no other way to reach a logged-in feed. `user.js` is rewritten each
// time, which is how a pref change takes effect without discarding the session.
const prepareProfile = () => {
  fs.mkdirSync(profileDir, { recursive: true })

  const prefs = [
    `user_pref("extensions.webextensions.uuids", "{\\"${extensionId}\\":\\"${extensionUuid}\\"}");`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
  ]
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${prefs.join('\n')}\n`)

  // The run ends in SIGKILL, so the previous process never released its lock.
  // Firefox recovers from a stale lock on the same host, but not reliably
  // enough to leave a hung "profile is in use" dialog as a possible outcome.
  for (const lock of ['lock', '.parentlock']) {
    fs.rmSync(path.join(profileDir, lock), { force: true })
  }

  return profileDir
}

const connect = async (url, attempts = 60) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = new WebSocket(url)
        socket.addEventListener('open', () => resolve(socket), { once: true })
        socket.addEventListener('error', reject, { once: true })
      })
    } catch {
      await wait(500)
    }
  }

  throw new Error(`Could not reach the Firefox remote agent at ${url}`)
}

const createSession = socket => {
  let nextId = 1
  const pending = new Map()
  const logEntries = []

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)

    if (message.type === 'event') {
      if (message.method === 'log.entryAdded') {
        logEntries.push(message.params)
      }
      return
    }

    const slot = pending.get(message.id)
    if (!slot) {
      return
    }

    pending.delete(message.id)
    if (message.type === 'error') {
      slot.reject(new Error(`${message.error}: ${message.message}`))
      return
    }

    slot.resolve(message.result)
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId
      nextId += 1
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  return { send, logEntries }
}

const evaluate = async (session, context, expression, awaitPromise = false) => {
  const result = await session.send('script.evaluate', {
    expression,
    target: { context },
    awaitPromise,
  })

  if (result.type === 'exception') {
    throw new Error(result.exceptionDetails?.text ?? 'script.evaluate threw')
  }

  return result.result
}

const readJson = async (session, context, expression, awaitPromise = false) => {
  const result = await evaluate(session, context, expression, awaitPromise)
  return JSON.parse(result.value)
}

// Settings load asynchronously in every surface, so reads have to be retried
// rather than assumed settled after a fixed delay.
const waitForJson = async (
  session,
  context,
  expression,
  predicate,
  { awaitPromise = false, timeoutMs = 20000, intervalMs = 250 } = {},
) => {
  const deadline = Date.now() + timeoutMs
  let latest = await readJson(session, context, expression, awaitPromise)

  while (!predicate(latest) && Date.now() < deadline) {
    await wait(intervalMs)
    latest = await readJson(session, context, expression, awaitPromise)
  }

  return latest
}

// Zen refuses moz-extension:// navigations in a freshly created tab, so fall
// back to a separate window when a tab will not take the URL.
const openContext = async (session, url) => {
  for (const type of ['tab', 'window']) {
    const created = await session.send('browsingContext.create', { type })
    try {
      await session.send('browsingContext.navigate', {
        context: created.context,
        url,
        wait: 'complete',
      })
      return created.context
    } catch (error) {
      if (type === 'window') {
        throw error
      }
    }
  }

  throw new Error(`Could not open ${url}`)
}

const screenshot = async (session, context, name) => {
  const shot = await session.send('browsingContext.captureScreenshot', {
    context,
  })
  fs.mkdirSync(proofDir, { recursive: true })
  const file = path.join(proofDir, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return file
}

const clickElement = async (session, context, selectorExpression) => {
  const node = await evaluate(session, context, selectorExpression)
  if (!node.sharedId) {
    throw new Error(`No element for ${selectorExpression}`)
  }

  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        actions: [
          {
            type: 'pointerMove',
            x: 0,
            y: 0,
            origin: { type: 'element', element: { sharedId: node.sharedId } },
          },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  })
}

const pressToggleShortcut = async (session, context) => {
  // WebDriver normalized key values for the modifiers.
  const control = String.fromCharCode(0xe009)
  const shift = String.fromCharCode(0xe008)
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'key',
        id: 'keyboard',
        actions: [
          { type: 'keyDown', value: control },
          { type: 'keyDown', value: shift },
          { type: 'keyDown', value: '7' },
          { type: 'keyUp', value: '7' },
          { type: 'keyUp', value: shift },
          { type: 'keyUp', value: control },
        ],
      },
    ],
  })
}

// Hiding is inline `display: none` plus a per-section managed attribute, and
// the attribute is what makes restore possible, so it is also what proves
// blocking took hold. The names are read out of the built bundle rather than
// restated here: they are plain string literals in `src/content/selectors.ts`
// and survive minification, so adding a section puts it under validation with
// no change to this file.
const readManagedAttributes = () => {
  const assets = path.join(extensionPath, 'assets')
  const found = new Set()

  for (const file of fs.readdirSync(assets)) {
    if (!file.endsWith('.js')) {
      continue
    }

    const source = fs.readFileSync(path.join(assets, file), 'utf8')
    for (const match of source.matchAll(/data-ltfb-[a-z-]+-hidden/g)) {
      found.add(match[0])
    }
  }

  if (found.size === 0) {
    throw new Error(
      `No data-ltfb-*-hidden attributes found in ${assets}; the built content ` +
        'script no longer looks like the one this validates',
    )
  }

  return [...found].sort()
}

// The anchor that keeps the invitation area visible. `selectors.ts` treats only
// sections rendered after it as suggestions, so if this element is ever hidden
// the rule that protects it has broken.
const invitationsSelector =
  'section[componentkey="pending-invitations-preview"]'

// Serialized in the page, so this has to be a self-contained expression.
const buildPageStateExpression = attributes => `JSON.stringify((() => {
  const attributes = ${JSON.stringify(attributes)}
  const managed = attributes.flatMap(attribute =>
    Array.from(document.querySelectorAll('[' + attribute + '="true"]')).map(element => ({
      attribute,
      display: getComputedStyle(element).display,
    })),
  )
  const invitations = document.querySelector(${JSON.stringify(invitationsSelector)})

  return {
    href: location.href,
    pathname: location.pathname,
    managedCount: managed.length,
    managedAttributes: Array.from(new Set(managed.map(entry => entry.attribute))).sort(),
    visibleManagedCount: managed.filter(entry => entry.display !== 'none').length,
    invitationsPresent: invitations !== null,
    invitationsVisible:
      invitations !== null && getComputedStyle(invitations).display !== 'none',
  }
})())`

// A route counts as blocked only when the extension marked at least one element
// and every element it marked actually computes to `display: none`. Requiring a
// match is what keeps this from going green against a page LinkedIn has renamed
// out from under it.
const routeBlocked = state =>
  state.managedCount > 0 && state.visibleManagedCount === 0

const describeRoute = state =>
  `${state.managedCount - state.visibleManagedCount}/${state.managedCount} ` +
  `marked elements hidden (${state.managedAttributes.join(', ') || 'none matched'})`

const popupControlsExpression = `JSON.stringify(
  Array.from(document.querySelectorAll('label'))
    .filter(label => label.querySelector('input[type=checkbox]'))
    .map(label => [
      label.textContent.replace(/\\s+/g, ' ').trim(),
      label.querySelector('input[type=checkbox]').checked,
    ]),
)`

const readStorageExpression = `new Promise(resolve => {
  chrome.storage.local.get(null, items => resolve(JSON.stringify(items)))
})`

const commandsExpression = `new Promise(resolve => {
  chrome.commands.getAll(commands => resolve(JSON.stringify(commands)))
})`

// The profile is persistent so a LinkedIn session survives, which means the
// settings a previous run left behind survive too. Dropping the key rather than
// writing a literal object lets the popup's own defaulting path restore it, so
// this never has to restate the settings shape. `toggleShortcut` is deliberately
// left alone: the background script writes it once at startup and would not
// write it again this run.
const resetSettingsExpression = `new Promise(resolve => {
  chrome.storage.local.remove('extensionSettings', () => resolve('"reset"'))
})`

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build:firefox first.`,
  )
}

const pageStateExpression = buildPageStateExpression(readManagedAttributes())

const profile = prepareProfile()
const firefox = spawn(
  binary,
  [
    '--profile',
    profile,
    '--remote-debugging-port',
    String(remotePort),
    '--no-remote',
    ...(headless ? ['--headless'] : []),
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)

const stderr = []
firefox.stderr.on('data', chunk => stderr.push(String(chunk)))

let socket

try {
  socket = await connect(`ws://127.0.0.1:${remotePort}/session`)
  const session = createSession(socket)

  await session.send('session.new', { capabilities: {} })
  await session.send('session.subscribe', { events: ['log.entryAdded'] })

  const installed = await session.send('webExtension.install', {
    extensionData: { type: 'path', path: extensionPath },
  })
  check(
    'extension installs in Firefox',
    installed.extension === extensionId,
    installed.extension,
  )

  // Zen refuses to navigate any context to a moz-extension:// URL, so the
  // extension-page checks are skipped there and the in-page surfaces still run.
  let popupContext = null
  try {
    popupContext = await openContext(
      session,
      `${extensionOrigin}/src/popup/index.html`,
    )
  } catch (error) {
    skip('extension pages are reachable', error.message)
  }

  if (popupContext) {
    await session.send('browsingContext.setViewport', {
      context: popupContext,
      viewport,
    })

    // Every check below assumes blocking starts fully on, and the persistent
    // profile does not guarantee that on a second run.
    await readJson(session, popupContext, resetSettingsExpression, true)
    await session.send('browsingContext.reload', {
      context: popupContext,
      wait: 'complete',
    })

    const popupControls = await waitForJson(
      session,
      popupContext,
      popupControlsExpression,
      controls =>
        controls.length === popupControlLabels.length &&
        controls.every(([, checked]) => checked),
    )
    const renderedLabels = popupControls.map(([label]) => label)
    check(
      'popup renders every section control',
      renderedLabels.length === popupControlLabels.length &&
        popupControlLabels.every(
          (label, index) => renderedLabels[index] === label,
        ),
      JSON.stringify(popupControls),
    )
    // Not decoration: it is what makes the toggle checks below mean something.
    // Without it a leftover disabled section turns a click that re-enables a
    // section into a "toggle did not persist" failure.
    check(
      'settings start from defaults, with every section blocked',
      popupControls.every(([, checked]) => checked),
      JSON.stringify(popupControls),
    )

    const commands = await readJson(
      session,
      popupContext,
      commandsExpression,
      true,
    )
    const toggleCommand = commands.find(
      entry => entry.name === 'toggle-current-page-block',
    )
    check(
      'browser registers the toggle command shortcut',
      toggleCommand?.shortcut === toggleShortcut,
      JSON.stringify(toggleCommand),
    )

    // Gecko runs the background entry as a plain script, not a service worker,
    // and `chrome.commands.getAll` there is callback-only. This key exists only
    // if that background script ran and its callback fired, so it is the check
    // that the Firefox background target works at all.
    const mirrored = await waitForJson(
      session,
      popupContext,
      readStorageExpression,
      stored => typeof stored.toggleShortcut === 'string',
      { awaitPromise: true },
    )
    check(
      'background script mirrors the shortcut into storage',
      mirrored.toggleShortcut === toggleShortcut,
      JSON.stringify(mirrored.toggleShortcut),
    )
  }

  const linkedInContext = await openContext(session, routes[0].url)
  await session.send('browsingContext.setViewport', {
    context: linkedInContext,
    viewport,
  })
  await wait(settleMs)

  // Logged out, LinkedIn redirects every supported route to its marketing page
  // or an auth wall, so the content script's route check correctly matches
  // nothing. That is a missing precondition, not a failure. See --help for how
  // to sign the persistent profile in.
  const landing = await readJson(session, linkedInContext, pageStateExpression)
  const signedIn = landing.pathname.startsWith('/feed')

  if (!signedIn) {
    skip(
      'LinkedIn session is signed in',
      `landed on ${landing.pathname}; run headed once and sign in to enable ` +
        'the page checks',
    )
  } else {
    check('LinkedIn session is signed in', true, landing.pathname)
  }

  for (const route of routes) {
    if (!signedIn) {
      skip(`${route.label}: sections are hidden`, 'needs a signed-in profile')
      continue
    }

    await session.send('browsingContext.navigate', {
      context: linkedInContext,
      url: route.url,
      wait: 'complete',
    })
    await wait(settleMs)

    const state = await waitForJson(
      session,
      linkedInContext,
      pageStateExpression,
      routeBlocked,
    )
    check(
      `${route.label}: sections are hidden`,
      routeBlocked(state),
      describeRoute(state),
    )

    if (route.key === 'mynetwork') {
      // The one surface this extension promises to leave alone.
      if (state.invitationsPresent) {
        check(
          'My Network: pending invitations stay visible',
          state.invitationsVisible,
          invitationsSelector,
        )
      } else {
        skip(
          'My Network: pending invitations stay visible',
          `${invitationsSelector} is not on the page`,
        )
      }
    }

    await screenshot(session, linkedInContext, `${route.key}-blocked`)
  }

  // Leave the tab on the feed so the popup and shortcut checks act on it.
  if (signedIn) {
    await session.send('browsingContext.navigate', {
      context: linkedInContext,
      url: routes[0].url,
      wait: 'complete',
    })
    await wait(settleMs)
  }

  if (popupContext) {
    await session.send('browsingContext.activate', { context: popupContext })
    await clickElement(
      session,
      popupContext,
      `Array.from(document.querySelectorAll('label')).find(label => label.textContent.replace(/\\s+/g, ' ').trim() === 'Block feed')`,
    )
    const afterToggle = await waitForJson(
      session,
      popupContext,
      readStorageExpression,
      stored => stored.extensionSettings?.feed === false,
      { awaitPromise: true },
    )
    check(
      'popup toggle persists to storage.local',
      afterToggle.extensionSettings?.feed === false,
      JSON.stringify(afterToggle.extensionSettings),
    )
    check(
      'sections toggle independently',
      afterToggle.extensionSettings?.rightFeed === true &&
        afterToggle.extensionSettings?.networkPuzzle === true &&
        afterToggle.extensionSettings?.networkPremium === true &&
        afterToggle.extensionSettings?.networkSuggestions === true &&
        afterToggle.extensionSettings?.active === true,
      JSON.stringify(afterToggle.extensionSettings),
    )

    await session.send('browsingContext.reload', {
      context: popupContext,
      wait: 'complete',
    })
    const reloaded = await waitForJson(
      session,
      popupContext,
      popupControlsExpression,
      controls =>
        controls.some(([label, checked]) => label === 'Block feed' && !checked),
    )
    check(
      'popup state survives a reload',
      Object.fromEntries(reloaded)['Block feed'] === false &&
        Object.fromEntries(reloaded)['Block right feed'] === true,
      JSON.stringify(reloaded),
    )
    await screenshot(session, popupContext, 'popup-feed-disabled')
  } else {
    skip('popup toggle persists to storage.local', 'needs an extension page')
    skip('sections toggle independently', 'needs an extension page')
    skip('popup state survives a reload', 'needs an extension page')
  }

  if (signedIn && popupContext) {
    const restored = await waitForJson(
      session,
      linkedInContext,
      pageStateExpression,
      state => !state.managedAttributes.includes('data-ltfb-feed-hidden'),
    )
    check(
      'disabling the feed restores the elements it hid',
      !restored.managedAttributes.includes('data-ltfb-feed-hidden'),
      describeRoute(restored),
    )
    await screenshot(session, linkedInContext, 'feed-unblocked')

    await session.send('browsingContext.activate', { context: linkedInContext })
    await pressToggleShortcut(session, linkedInContext)

    const afterShortcut = await waitForJson(
      session,
      linkedInContext,
      pageStateExpression,
      state => state.managedAttributes.includes('data-ltfb-feed-hidden'),
    )
    check(
      `${toggleShortcut} re-blocks the current LinkedIn page`,
      routeBlocked(afterShortcut) &&
        afterShortcut.managedAttributes.includes('data-ltfb-feed-hidden'),
      describeRoute(afterShortcut),
    )

    const afterShortcutStorage = await waitForJson(
      session,
      popupContext,
      readStorageExpression,
      stored => stored.extensionSettings?.feed === true,
      { awaitPromise: true },
    )
    check(
      'shortcut result is persisted',
      afterShortcutStorage.extensionSettings?.feed === true,
      JSON.stringify(afterShortcutStorage.extensionSettings),
    )
    await screenshot(session, linkedInContext, 'feed-reblocked-by-shortcut')
  } else {
    const reason = signedIn
      ? 'needs an extension page'
      : 'needs a signed-in profile'
    skip('disabling the feed restores the elements it hid', reason)
    skip(`${toggleShortcut} re-blocks the current LinkedIn page`, reason)
    skip('shortcut result is persisted', reason)
  }

  const extensionErrors = session.logEntries.filter(
    entry =>
      entry.level === 'error' &&
      JSON.stringify(entry).includes(extensionUuid.slice(0, 8)),
  )
  check(
    'no extension console errors',
    extensionErrors.length === 0,
    extensionErrors.map(entry => entry.text).join(' | ') || '0 errors',
  )

  fs.mkdirSync(proofDir, { recursive: true })
  fs.writeFileSync(
    path.join(proofDir, 'validation.json'),
    `${JSON.stringify({ binary, headless, signedIn, checks }, null, 2)}\n`,
  )
} catch (error) {
  check('validation run completed', false, error.message)
  console.error(stderr.join('').slice(-2000))
} finally {
  try {
    socket?.close()
  } catch {
    // The socket is already gone when Firefox exited on its own.
  }
  firefox.kill('SIGKILL')
}

const failed = checks.filter(entry => !entry.skipped && !entry.ok)
const skipped = checks.filter(entry => entry.skipped)
const ran = checks.length - skipped.length
console.log(
  `\n${ran - failed.length}/${ran} checks passed against ${binary}` +
    (skipped.length > 0 ? `, ${skipped.length} skipped` : ''),
)
console.log(`Proof written to ${path.relative(process.cwd(), proofDir)}`)

if (failed.length > 0) {
  process.exitCode = 1
}
