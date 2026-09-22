import type { PageSection } from '../shared/settings'

const isFeedRoute = (pathname: string) => {
  return pathname === '/feed' || pathname === '/feed/'
}

const isNetworkGrowRoute = (pathname: string) => {
  return pathname === '/mynetwork/grow' || pathname === '/mynetwork/grow/'
}

// A single job posting, `/jobs/view/<id>/`. The jobs home and the search
// results carry no promo rail and stay unclaimed.
const isJobViewRoute = (pathname: string) => {
  return /^\/jobs\/view\/[^/]+\/?$/.test(pathname)
}

/**
 * The top bar is the same on every LinkedIn page, so its sections are not
 * route-gated the way the page sections are. They stay out of
 * `getRouteSections` on purpose: that list is also what the keyboard shortcut
 * toggles, and a shortcut press on an unclaimed route should stay inert rather
 * than silently flipping the top bar.
 */
export const GLOBAL_SECTIONS: PageSection[] = ['navBadges', 'navPremium']

/**
 * Sections the extension is allowed to touch on a given path. Anything not
 * listed here is left alone, and previously hidden elements are restored, so
 * navigating away from a supported route never leaves LinkedIn half-hidden.
 */
export const getRouteSections = (pathname: string): PageSection[] => {
  if (isFeedRoute(pathname)) {
    return ['feed', 'rightFeed']
  }

  if (isNetworkGrowRoute(pathname)) {
    return ['networkPuzzle', 'networkPremium', 'networkSuggestions']
  }

  if (isJobViewRoute(pathname)) {
    return ['jobSidebar']
  }

  return []
}

export const getCurrentRouteSections = (): PageSection[] => {
  return getRouteSections(window.location.pathname)
}

/** Everything blocking may touch here: the route's sections plus the top bar. */
export const getActiveSections = (pathname: string): PageSection[] => {
  return [...GLOBAL_SECTIONS, ...getRouteSections(pathname)]
}

export const getCurrentActiveSections = (): PageSection[] => {
  return getActiveSections(window.location.pathname)
}
