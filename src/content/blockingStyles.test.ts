import { beforeEach, describe, expect, it } from 'vitest'
import { SECTION_TARGETS } from './selectors'
import {
  buildBlockingCss,
  CURTAIN_EXPIRY_MS,
  CURTAIN_SECTIONS,
  getCurtainSelectors,
  isBlockingReady,
  markBlockingReady,
  READY_ATTR,
  READY_FALLBACK_MS,
} from './blockingStyles'

beforeEach(() => {
  document.documentElement.removeAttribute(READY_ATTR)
})

describe('the curtain selectors', () => {
  it('are exactly the feed route targets, read from the selector table', () => {
    expect(CURTAIN_SECTIONS).toEqual(['feed', 'rightFeed'])
    expect(getCurtainSelectors()).toEqual([
      ...SECTION_TARGETS.feed,
      ...SECTION_TARGETS.rightFeed,
    ])
  })

  // The stylesheet is only trustworthy because it cannot say anything the JS
  // path does not. A predicate-gated target has no CSS equivalent, so listing
  // its section here has to fail loudly rather than emit a rule that hides more
  // than the JS would.
  it('reject a section whose targets are predicate-gated', () => {
    CURTAIN_SECTIONS.push('networkSuggestions')

    try {
      expect(() => getCurtainSelectors()).toThrow(
        /networkSuggestions has a predicate-gated target/,
      )
    } finally {
      CURTAIN_SECTIONS.pop()
    }
  })
})

describe('the generated stylesheet', () => {
  it('gates every rule on the ready attribute being absent', () => {
    const css = buildBlockingCss()
    const selectors = css
      .slice(css.indexOf('html:not('))
      .split('{')[0]
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)

    expect(selectors).toHaveLength(getCurtainSelectors().length)
    selectors.forEach(selector => {
      expect(selector.startsWith(`html:not([${READY_ATTR}]) `)).toBe(true)
    })
  })

  // `display: none` cannot be lifted by an animation in either engine, so the
  // curtain uses the two properties that can be. Losing either one silently
  // un-hides something: content-visibility does not hide the ad image, and
  // visibility does not collapse the feed container's box.
  it('hides with the two properties an animation can restore', () => {
    const css = buildBlockingCss()

    expect(css).toContain('content-visibility: hidden')
    expect(css).toContain('visibility: hidden')
    expect(css).not.toContain('display: none')
  })

  // Without this the page stays hidden forever when the content script never
  // runs, which is a worse failure than the flash this replaces.
  it('expires on its own so a page cannot stay hidden', () => {
    expect(buildBlockingCss()).toContain(
      `animation: 0s linear ${CURTAIN_EXPIRY_MS}ms forwards ltfb-curtain-lift`,
    )
  })

  it('gives the content script room to clear the gate first', () => {
    expect(READY_FALLBACK_MS).toBeLessThan(CURTAIN_EXPIRY_MS)
  })
})

describe('the ready gate', () => {
  it('is absent until it is marked', () => {
    expect(isBlockingReady()).toBe(false)

    markBlockingReady()

    expect(isBlockingReady()).toBe(true)
    expect(document.documentElement.getAttribute(READY_ATTR)).toBe('true')
  })

  it('is idempotent, so a fallback firing after the real one is harmless', () => {
    markBlockingReady()
    markBlockingReady()

    expect(document.documentElement.getAttribute(READY_ATTR)).toBe('true')
  })
})
