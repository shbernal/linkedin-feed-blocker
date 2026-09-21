import { test, expect } from '../fixtures/extension'
import { CURTAIN_EXPIRY_MS, READY_ATTR } from '../../src/content/blockingStyles'
import type { ExtensionSettings } from '../../src/shared/settings'

const NOTHING_BLOCKED: ExtensionSettings = {
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPremium: false,
  networkSuggestions: false,
  jobSidebar: false,
}

type ParseTimeStyles = Record<
  string,
  { visibility: string; contentVisibility: string; height: number } | null
>

declare global {
  interface Window {
    __ltfbParseTime?: ParseTimeStyles
  }
}

// The claim the whole document_start stylesheet exists for, and the one jsdom
// cannot make: the feed is hidden before the extension's JavaScript has run at
// all, rather than a moment after it. The fixture records computed styles from
// an inline script that runs while the document is still parsing, which is
// before the content script's document_end entry.
test('hides the feed before any of the extension JavaScript runs', async ({
  clearSettings,
  newLinkedInPage,
}) => {
  await clearSettings()

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')

  const atParseTime = await page.evaluate(() => window.__ltfbParseTime)

  expect(atParseTime?.['#main-feed']).toEqual({
    visibility: 'hidden',
    // Collapsed, not merely invisible: a reserved gap would be its own flash.
    contentVisibility: 'hidden',
    height: 0,
  })
  // The ad image is a replaced element, which content-visibility does not hide.
  // Losing the visibility half of the rule shows an ad before the first pass.
  expect(atParseTime?.['#right-rail-ad-image']?.visibility).toBe('hidden')
})

test('leaves the curtain up only until the gate is cleared', async ({
  clearSettings,
  newLinkedInPage,
}) => {
  await clearSettings()

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')

  // The content script clears it as soon as the settings read lands.
  await expect(page.locator('html')).toHaveAttribute(READY_ATTR, 'true')
})

// If the gate is never cleared the page stays hidden, which is a worse failure
// than the flash the stylesheet replaces. The rule expires on its own so a
// content script that never runs cannot blank LinkedIn permanently. This drives
// the failure directly, because no test of a working extension reaches it.
//
// Nothing is blocked here on purpose. An element the content script has already
// set to `display: none` is not rendered, and an element that is not rendered
// runs no animations, so seeding the defaults would test a state the real
// failure never reaches: if the content script never ran, nothing set
// `display: none` either.
test('reveals the page on its own if the gate is never cleared', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(NOTHING_BLOCKED)

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')
  await expect(page.locator('html')).toHaveAttribute(READY_ATTR, 'true')

  // Put the curtain back up and leave it there, which is what a content script
  // that never ran would have done from the start.
  await page.evaluate(attribute => {
    document.documentElement.removeAttribute(attribute)
  }, READY_ATTR)

  await expect(page.locator('#main-feed')).toHaveCSS('visibility', 'hidden')

  await expect(page.locator('#main-feed')).toHaveCSS('visibility', 'visible', {
    timeout: CURTAIN_EXPIRY_MS * 2,
  })
  await expect(page.locator('#main-feed')).toHaveCSS(
    'content-visibility',
    'visible',
  )
})
