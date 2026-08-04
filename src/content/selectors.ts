import type { PageSection } from '../shared/settings'

export const HIDDEN_ATTR_BY_SECTION: Record<PageSection, string> = {
  feed: 'data-ltfb-feed-hidden',
  rightFeed: 'data-ltfb-right-feed-hidden',
  networkPuzzle: 'data-ltfb-network-puzzle-hidden',
  networkPremium: 'data-ltfb-network-premium-hidden',
  networkSuggestions: 'data-ltfb-network-suggestions-hidden',
}

export const ALL_SECTIONS = Object.keys(HIDDEN_ATTR_BY_SECTION) as PageSection[]

export type SectionTarget =
  | string
  | {
      selector: string
      matches?: (element: HTMLElement) => boolean
    }

const normalizeText = (value: string | null | undefined) => {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

const isMainNetworkContentSection = (element: HTMLElement) => {
  const mainContent = element.closest(
    [
      'main',
      'section[aria-label="Primary content"]',
      'section[aria-label="Contenu principal"]',
      'section[aria-label="Main content"]',
    ].join(', '),
  )

  return mainContent !== null && mainContent !== element
}

export const isNetworkPuzzleCard = (element: HTMLElement) => {
  const text = normalizeText(element.textContent)

  return (
    (text.includes('LinkedIn') && text.includes('new daily puzzle')) ||
    (text.includes('Your move') && text.includes('Solve now'))
  )
}

// The pending-invitations preview is the anchor that keeps the invitation area
// visible: only sections rendered *after* it are treated as suggestions.
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

const gameLinkSelector = 'a[href^="/games"], a[href*="linkedin.com/games"]'
const premiumLinkSelector =
  'a[href^="/premium"], a[href*="linkedin.com/premium"]'

export const isNetworkPremiumSection = (element: HTMLElement) => {
  const text = normalizeText(element.textContent).toLowerCase()

  return (
    text.includes('premium') &&
    element.querySelector(premiumLinkSelector) !== null
  )
}

export const isNetworkSuggestionsSection = (element: HTMLElement) => {
  return (
    isMainNetworkContentSection(element) &&
    isAfterPendingInvitations(element) &&
    !isNetworkPremiumSection(element) &&
    element.querySelector(gameLinkSelector) === null &&
    !isNetworkPuzzleCard(element)
  )
}

const notMainNetworkSection =
  ':not([aria-label="Primary content"])' +
  ':not([aria-label="Contenu principal"])' +
  ':not([aria-label="Main content"])'

export const SECTION_TARGETS: Record<PageSection, readonly SectionTarget[]> = {
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
      matches: isMainNetworkContentSection,
    },
    {
      selector: `section${notMainNetworkSection}`,
      matches: element =>
        isMainNetworkContentSection(element) && isNetworkPuzzleCard(element),
    },
  ],
  networkPremium: [
    {
      selector: `section[componentkey^="auto-component-"]:has(${premiumLinkSelector})`,
      matches: element =>
        isMainNetworkContentSection(element) &&
        isNetworkPremiumSection(element),
    },
  ],
  networkSuggestions: [
    {
      selector: 'section[componentkey^="auto-component-"]',
      matches: isNetworkSuggestionsSection,
    },
  ],
}
