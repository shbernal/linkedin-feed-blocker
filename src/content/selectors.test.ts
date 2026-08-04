import { describe, expect, it } from 'vitest'
import {
  ALL_SECTIONS,
  HIDDEN_ATTR_BY_SECTION,
  isNetworkPremiumSection,
  isNetworkPuzzleCard,
  isNetworkSuggestionsSection,
  SECTION_TARGETS,
} from './selectors'

const render = (html: string) => {
  document.body.innerHTML = `<main><section aria-label="Primary content">${html}</section></main>`

  const section = document.querySelector<HTMLElement>('#subject')
  if (!section) {
    throw new Error('Fixture is missing #subject')
  }
  return section
}

describe('the section table', () => {
  it('gives every section a managed attribute and at least one target', () => {
    expect(ALL_SECTIONS).toHaveLength(5)
    ALL_SECTIONS.forEach(section => {
      expect(HIDDEN_ATTR_BY_SECTION[section]).toMatch(/^data-ltfb-[a-z-]+$/)
      expect(SECTION_TARGETS[section].length).toBeGreaterThan(0)
    })
  })

  it('keeps the managed attributes distinct', () => {
    const attributes = Object.values(HIDDEN_ATTR_BY_SECTION)
    expect(new Set(attributes).size).toBe(attributes.length)
  })
})

describe('isNetworkPuzzleCard', () => {
  // LinkedIn ships the puzzle promo with two different copy blocks, and only
  // one of them names the product.
  it('recognises the branded copy', () => {
    expect(
      isNetworkPuzzleCard(
        render(
          '<section id="subject">A new daily puzzle from LinkedIn</section>',
        ),
      ),
    ).toBe(true)
  })

  it('recognises the call-to-action copy', () => {
    expect(
      isNetworkPuzzleCard(
        render(
          '<section id="subject">Your move<button>Solve now</button></section>',
        ),
      ),
    ).toBe(true)
  })

  it('ignores anything else', () => {
    expect(
      isNetworkPuzzleCard(
        render('<section id="subject">People you may know</section>'),
      ),
    ).toBe(false)
    expect(
      isNetworkPuzzleCard(render('<section id="subject">Your move</section>')),
    ).toBe(false)
  })
})

describe('isNetworkPremiumSection', () => {
  it('needs both the wording and a Premium link', () => {
    expect(
      isNetworkPremiumSection(
        render(
          '<section id="subject">Try Premium<a href="/premium/products/">Go</a></section>',
        ),
      ),
    ).toBe(true)
  })

  it('rejects a section that only mentions Premium', () => {
    expect(
      isNetworkPremiumSection(
        render('<section id="subject">Premium members like this</section>'),
      ),
    ).toBe(false)
  })

  it('rejects a Premium link without the wording', () => {
    expect(
      isNetworkPremiumSection(
        render(
          '<section id="subject">Upgrade<a href="/premium/products/">Go</a></section>',
        ),
      ),
    ).toBe(false)
  })
})

describe('isNetworkSuggestionsSection', () => {
  const withInvitations = (html: string) => {
    return render(
      `<section componentkey="pending-invitations-preview">Invitations</section>${html}`,
    )
  }

  it('accepts a plain suggestion section below the invitation preview', () => {
    expect(
      isNetworkSuggestionsSection(
        withInvitations('<section id="subject">People you may know</section>'),
      ),
    ).toBe(true)
  })

  // The whole rule is an ordering check, so a section above the preview is
  // part of the invitation area and stays visible.
  it('rejects a section above the invitation preview', () => {
    document.body.innerHTML = `<main><section aria-label="Primary content">
      <section id="subject">People you may know</section>
      <section componentkey="pending-invitations-preview">Invitations</section>
    </section></main>`

    expect(
      isNetworkSuggestionsSection(
        document.querySelector<HTMLElement>('#subject')!,
      ),
    ).toBe(false)
  })

  it('rejects everything when there is no invitation preview to anchor to', () => {
    expect(
      isNetworkSuggestionsSection(
        render('<section id="subject">People you may know</section>'),
      ),
    ).toBe(false)
  })

  it('rejects the Premium and puzzle sections it sits next to', () => {
    expect(
      isNetworkSuggestionsSection(
        withInvitations(
          '<section id="subject">Try Premium<a href="/premium/">Go</a></section>',
        ),
      ),
    ).toBe(false)
    expect(
      isNetworkSuggestionsSection(
        withInvitations(
          '<section id="subject">Games<a href="/games/queens/">Play</a></section>',
        ),
      ),
    ).toBe(false)
    expect(
      isNetworkSuggestionsSection(
        withInvitations('<section id="subject">Your move: Solve now</section>'),
      ),
    ).toBe(false)
  })

  // Without this the outer content wrapper would qualify and take the whole
  // page with it.
  it('rejects the main content container itself', () => {
    document.body.innerHTML = `<main><section aria-label="Primary content" id="subject">
      <section componentkey="pending-invitations-preview">Invitations</section>
    </section></main>`

    expect(
      isNetworkSuggestionsSection(
        document.querySelector<HTMLElement>('#subject')!,
      ),
    ).toBe(false)
  })
})
