import type { PageSection } from '../shared/settings'

export const HIDDEN_ATTR_BY_SECTION: Record<PageSection, string> = {
  feed: 'data-ltfb-feed-hidden',
  rightFeed: 'data-ltfb-right-feed-hidden',
  networkPuzzle: 'data-ltfb-network-puzzle-hidden',
  networkPremium: 'data-ltfb-network-premium-hidden',
  networkSuggestions: 'data-ltfb-network-suggestions-hidden',
  jobSidebar: 'data-ltfb-job-sidebar-hidden',
  navBadges: 'data-ltfb-nav-badges-hidden',
  navPremium: 'data-ltfb-nav-premium-hidden',
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
  // The job page's right rail holds only promos: a Premium upsell and a "Post
  // a job" card. The link fallback covers locales that translate the label.
  jobSidebar: [
    'aside[aria-label="Aside"]',
    'aside:has(a[href*="/talent/job-posting-redirect/"])',
  ],
  // LinkedIn serves two top bars and both are a `<header>`: a newer one whose
  // classes are all generated, and the older Ember one under `#global-nav`.
  // Only the Home and Notifications dots go; a Messaging or invitation badge
  // means a person did something, which is the same reason the My Network
  // invitation area stays.
  //
  // In the new bar the dot is a `span` next to the icon's `svg`, inside an
  // icon wrapper that holds nothing else, so the wrapper's child `span` is the
  // badge. Home there is a `<button>` with no href, so the icon's `svg` id is
  // what names the item. The old bar has an href on every item and renders the
  // badge inside it, so the destination names the item there.
  //
  // Nothing keys on text: the wording is translated and the classes are
  // rebuilt, while an icon name and a destination are neither.
  navBadges: [
    'header span:has(> svg[id^="home"]) > span',
    'header span:has(> svg[id^="bell"]) > span',
    'header a[href*="/feed/"] .notification-badge',
    'header a[href*="/notifications/"] .notification-badge',
  ],
  // The upsell wording changes with the offer, so the link's destination is
  // what identifies it. `/premium/products` is the upsell funnel; a
  // subscriber's own Premium links point elsewhere and are left alone.
  //
  // Both bars wrap that link in something: the old bar in a div whose margin
  // would otherwise hold the gap open, the new one in a second anchor. The
  // outermost of the three is the only one worth hiding, so the exclusions
  // drop the inner copies rather than marking elements already inside a
  // hidden one.
  navPremium: [
    'header .premium-upsell-link',
    'header a[href*="/premium/products"]:not(.premium-upsell-link a):not(a a)',
  ],
}
