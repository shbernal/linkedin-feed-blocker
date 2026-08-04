import {
  DEFAULT_SETTINGS,
  deriveSettingsFromStorage,
  LEGACY_ACTIVE_STORAGE_KEY,
  normalizeSettings,
  SETTINGS_STORAGE_KEY,
  syncActiveWithPages,
  type ExtensionSettings,
} from '../shared/settings'
import {
  matchesShortcut,
  resolveToggleShortcut,
  TOGGLE_SHORTCUT_STORAGE_KEY,
  type ParsedShortcut,
} from '../shared/shortcut'
import { applySettings, clearAllBlocking } from './blocking'
import { getCurrentRouteSections } from './routes'

type UpdateSettingsMessage = {
  action: 'updateSettings'
  settings: ExtensionSettings
}

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

const SHORTCUT_DUPLICATE_WINDOW_MS = 500

// LinkedIn streams the feed in, so a re-apply is scheduled rather than run per
// mutation. One pending timer at a time collapses a burst of DOM churn into a
// single pass instead of one per batch.
const REAPPLY_DELAY_MS = 100

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS }
let toggleShortcut: ParsedShortcut | null = resolveToggleShortcut(undefined)
let observer: MutationObserver | null = null
let reapplyTimeoutId: number | null = null
let lastShortcutToggleAt = 0

const isUpdateSettingsMessage = (
  message: unknown,
): message is UpdateSettingsMessage => {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    'settings' in message &&
    (message as { action: unknown }).action === 'updateSettings'
  )
}

const isToggleCurrentPageBlockMessage = (
  message: unknown,
): message is ToggleCurrentPageBlockMessage => {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as { action: unknown }).action === 'toggleCurrentPageBlock'
  )
}

const applyCurrentSettings = () => {
  applySettings(settings)
}

const cancelScheduledApply = () => {
  if (reapplyTimeoutId !== null) {
    window.clearTimeout(reapplyTimeoutId)
    reapplyTimeoutId = null
  }
}

const scheduleApply = () => {
  if (reapplyTimeoutId !== null) {
    return
  }

  reapplyTimeoutId = window.setTimeout(() => {
    reapplyTimeoutId = null
    applyCurrentSettings()
  }, REAPPLY_DELAY_MS)
}

const saveSettings = (nextSettings: ExtensionSettings) => {
  chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: syncActiveWithPages(nextSettings),
  })
}

const toggleCurrentPageBlock = () => {
  const routeSections = getCurrentRouteSections()
  if (routeSections.length === 0) {
    return false
  }

  const nextValue = routeSections.some(section => !settings[section])
  const nextSettings = { ...settings }

  routeSections.forEach(section => {
    nextSettings[section] = nextValue
  })

  settings = syncActiveWithPages(nextSettings)
  saveSettings(settings)
  applyCurrentSettings()
  return true
}

const toggleCurrentPageBlockFromShortcut = () => {
  lastShortcutToggleAt = Date.now()
  return toggleCurrentPageBlock()
}

const wasRecentlyToggledByShortcut = () => {
  return Date.now() - lastShortcutToggleAt < SHORTCUT_DUPLICATE_WINDOW_MS
}

const isTextInputTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea'
  )
}

const onKeyDown = (event: KeyboardEvent) => {
  if (!matchesShortcut(event, toggleShortcut)) {
    return
  }

  if (isTextInputTarget(event.target)) {
    return
  }

  if (toggleCurrentPageBlockFromShortcut()) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const onRuntimeMessage: Parameters<
  typeof chrome.runtime.onMessage.addListener
>[0] = (message, _sender, sendResponse) => {
  if (isUpdateSettingsMessage(message)) {
    settings = normalizeSettings(message.settings, settings)
    applyCurrentSettings()

    sendResponse({ success: true })
    return false
  }

  if (isToggleCurrentPageBlockMessage(message)) {
    if (wasRecentlyToggledByShortcut()) {
      sendResponse({ success: true })
      return false
    }

    sendResponse({ success: toggleCurrentPageBlock() })
    return false
  }

  return false
}

const onStorageChanged: Parameters<
  typeof chrome.storage.onChanged.addListener
>[0] = (changes, areaName) => {
  if (areaName !== 'local') {
    return
  }

  const shortcutChange = changes[TOGGLE_SHORTCUT_STORAGE_KEY]
  if (shortcutChange) {
    toggleShortcut = resolveToggleShortcut(shortcutChange.newValue)
  }

  const settingsChange = changes[SETTINGS_STORAGE_KEY]
  if (!settingsChange) {
    return
  }

  settings = normalizeSettings(settingsChange.newValue, settings)
  applyCurrentSettings()
}

const setupObserver = () => {
  if (!document.body) {
    return
  }

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) {
        continue
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scheduleApply()
          return
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

export const initContentScript = () => {
  chrome.storage.local.get(
    [
      SETTINGS_STORAGE_KEY,
      LEGACY_ACTIVE_STORAGE_KEY,
      TOGGLE_SHORTCUT_STORAGE_KEY,
    ],
    result => {
      toggleShortcut = resolveToggleShortcut(
        result[TOGGLE_SHORTCUT_STORAGE_KEY],
      )

      settings = deriveSettingsFromStorage(
        result[SETTINGS_STORAGE_KEY],
        result[LEGACY_ACTIVE_STORAGE_KEY],
      )
      settings = normalizeSettings(settings, DEFAULT_SETTINGS)
      saveSettings(settings)
      applyCurrentSettings()
    },
  )

  chrome.runtime.onMessage.addListener(onRuntimeMessage)
  chrome.storage.onChanged.addListener(onStorageChanged)
  document.addEventListener('keydown', onKeyDown, true)
  setupObserver()
}

export const cleanupContentScript = () => {
  chrome.runtime.onMessage.removeListener(onRuntimeMessage)
  chrome.storage.onChanged.removeListener(onStorageChanged)
  document.removeEventListener('keydown', onKeyDown, true)
  document.removeEventListener('DOMContentLoaded', initContentScript)

  if (observer) {
    observer.disconnect()
    observer = null
  }

  cancelScheduledApply()
}

// `run_at: document_end` already guarantees a body, but crxjs wraps the script
// in an async `import()`, so the readyState check stays as the cheap guard for
// the case where the loader resolves early.
const startContentScript = () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContentScript, {
      once: true,
    })
    return
  }

  initContentScript()
}

// Importing this module must not touch the page, so the unit tests in jsdom can
// drive `initContentScript`/`cleanupContentScript` per test case.
if (import.meta.env.MODE !== 'test' && typeof chrome !== 'undefined') {
  startContentScript()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupContentScript()
    clearAllBlocking()
  })
}
