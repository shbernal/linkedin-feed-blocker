import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Playwright's `toBeVisible()` answers a narrower question than "a person can
 * see this". It checks that the element has a non-empty box and is not
 * `display: none` or `visibility: hidden`. An element squarely inside the
 * viewport with something painted over it passes.
 *
 * That gap matters here because the claim this suite most needs to be true is
 * that the My Network invitation area survives blocking. A rule that collapsed
 * a neighbouring section over it, or a curtain that failed to lift off an
 * overlay, would leave the element visible by Playwright's definition and
 * invisible to the user, and the suite would stay green.
 *
 * Borrowed from the caption-truth checks in the adjacent rebobinate project,
 * where the same reasoning applies to a screenshot: a frame that ships a
 * true-sounding caption over the wrong pixels buys a round of confident, wrong
 * conclusions. This is the same failure one layer down.
 */
export const expectUncovered = async (locator: Locator, what: string) => {
  await expect(locator, `${what} is not visible at all`).toBeVisible()

  const covering = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const hit = element.ownerDocument.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    )

    if (hit === null) {
      return 'nothing at all, so the point is outside the viewport'
    }

    if (hit === element || element.contains(hit) || hit.contains(element)) {
      return null
    }

    const classes =
      typeof hit.className === 'string' && hit.className !== ''
        ? `.${hit.className.trim().split(/\s+/).join('.')}`
        : ''

    return `${hit.tagName.toLowerCase()}${classes}`
  })

  expect(covering, `${what} is covered by ${covering}`).toBe(null)
}

export const expectSelectorUncovered = async (page: Page, selector: string) => {
  await expectUncovered(page.locator(selector), selector)
}
