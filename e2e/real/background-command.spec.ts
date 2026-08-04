import { test, expect } from '../fixtures/realExtension'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../../src/shared/shortcut'

const TOGGLE_COMMAND = 'toggle-current-page-block'

type RegisteredCommand = chrome.commands.Command

/**
 * Guards the regression that shipped: both entry files were named `main.ts`, so
 * crxjs emitted `service-worker-loader.js` importing the *content script* chunk.
 * A service worker still registered, so its presence proves nothing — these
 * assertions check that the code running inside it is the background script.
 *
 * Needs the extension loaded but not a LinkedIn session, so it runs without the
 * `RUN_REAL_LINKEDIN_E2E` gate the selector smoke tests sit behind.
 */
test.describe('background command registration', () => {
  test('the service worker runs the background chunk', async ({
    extensionContext,
  }) => {
    const worker = extensionContext.serviceWorkers()[0]
    expect(worker.url()).toContain('service-worker-loader.js')

    const commands = (await worker.evaluate(
      () =>
        new Promise(resolve => {
          chrome.commands.getAll(resolve)
        }),
    )) as RegisteredCommand[]

    const toggle = commands.find(command => command.name === TOGGLE_COMMAND)
    expect(toggle, `${TOGGLE_COMMAND} must be registered`).toBeTruthy()
    expect(
      toggle?.shortcut,
      'the command must have a live binding',
    ).toBeTruthy()

    // The listener the broken build never registered.
    const hasListener = await worker.evaluate(() =>
      chrome.commands.onCommand.hasListeners(),
    )
    expect(hasListener, 'onCommand listener must be registered').toBe(true)
  })

  test('the live binding is mirrored into storage', async ({
    extensionContext,
  }) => {
    const worker = extensionContext.serviceWorkers()[0]

    const commands = (await worker.evaluate(
      () =>
        new Promise(resolve => {
          chrome.commands.getAll(resolve)
        }),
    )) as RegisteredCommand[]
    const bound = commands.find(
      command => command.name === TOGGLE_COMMAND,
    )?.shortcut

    // Only the background script writes this key, so a matching value is
    // independent proof that the background module body ran.
    const mirrored = await worker.evaluate(
      key =>
        new Promise(resolve => {
          chrome.storage.local.get(key, result => resolve(result[key]))
        }),
      TOGGLE_SHORTCUT_STORAGE_KEY,
    )

    expect(mirrored).toBe(bound)
  })
})
