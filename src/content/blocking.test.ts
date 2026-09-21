import { beforeEach, describe, expect, it } from 'vitest'
import type { ExtensionSettings, PageSection } from '../shared/settings'
import { getFixtureBody } from '../test/fixtures/linkedin'
import {
  applySectionBlocking,
  applySettings,
  clearAllBlocking,
  showSection,
} from './blocking'
import { HIDDEN_ATTR_BY_SECTION } from './selectors'

const NOTHING_BLOCKED: ExtensionSettings = {
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPremium: false,
  networkSuggestions: false,
  jobSidebar: false,
}

const EVERYTHING_BLOCKED: ExtensionSettings = {
  active: true,
  feed: true,
  rightFeed: true,
  networkPuzzle: true,
  networkPremium: true,
  networkSuggestions: true,
  jobSidebar: true,
}

const only = (...sections: PageSection[]): ExtensionSettings => {
  const settings = { ...NOTHING_BLOCKED, active: sections.length > 0 }
  sections.forEach(section => {
    settings[section] = true
  })
  return settings
}

const renderRoute = (pathname: string) => {
  window.history.replaceState({}, '', pathname)
  document.body.innerHTML = getFixtureBody(pathname)
}

const element = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector)
  if (!found) {
    throw new Error(`Fixture is missing ${selector}`)
  }
  return found
}

const isHidden = (selector: string) => {
  return getComputedStyle(element(selector)).display === 'none'
}

const hiddenBy = (section: PageSection) => {
  return Array.from(
    document.querySelectorAll(`[${HIDDEN_ATTR_BY_SECTION[section]}="true"]`),
    node => node.id,
  ).sort()
}

const FEED_RIGHT_RAIL = [
  '#right-rail-games',
  '#right-rail-discover',
  '#right-rail-ad-image',
  '#right-rail-ad-frame',
]

describe('the home feed', () => {
  beforeEach(() => {
    renderRoute('/feed/')
  })

  it('hides the main feed column and marks what it hid', () => {
    applySettings(only('feed'))

    expect(isHidden('#main-feed')).toBe(true)
    expect(element('#main-feed')).toHaveAttribute(
      HIDDEN_ATTR_BY_SECTION.feed,
      'true',
    )
    FEED_RIGHT_RAIL.forEach(selector => {
      expect(isHidden(selector)).toBe(false)
    })
  })

  it('hides every right-rail target without touching the feed', () => {
    applySettings(only('rightFeed'))

    expect(isHidden('#main-feed')).toBe(false)
    expect(hiddenBy('rightFeed')).toEqual([
      'right-rail-ad-frame',
      'right-rail-ad-image',
      'right-rail-discover',
      'right-rail-games',
    ])
  })

  it('restores only what it hid when a section is turned off', () => {
    applySettings(EVERYTHING_BLOCKED)
    applySettings(only('rightFeed'))

    expect(isHidden('#main-feed')).toBe(false)
    expect(element('#main-feed')).not.toHaveAttribute(
      HIDDEN_ATTR_BY_SECTION.feed,
    )
    expect(isHidden('#right-rail-games')).toBe(true)
  })

  it('leaves the page untouched when nothing is blocked', () => {
    applySettings(NOTHING_BLOCKED)

    expect(isHidden('#main-feed')).toBe(false)
    expect(document.querySelectorAll('[data-ltfb-feed-hidden]')).toHaveLength(0)
  })

  it('is idempotent across repeated passes', () => {
    applySettings(only('feed', 'rightFeed'))
    applySettings(only('feed', 'rightFeed'))
    applySettings(only('feed', 'rightFeed'))

    expect(hiddenBy('feed')).toEqual(['main-feed'])
    expect(hiddenBy('rightFeed')).toHaveLength(4)
  })

  // Adopting an element LinkedIn itself hid would mean revealing it on the
  // next restore, so the extension steps over anything already display: none.
  it('never adopts an element the page had already hidden', () => {
    element('#main-feed').style.display = 'none'

    applySettings(only('feed'))
    expect(element('#main-feed')).not.toHaveAttribute(
      HIDDEN_ATTR_BY_SECTION.feed,
    )

    applySettings(NOTHING_BLOCKED)
    expect(isHidden('#main-feed')).toBe(true)
  })

  it('clears every section at once on teardown', () => {
    applySettings(EVERYTHING_BLOCKED)
    clearAllBlocking()

    expect(isHidden('#main-feed')).toBe(false)
    FEED_RIGHT_RAIL.forEach(selector => {
      expect(isHidden(selector)).toBe(false)
    })
    expect(document.querySelectorAll('[data-ltfb-feed-hidden]')).toHaveLength(0)
  })

  it('exposes per-section apply and restore', () => {
    applySectionBlocking('feed')
    expect(isHidden('#main-feed')).toBe(true)

    showSection('feed')
    expect(isHidden('#main-feed')).toBe(false)
  })
})

describe('the My Network grow page', () => {
  beforeEach(() => {
    renderRoute('/mynetwork/grow/')
  })

  it('hides the puzzle promo', () => {
    applySettings(only('networkPuzzle'))

    expect(hiddenBy('networkPuzzle')).toEqual(['network-puzzle'])
  })

  it('hides the Premium upsell', () => {
    applySettings(only('networkPremium'))

    expect(hiddenBy('networkPremium')).toEqual(['network-premium'])
  })

  it('hides suggestion sections that follow the invitation preview', () => {
    applySettings(only('networkSuggestions'))

    expect(hiddenBy('networkSuggestions')).toEqual([
      'network-pages',
      'network-people',
    ])
  })

  // A standing product guarantee: the invitation area is the reason to open
  // this page, so nothing the extension does may hide it. The section above
  // the preview is covered here too, because the suggestion rule is an
  // ordering check rather than "every auto-component section".
  it('never hides the invitation preview or anything above it', () => {
    applySettings(EVERYTHING_BLOCKED)

    expect(isHidden('#network-invitations')).toBe(false)
    expect(isHidden('#network-before-invitations')).toBe(false)
    expect(isHidden('section[aria-label="Primary content"]')).toBe(false)
  })

  it('keeps the three sections independent', () => {
    applySettings(EVERYTHING_BLOCKED)

    expect(hiddenBy('networkPuzzle')).toEqual(['network-puzzle'])
    expect(hiddenBy('networkPremium')).toEqual(['network-premium'])
    expect(hiddenBy('networkSuggestions')).toEqual([
      'network-pages',
      'network-people',
    ])
  })

  it('restores every section it hid', () => {
    applySettings(EVERYTHING_BLOCKED)
    applySettings(NOTHING_BLOCKED)

    ;['#network-puzzle', '#network-premium', '#network-people'].forEach(
      selector => {
        expect(isHidden(selector)).toBe(false)
      },
    )
  })
})

describe('a job posting', () => {
  beforeEach(() => {
    renderRoute('/jobs/view/4458347375/')
  })

  it('hides the promo sidebar and leaves the posting alone', () => {
    applySettings(only('jobSidebar'))

    expect(hiddenBy('jobSidebar')).toEqual(['job-sidebar'])
    expect(isHidden('#job-details')).toBe(false)
  })

  // The label is the one English string in the selector. The "Post a job"
  // link is what still identifies the rail where LinkedIn translates it.
  it('finds the sidebar by its Post a job link when the label differs', () => {
    element('#job-sidebar').setAttribute('aria-label', 'Barre latérale')

    applySettings(only('jobSidebar'))

    expect(hiddenBy('jobSidebar')).toEqual(['job-sidebar'])
  })

  it('restores the sidebar when the section is turned off', () => {
    applySettings(EVERYTHING_BLOCKED)
    applySettings(NOTHING_BLOCKED)

    expect(isHidden('#job-sidebar')).toBe(false)
    expect(hiddenBy('jobSidebar')).toEqual([])
  })
})

describe('unsupported routes', () => {
  // The route table is the outer gate: a selector that would match here must
  // still never fire, so navigating away cannot leave LinkedIn half-hidden.
  it('leaves matching markup alone on a route the extension does not claim', () => {
    renderRoute('/jobs/')

    applySettings(EVERYTHING_BLOCKED)

    expect(isHidden('#right-rail-games')).toBe(false)
    expect(isHidden('#right-rail-ad-image')).toBe(false)
    expect(
      document.querySelectorAll('[data-ltfb-right-feed-hidden]'),
    ).toHaveLength(0)
  })

  it('restores what a supported route hid once the path changes', () => {
    renderRoute('/feed/')
    applySettings(EVERYTHING_BLOCKED)
    expect(isHidden('#main-feed')).toBe(true)

    // Same DOM, new path: this is the client-side navigation case.
    window.history.replaceState({}, '', '/jobs/')
    applySettings(EVERYTHING_BLOCKED)

    expect(isHidden('#main-feed')).toBe(false)
    expect(isHidden('#right-rail-games')).toBe(false)
  })
})
