import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/extension'
import { expectSelectorUncovered } from '../fixtures/visibility'
import type { ExtensionSettings, PageSection } from '../../src/shared/settings'

const NOTHING_BLOCKED: ExtensionSettings = {
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPremium: false,
  networkSuggestions: false,
}

const EVERYTHING_BLOCKED: ExtensionSettings = {
  active: true,
  feed: true,
  rightFeed: true,
  networkPuzzle: true,
  networkPremium: true,
  networkSuggestions: true,
}

const only = (...sections: PageSection[]): ExtensionSettings => {
  const settings = { ...NOTHING_BLOCKED, active: sections.length > 0 }
  sections.forEach(section => {
    settings[section] = true
  })
  return settings
}

const RIGHT_RAIL_IDS = [
  '#right-rail-games',
  '#right-rail-discover',
  '#right-rail-ad-image',
  '#right-rail-ad-frame',
]

const expectHidden = async (page: Page, selector: string) => {
  await expect(page.locator(selector)).toHaveCSS('display', 'none')
}

const expectVisible = async (page: Page, selector: string) => {
  await expect(page.locator(selector)).toBeVisible()
}

test('blocks and restores the main feed column', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('feed'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')

  await expectHidden(page, '#main-feed')
  // The managed attribute is how restore knows what it may touch, so a hidden
  // element without one would restore nothing.
  await expect(page.locator('#main-feed')).toHaveAttribute(
    'data-ltfb-feed-hidden',
    'true',
  )
  for (const selector of RIGHT_RAIL_IDS) {
    await expectVisible(page, selector)
  }

  await seedSettings(NOTHING_BLOCKED)

  await expectVisible(page, '#main-feed')
  await expect(page.locator('#main-feed')).not.toHaveAttribute(
    'data-ltfb-feed-hidden',
    'true',
  )
})

test('blocks and restores every right-rail target', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('rightFeed'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')

  await expectVisible(page, '#main-feed')
  for (const selector of RIGHT_RAIL_IDS) {
    await expect(page.locator(selector)).toBeHidden()
  }
  await expect(
    page.locator('[data-ltfb-right-feed-hidden="true"]'),
  ).toHaveCount(RIGHT_RAIL_IDS.length)

  await seedSettings(NOTHING_BLOCKED)

  for (const selector of RIGHT_RAIL_IDS) {
    await expectVisible(page, selector)
  }
  await expect(page.locator('[data-ltfb-right-feed-hidden]')).toHaveCount(0)
})

test('blocks the My Network promos and keeps invitations', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(EVERYTHING_BLOCKED)

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/mynetwork/grow/')

  await expectHidden(page, '#network-puzzle')
  await expectHidden(page, '#network-premium')
  await expectHidden(page, '#network-people')
  await expectHidden(page, '#network-pages')

  // A standing product guarantee: the invitation area is the reason to open
  // this page. The section above the preview is checked too, because the
  // suggestion rule is an ordering check, not "every auto-component section".
  //
  // Checked for occlusion rather than with `toBeVisible()`. A neighbouring
  // section collapsing over the invitations, or a curtain that never lifted off
  // an overlay, leaves them visible by Playwright's definition and invisible to
  // the person who opened the page.
  await expectSelectorUncovered(page, '#network-invitations')
  await expectSelectorUncovered(page, '#network-before-invitations')

  await seedSettings(NOTHING_BLOCKED)

  await expectVisible(page, '#network-puzzle')
  await expectVisible(page, '#network-premium')
  await expectVisible(page, '#network-people')
})

test('keeps the three My Network sections independent', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('networkPremium'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/mynetwork/grow/')

  await expectHidden(page, '#network-premium')
  await expectVisible(page, '#network-puzzle')
  await expectVisible(page, '#network-people')
})

// The route table is the outer gate. A selector that would match here must
// still never fire, so navigating away never leaves LinkedIn half-hidden.
test('leaves an unsupported route alone', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(EVERYTHING_BLOCKED)

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/jobs/')

  await expectVisible(page, '#right-rail-games')
  await expectVisible(page, '#right-rail-ad-image')
  await expect(page.locator('[data-ltfb-right-feed-hidden]')).toHaveCount(0)
})

// LinkedIn streams the feed in after the first pass, which is what the
// mutation observer exists for.
test('blocks content inserted after the first pass', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('feed'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')
  await expectHidden(page, '#main-feed')

  await page.evaluate(() => {
    const streamed = document.createElement('div')
    streamed.id = 'streamed-feed'
    streamed.setAttribute('data-testid', 'mainFeed')
    streamed.setAttribute('data-component-type', 'LazyColumn')
    streamed.setAttribute('role', 'list')
    streamed.setAttribute(
      'componentkey',
      'container-update-list_mainFeed-lazy-container',
    )
    streamed.textContent = 'A late post'
    document.querySelector('main')?.append(streamed)
  })

  await expectHidden(page, '#streamed-feed')
})
