import type { PageSection } from '../shared/settings'

const isFeedRoute = (pathname: string) => {
  return pathname === '/feed' || pathname === '/feed/'
}

const isNetworkGrowRoute = (pathname: string) => {
  return pathname === '/mynetwork/grow' || pathname === '/mynetwork/grow/'
}

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

  return []
}

export const getCurrentRouteSections = (): PageSection[] => {
  return getRouteSections(window.location.pathname)
}
