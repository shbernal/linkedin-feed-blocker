import { describe, expect, it } from 'vitest'
import { getCurrentRouteSections, getRouteSections } from './routes'

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

  // Anything not listed is left alone entirely, which is what keeps a
  // selector meant for one surface from firing on another.
  it('claims no sections on unsupported routes', () => {
    expect(getRouteSections('/jobs/')).toEqual([])
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
