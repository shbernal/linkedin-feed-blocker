import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getChromeMock } from '../test/chrome'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../shared/shortcut'

const TOGGLE_COMMAND = 'toggle-current-page-block'

// The service worker wires everything up at import time, so each test needs a
// fresh module instance against the freshly installed Chrome mock.
const loadServiceWorker = async () => {
  vi.resetModules()
  await import('./service-worker')
}

const withActiveTab = (tab: Partial<chrome.tabs.Tab> | undefined) => {
  getChromeMock().tabs.query.mockImplementation((_queryInfo, callback) => {
    callback(tab ? [tab as chrome.tabs.Tab] : [])
  })
}

beforeEach(() => {
  vi.resetModules()
})

describe('shortcut mirroring', () => {
  // Content scripts cannot read `chrome.commands`, so the in-page keydown
  // fallback depends on this storage key being written on every start.
  it('mirrors the resolved command binding into storage', async () => {
    await loadServiceWorker()

    expect(getChromeMock().storage.local.snapshot()).toEqual({
      [TOGGLE_SHORTCUT_STORAGE_KEY]: 'Ctrl+Shift+7',
    })
  })

  it('mirrors an empty binding when the command is unbound', async () => {
    getChromeMock().commands.getAll.mockImplementation(callback => {
      callback([{ name: TOGGLE_COMMAND, description: 'Toggle' }])
    })

    await loadServiceWorker()

    expect(
      getChromeMock().storage.local.snapshot()[TOGGLE_SHORTCUT_STORAGE_KEY],
    ).toBe('')
  })

  it('mirrors an empty binding when the command is missing entirely', async () => {
    getChromeMock().commands.getAll.mockImplementation(callback => {
      callback([])
    })

    await loadServiceWorker()

    expect(
      getChromeMock().storage.local.snapshot()[TOGGLE_SHORTCUT_STORAGE_KEY],
    ).toBe('')
  })
})

describe('toggle command', () => {
  it('asks the active LinkedIn tab to toggle blocking', async () => {
    await loadServiceWorker()
    const chromeMock = getChromeMock()
    withActiveTab({ id: 9, url: 'https://www.linkedin.com/feed/' })

    chromeMock.commands.onCommand.emit(TOGGLE_COMMAND)

    expect(chromeMock.tabs.query).toHaveBeenCalledWith(
      { active: true, currentWindow: true },
      expect.any(Function),
    )
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      9,
      { action: 'toggleCurrentPageBlock' },
      expect.any(Function),
    )
  })

  it('ignores other commands', async () => {
    await loadServiceWorker()
    const chromeMock = getChromeMock()
    withActiveTab({ id: 9, url: 'https://www.linkedin.com/feed/' })

    chromeMock.commands.onCommand.emit('some-other-command')

    expect(chromeMock.tabs.query).not.toHaveBeenCalled()
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it('leaves a non-LinkedIn tab alone', async () => {
    await loadServiceWorker()
    const chromeMock = getChromeMock()
    withActiveTab({ id: 9, url: 'https://example.com/' })

    chromeMock.commands.onCommand.emit(TOGGLE_COMMAND)

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it('does nothing when there is no active tab', async () => {
    await loadServiceWorker()
    const chromeMock = getChromeMock()
    withActiveTab(undefined)

    chromeMock.commands.onCommand.emit(TOGGLE_COMMAND)

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it('does nothing when the active tab has no id', async () => {
    await loadServiceWorker()
    const chromeMock = getChromeMock()
    withActiveTab({ url: 'https://www.linkedin.com/feed/' })

    chromeMock.commands.onCommand.emit(TOGGLE_COMMAND)

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled()
  })

  // A tab with no content script answers with a `runtime.lastError`. Reading
  // it is what keeps Chrome from logging an unchecked-error warning.
  it('swallows the delivery error when nothing is listening', async () => {
    await loadServiceWorker()
    const chromeMock = getChromeMock()
    withActiveTab({ id: 9, url: 'https://www.linkedin.com/feed/' })

    chromeMock.commands.onCommand.emit(TOGGLE_COMMAND)

    const [, , respond] = chromeMock.tabs.sendMessage.mock.calls[0]
    expect(() => respond?.()).not.toThrow()
  })
})
