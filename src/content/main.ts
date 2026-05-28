import {
  DEFAULT_SETTINGS,
  deriveSettingsFromStorage,
  type PageSection,
  LEGACY_ACTIVE_STORAGE_KEY,
  normalizeSettings,
  SETTINGS_STORAGE_KEY,
  syncActiveWithPages,
  type ExtensionSettings,
} from '../shared/settings'

const HIDDEN_ATTR_BY_SECTION: Record<PageSection, string> = {
  feed: 'data-ltfb-feed-hidden',
  rightFeed: 'data-ltfb-right-feed-hidden',
  networkPuzzle: 'data-ltfb-network-puzzle-hidden',
  networkPeople: 'data-ltfb-network-people-hidden',
  networkSuggestions: 'data-ltfb-network-suggestions-hidden',
  networkLeftAd: 'data-ltfb-network-left-ad-hidden',
}

const ALL_SECTIONS = Object.keys(HIDDEN_ATTR_BY_SECTION) as PageSection[]

type SectionTarget =
  | string
  | {
      selector: string
      matches?: (element: HTMLElement) => boolean
    }

const normalizeText = (value: string | null | undefined) => {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

const hasHeadingText = (element: HTMLElement, labels: readonly string[]) => {
  return Array.from(element.querySelectorAll('h1, h2, h3')).some(heading => {
    const headingText = normalizeText(heading.textContent).toLowerCase()

    return labels.some(label => headingText === label.toLowerCase())
  })
}

const hasLeadingTextLabel = (
  element: HTMLElement,
  labels: readonly string[],
) => {
  const text = normalizeText(element.textContent).toLowerCase()

  return labels.some(label => text.startsWith(label.toLowerCase()))
}

const isMainNetworkContentSection = (element: HTMLElement) => {
  const mainContent = element.closest(
    'section[aria-label="Contenu principal"], section[aria-label="Main content"]',
  )

  return mainContent !== null && mainContent !== element
}

const isAfterPendingInvitations = (element: HTMLElement) => {
  const invitations = document.querySelector<HTMLElement>(
    'section[componentkey="pending-invitations-preview"]',
  )

  return (
    invitations !== null &&
    Boolean(
      invitations.compareDocumentPosition(element) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  )
}

const isNetworkSectionAfterInvitations = (element: HTMLElement) => {
  return (
    element.tagName.toLowerCase() === 'section' &&
    isMainNetworkContentSection(element) &&
    isAfterPendingInvitations(element)
  )
}

const networkSuggestionsLabels = [
  'Suggestions for you',
  'Personalized suggestions',
  'Suggestions personnalisées',
]

const isNetworkSuggestionsSection = (element: HTMLElement) => {
  return (
    hasHeadingText(element, networkSuggestionsLabels) ||
    hasLeadingTextLabel(element, networkSuggestionsLabels)
  )
}

const isNetworkPuzzleCard = (element: HTMLElement) => {
  const text = normalizeText(element.textContent)

  return (
    (text.includes('LinkedIn') && text.includes('new daily puzzle')) ||
    (text.includes('Your move') && text.includes('Solve now'))
  )
}

const gameLinkSelector = 'a[href^="/games"], a[href*="linkedin.com/games"]'

const notMainNetworkSection =
  ':not([aria-label="Contenu principal"])' +
  ':not([aria-label="Main content"])' +
  ':not([componentkey="pending-invitations-preview"])'

const SECTION_TARGETS: Record<PageSection, readonly SectionTarget[]> = {
  // Target the main feed column container directly.
  feed: [
    'div[data-testid="mainFeed"][data-component-type="LazyColumn"][role="list"][componentkey="container-update-list_mainFeed-lazy-container"]',
  ],
  rightFeed: [
    'div:has(> div > div > a[href^="/games/"])',
    'div:has(> div > a[href="/mynetwork/discover-hub/"])',
    'img[alt="Advertise on LinkedIn"]',
    'iframe[componentkey="MainFeedDesktopNav_feed_ad"]',
  ],
  // On My Network, puzzle promos can render as a standalone section or card.
  networkPuzzle: [
    {
      selector: `section${notMainNetworkSection}:has(${gameLinkSelector})`,
      matches: isNetworkSectionAfterInvitations,
    },
    {
      selector: `section${notMainNetworkSection}`,
      matches: element =>
        isNetworkSectionAfterInvitations(element) &&
        isNetworkPuzzleCard(element),
    },
  ],
  // Hide recommendation sections while keeping invitations, tabs, and the
  // puzzle and "Suggestions for you" sections separate.
  networkPeople: [
    {
      selector: 'section[componentkey^="auto-component-"]',
      matches: element =>
        isNetworkSectionAfterInvitations(element) &&
        !isNetworkSuggestionsSection(element),
    },
  ],
  networkSuggestions: [
    {
      selector: `section${notMainNetworkSection}`,
      matches: element =>
        isNetworkSectionAfterInvitations(element) &&
        isNetworkSuggestionsSection(element),
    },
  ],
  networkLeftAd: [
    'div:has(> div > iframe[componentkey="MynetworkDesktopNav_mynetwork_desktop_nav_ad"])',
  ],
}

type UpdateSettingsMessage = {
  action: 'updateSettings'
  settings: ExtensionSettings
}

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

const SHORTCUT_DUPLICATE_WINDOW_MS = 500

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS }
let observer: MutationObserver | null = null
let intervalId: number | null = null
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

const isFeedRoute = () => {
  return (
    window.location.pathname === '/feed' ||
    window.location.pathname === '/feed/'
  )
}

const isNetworkGrowRoute = () => {
  return (
    window.location.pathname === '/mynetwork/grow/' ||
    window.location.pathname === '/mynetwork/grow'
  )
}

const getCurrentRouteSections = (): PageSection[] => {
  if (isFeedRoute()) {
    return ['feed', 'rightFeed']
  }

  if (isNetworkGrowRoute()) {
    return [
      'networkPuzzle',
      'networkPeople',
      'networkSuggestions',
      'networkLeftAd',
    ]
  }

  return []
}

const hideElement = (element: HTMLElement, hiddenAttr: string) => {
  if (element.getAttribute(hiddenAttr) === 'true') {
    return
  }

  if (element.style.display === 'none') {
    return
  }

  element.style.display = 'none'
  element.setAttribute(hiddenAttr, 'true')
}

const hideTargets = (targets: readonly SectionTarget[], hiddenAttr: string) => {
  targets.forEach(target => {
    const selector = typeof target === 'string' ? target : target.selector

    document.querySelectorAll<HTMLElement>(selector).forEach(element => {
      if (typeof target !== 'string' && target.matches?.(element) === false) {
        return
      }

      hideElement(element, hiddenAttr)
    })
  })
}

const saveSettings = (nextSettings: ExtensionSettings) => {
  chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: syncActiveWithPages(nextSettings),
  })
}

const showSection = (section: PageSection) => {
  const hiddenAttr = HIDDEN_ATTR_BY_SECTION[section]
  document
    .querySelectorAll<HTMLElement>(`[${hiddenAttr}="true"]`)
    .forEach(element => {
      element.style.display = ''
      element.removeAttribute(hiddenAttr)
    })
}

const applySectionBlocking = (section: PageSection) => {
  const targets = SECTION_TARGETS[section]
  if (targets.length === 0) {
    return
  }

  hideTargets(targets, HIDDEN_ATTR_BY_SECTION[section])
}

const clearAllBlocking = () => {
  ALL_SECTIONS.forEach(showSection)
}

const applyCurrentSettings = () => {
  const routeSections = new Set(getCurrentRouteSections())

  ALL_SECTIONS.forEach(section => {
    if (!routeSections.has(section) || !settings[section]) {
      showSection(section)
      return
    }

    applySectionBlocking(section)
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

const isToggleShortcut = (event: KeyboardEvent) => {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    event.code === 'Digit7'
  )
}

const onKeyDown = (event: KeyboardEvent) => {
  if (!isToggleShortcut(event) || isTextInputTarget(event.target)) {
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
          setTimeout(() => {
            applyCurrentSettings()
          }, 100)
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

const startBlockingLoop = () => {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
  }

  intervalId = window.setInterval(() => {
    applyCurrentSettings()
  }, 1000)
}

const init = () => {
  chrome.storage.local.get(
    [SETTINGS_STORAGE_KEY, LEGACY_ACTIVE_STORAGE_KEY],
    result => {
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
  startBlockingLoop()
}

const cleanup = () => {
  chrome.runtime.onMessage.removeListener(onRuntimeMessage)
  chrome.storage.onChanged.removeListener(onStorageChanged)
  document.removeEventListener('keydown', onKeyDown, true)

  if (observer) {
    observer.disconnect()
    observer = null
  }

  if (intervalId !== null) {
    window.clearInterval(intervalId)
    intervalId = null
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true })
} else {
  init()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup()
    clearAllBlocking()
  })
}
