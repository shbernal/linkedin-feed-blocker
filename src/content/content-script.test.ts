import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_ACTIVE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  type ExtensionSettings,
} from '../shared/settings'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../shared/shortcut'
import { getChromeMock } from '../test/chrome'
import { FEED_BODY, getFixtureBody } from '../test/fixtures/linkedin'
import { clearAllBlocking } from './blocking'
import { isBlockingReady, READY_FALLBACK_MS } from './blockingStyles'

type ContentScriptModule = typeof import('./content-script')

let contentScript: ContentScriptModule | null = null

// Module state (current settings, the parsed shortcut, the observer) lives at
// module scope, so every test gets its own instance rather than inheriting the
// previous test's toggle history.
const loadContentScript = async () => {
  vi.resetModules()
  contentScript = await import('./content-script')
  contentScript.initContentScript()
  return contentScript
}

const renderRoute = (pathname: string) => {
  window.history.replaceState({}, '', pathname)
  document.body.innerHTML = getFixtureBody(pathname)
}

const isHidden = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) {
    throw new Error(`Fixture is missing ${selector}`)
  }
  return getComputedStyle(element).display === 'none'
}

const storedSettings = () => {
  return getChromeMock().storage.local.snapshot()[SETTINGS_STORAGE_KEY] as
    | ExtensionSettings
    | undefined
}

const pressKey = (init: KeyboardEventInit, target: EventTarget = document) => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

const sendRuntimeMessage = (message: unknown) => {
  const sendResponse = vi.fn()
  const results = getChromeMock().runtime.onMessage.emit(
    message,
    {} as chrome.runtime.MessageSender,
    sendResponse,
  )

  return { sendResponse, results }
}

const NOTHING_BLOCKED: ExtensionSettings = {
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPremium: false,
  networkSuggestions: false,
  jobSidebar: false,
  navBadges: false,
  navPremium: false,
}

const EVERYTHING_BLOCKED: ExtensionSettings = {
  active: true,
  feed: true,
  rightFeed: true,
  networkPuzzle: true,
  networkPremium: true,
  networkSuggestions: true,
  jobSidebar: true,
  navBadges: true,
  navPremium: true,
}

beforeEach(() => {
  renderRoute('/feed/')
})

// The shared `document.body.innerHTML = ''` in `src/test/setup.ts` does not
// undo the managed attributes, so blocking state has to be cleared explicitly
// or it leaks into the next test. This is the same pair `import.meta.hot`
// runs on dispose, so teardown here matches production.
afterEach(() => {
  contentScript?.cleanupContentScript()
  clearAllBlocking()
  contentScript = null
})

describe('startup', () => {
  it('applies stored settings to the current route', async () => {
    getChromeMock().storage.local.seed({
      [SETTINGS_STORAGE_KEY]: { ...NOTHING_BLOCKED, active: true, feed: true },
    })

    await loadContentScript()

    expect(isHidden('#main-feed')).toBe(true)
    expect(isHidden('#right-rail-games')).toBe(false)
  })

  it('defaults to blocking everything on a fresh install', async () => {
    await loadContentScript()

    expect(isHidden('#main-feed')).toBe(true)
    expect(isHidden('#right-rail-games')).toBe(true)
    expect(storedSettings()).toEqual(EVERYTHING_BLOCKED)
  })

  // The pre-settings-object storage key. Users who had turned the extension
  // off must not find every section blocked again after an update.
  it('honours the legacy extensionActive key', async () => {
    getChromeMock().storage.local.seed({
      [LEGACY_ACTIVE_STORAGE_KEY]: false,
    })

    await loadContentScript()

    expect(isHidden('#main-feed')).toBe(false)
    expect(storedSettings()).toEqual(NOTHING_BLOCKED)
  })

  it('normalizes what it read back into storage', async () => {
    getChromeMock().storage.local.seed({
      [SETTINGS_STORAGE_KEY]: { feedPuzzle: false },
    })

    await loadContentScript()

    expect(storedSettings()).toEqual({
      ...EVERYTHING_BLOCKED,
      rightFeed: false,
    })
  })

  it('blocks nothing on an unsupported route', async () => {
    renderRoute('/jobs/')

    await loadContentScript()

    expect(isHidden('#right-rail-games')).toBe(false)
    expect(isHidden('#right-rail-ad-image')).toBe(false)
  })
})

describe('storage changes', () => {
  it('re-applies when another surface writes settings', async () => {
    await loadContentScript()
    expect(isHidden('#main-feed')).toBe(true)

    getChromeMock().storage.local.set({
      [SETTINGS_STORAGE_KEY]: NOTHING_BLOCKED,
    })

    expect(isHidden('#main-feed')).toBe(false)
  })

  it('ignores changes from another storage area', async () => {
    await loadContentScript()

    getChromeMock().storage.onChanged.emit(
      { [SETTINGS_STORAGE_KEY]: { newValue: NOTHING_BLOCKED } },
      'sync',
    )

    expect(isHidden('#main-feed')).toBe(true)
  })

  it('ignores unrelated keys', async () => {
    await loadContentScript()

    getChromeMock().storage.local.set({ somethingElse: 1 })

    expect(isHidden('#main-feed')).toBe(true)
  })
})

describe('runtime messages', () => {
  it('applies settings pushed from the popup', async () => {
    await loadContentScript()

    const { sendResponse } = sendRuntimeMessage({
      action: 'updateSettings',
      settings: NOTHING_BLOCKED,
    })

    expect(isHidden('#main-feed')).toBe(false)
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('toggles the current page for the keyboard command', async () => {
    await loadContentScript()
    expect(isHidden('#main-feed')).toBe(true)

    const { sendResponse } = sendRuntimeMessage({
      action: 'toggleCurrentPageBlock',
    })

    expect(isHidden('#main-feed')).toBe(false)
    expect(isHidden('#right-rail-games')).toBe(false)
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
    expect(storedSettings()).toMatchObject({ feed: false, rightFeed: false })
  })

  it('reports failure when the route has nothing to toggle', async () => {
    renderRoute('/jobs/')
    await loadContentScript()

    const { sendResponse } = sendRuntimeMessage({
      action: 'toggleCurrentPageBlock',
    })

    expect(sendResponse).toHaveBeenCalledWith({ success: false })
  })

  // Only some of the route's sections being on still means "turn them all on".
  it('turns a partially blocked route fully on before turning it off', async () => {
    getChromeMock().storage.local.seed({
      [SETTINGS_STORAGE_KEY]: { ...NOTHING_BLOCKED, feed: true },
    })
    await loadContentScript()

    sendRuntimeMessage({ action: 'toggleCurrentPageBlock' })

    expect(storedSettings()).toMatchObject({ feed: true, rightFeed: true })
  })

  it('leaves messages it does not understand alone', async () => {
    await loadContentScript()

    const { sendResponse, results } = sendRuntimeMessage({ action: 'whatever' })

    expect(sendResponse).not.toHaveBeenCalled()
    expect(results).toEqual([false])
  })
})

describe('the in-page shortcut fallback', () => {
  it('answers the binding the background script mirrored', async () => {
    getChromeMock().storage.local.seed({
      [TOGGLE_SHORTCUT_STORAGE_KEY]: 'Alt+Shift+P',
    })
    await loadContentScript()

    pressKey({ code: 'Digit7', ctrlKey: true, shiftKey: true })
    expect(isHidden('#main-feed')).toBe(true)

    const event = pressKey({ code: 'KeyP', altKey: true, shiftKey: true })
    expect(isHidden('#main-feed')).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it('falls back to the manifest binding when the command is unbound', async () => {
    getChromeMock().storage.local.seed({ [TOGGLE_SHORTCUT_STORAGE_KEY]: '' })
    await loadContentScript()

    pressKey({ code: 'Digit7', ctrlKey: true, shiftKey: true })

    expect(isHidden('#main-feed')).toBe(false)
  })

  it('picks up a rebind without a reload', async () => {
    await loadContentScript()

    getChromeMock().storage.local.set({
      [TOGGLE_SHORTCUT_STORAGE_KEY]: 'Alt+Shift+P',
    })

    pressKey({ code: 'Digit7', ctrlKey: true, shiftKey: true })
    expect(isHidden('#main-feed')).toBe(true)

    pressKey({ code: 'KeyP', altKey: true, shiftKey: true })
    expect(isHidden('#main-feed')).toBe(false)
  })

  it('stays out of the way while the user is typing', async () => {
    await loadContentScript()
    const input = document.createElement('input')
    document.body.append(input)

    const event = pressKey(
      { code: 'Digit7', ctrlKey: true, shiftKey: true },
      input,
    )

    expect(isHidden('#main-feed')).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it('does not claim the key on a route it cannot toggle', async () => {
    renderRoute('/jobs/')
    await loadContentScript()

    const event = pressKey({ code: 'Digit7', ctrlKey: true, shiftKey: true })

    expect(event.defaultPrevented).toBe(false)
  })

  // Chrome delivers the command to the background script as well, which then
  // messages this tab. Without the suppression window the page would toggle
  // twice and land back where it started.
  it('suppresses the background echo of a shortcut it already handled', async () => {
    await loadContentScript()

    pressKey({ code: 'Digit7', ctrlKey: true, shiftKey: true })
    expect(isHidden('#main-feed')).toBe(false)

    const { sendResponse } = sendRuntimeMessage({
      action: 'toggleCurrentPageBlock',
    })

    expect(isHidden('#main-feed')).toBe(false)
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })
})

describe('the mutation observer', () => {
  it('blocks content LinkedIn streams in after the first pass', async () => {
    document.body.innerHTML = ''
    await loadContentScript()
    vi.useFakeTimers()

    document.body.innerHTML = FEED_BODY
    expect(isHidden('#main-feed')).toBe(false)

    await vi.advanceTimersByTimeAsync(100)

    expect(isHidden('#main-feed')).toBe(true)
  })

  // The observer coalesces a burst into one scheduled pass; a polling interval
  // is deliberately not the mechanism here.
  it('coalesces a burst of mutations into a single pass', async () => {
    await loadContentScript()
    vi.useFakeTimers()
    const applySpy = vi.spyOn(document, 'querySelectorAll')

    for (let index = 0; index < 20; index += 1) {
      document.body.append(document.createElement('div'))
    }
    await vi.advanceTimersByTimeAsync(100)
    const afterFirstBurst = applySpy.mock.calls.length

    await vi.advanceTimersByTimeAsync(1_000)

    expect(afterFirstBurst).toBeGreaterThan(0)
    expect(applySpy.mock.calls.length).toBe(afterFirstBurst)
  })

  it('ignores mutations that add no elements', async () => {
    await loadContentScript()
    vi.useFakeTimers()
    const applySpy = vi.spyOn(document, 'querySelectorAll')

    document.body.append(document.createTextNode('streamed text'))
    await vi.advanceTimersByTimeAsync(100)

    expect(applySpy).not.toHaveBeenCalled()
  })
})

describe('teardown', () => {
  it('unwires every listener and stops re-applying', async () => {
    const module = await loadContentScript()
    const chromeMock = getChromeMock()

    module.cleanupContentScript()
    vi.useFakeTimers()

    expect(chromeMock.runtime.onMessage.listeners()).toHaveLength(0)
    expect(chromeMock.storage.onChanged.listeners()).toHaveLength(0)

    document.body.innerHTML = ''
    document.body.innerHTML = FEED_BODY
    await vi.advanceTimersByTimeAsync(1_000)

    expect(isHidden('#main-feed')).toBe(false)

    pressKey({ code: 'Digit7', ctrlKey: true, shiftKey: true })
    expect(isHidden('#main-feed')).toBe(false)
  })

  it('leaves the page visible rather than half-hidden', async () => {
    const module = await loadContentScript()
    expect(isHidden('#main-feed')).toBe(true)

    module.cleanupContentScript()
    clearAllBlocking()

    expect(isHidden('#main-feed')).toBe(false)
    expect(document.querySelectorAll('[data-ltfb-feed-hidden]')).toHaveLength(0)
  })
})

// The document_start stylesheet hides the feed route's targets while the gate
// is absent, so anything that leaves it absent leaves LinkedIn blank. These
// cover the three ways it has to end up set.
describe('the pre-paint gate', () => {
  it('is cleared once the settings read lands', async () => {
    expect(isBlockingReady()).toBe(false)

    await loadContentScript()

    expect(isBlockingReady()).toBe(true)
  })

  it('is cleared on a timer when the settings read never returns', async () => {
    vi.useFakeTimers()
    // The real failure this guards is a callback that never fires, which
    // otherwise leaves the gate absent for as long as the tab is open.
    getChromeMock().storage.local.get.mockImplementationOnce(() => {})

    await loadContentScript()
    expect(isBlockingReady()).toBe(false)

    await vi.advanceTimersByTimeAsync(READY_FALLBACK_MS)

    expect(isBlockingReady()).toBe(true)
  })

  it('is set by teardown, never cleared by it', async () => {
    vi.useFakeTimers()
    getChromeMock().storage.local.get.mockImplementationOnce(() => {})

    const module = await loadContentScript()
    expect(isBlockingReady()).toBe(false)

    module.cleanupContentScript()

    // An unloaded extension must not leave the page hidden.
    expect(isBlockingReady()).toBe(true)
  })
})
