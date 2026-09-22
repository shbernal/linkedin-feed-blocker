import { describe, expect, it } from 'vitest'
import {
  getActiveSections,
  getCurrentActiveSections,
  getCurrentRouteSections,
  getRouteSections,
} from './routes'

describe('getRouteSections', () => {
  it('maps the home feed to the two feed sections', () => {
    expect(getRouteSections('/feed')).toEqual(['feed', 'rightFeed'])
    expect(getRouteSections('/feed/')).toEqual(['feed', 'rightFeed'])
  })

  it('maps the My Network grow page to its three sections', () => {
    expect(getRouteSections('/mynetwork/grow')).toEqual([
      'networkPuzzle',
      'networkPremium',
      'networkSuggestions',
    ])
    expect(getRouteSections('/mynetwork/grow/')).toEqual([
      'networkPuzzle',
      'networkPremium',
      'networkSuggestions',
    ])
  })

  it('maps a job posting to the job sidebar', () => {
    expect(getRouteSections('/jobs/view/4458347375/')).toEqual(['jobSidebar'])
    expect(getRouteSections('/jobs/view/4458347375')).toEqual(['jobSidebar'])
  })

  // Anything not listed is left alone entirely, which is what keeps a
  // selector meant for one surface from firing on another.
  it('claims no sections on unsupported routes', () => {
    expect(getRouteSections('/jobs/')).toEqual([])
    expect(getRouteSections('/jobs/collections/recommended/')).toEqual([])
    expect(getRouteSections('/jobs/view/')).toEqual([])
    expect(getRouteSections('/mynetwork/')).toEqual([])
    expect(getRouteSections('/feed/update/12345/')).toEqual([])
    expect(getRouteSections('/')).toEqual([])
  })
})

describe('getCurrentRouteSections', () => {
  it('reads the sections for the current pathname', () => {
    window.history.replaceState({}, '', '/mynetwork/grow/')
    expect(getCurrentRouteSections()).toEqual([
      'networkPuzzle',
      'networkPremium',
      'networkSuggestions',
    ])

    window.history.replaceState({}, '', '/jobs/')
    expect(getCurrentRouteSections()).toEqual([])
  })
})

describe('getActiveSections', () => {
  // The top bar is on every page, so it is the one thing an unclaimed route
  // still blocks. It stays out of `getRouteSections` because that list is
  // what the keyboard shortcut toggles.
  it('adds the top bar to every path, claimed or not', () => {
    expect(getActiveSections('/jobs/')).toEqual(['navBadges', 'navPremium'])
    expect(getActiveSections('/notifications/')).toEqual([
      'navBadges',
      'navPremium',
    ])
    expect(getActiveSections('/feed/')).toEqual([
      'navBadges',
      'navPremium',
      'feed',
      'rightFeed',
    ])
  })

  it('reads the sections for the current pathname', () => {
    window.history.replaceState({}, '', '/jobs/view/4458347375/')
    expect(getCurrentActiveSections()).toEqual([
      'navBadges',
      'navPremium',
      'jobSidebar',
    ])
  })
})
