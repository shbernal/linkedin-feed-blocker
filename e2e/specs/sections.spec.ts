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
  jobSidebar: false,
  navBadges: false,
  navPremium: false,
}

const EVERYTHING_BLOCKED: ExtensionSettings = {
  active: true,
  feed: true,
  rightFeed: true,
  networkPuzzle: true,
  networkPremium: true,
  networkSuggestions: true,
  jobSidebar: true,
  navBadges: true,
  navPremium: true,
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

test('blocks and restores the job posting sidebar', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('jobSidebar'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/jobs/view/4458347375/')

  await expectHidden(page, '#job-sidebar')
  await expectVisible(page, '#job-details')

  await seedSettings(NOTHING_BLOCKED)

  await expectVisible(page, '#job-sidebar')
  await expect(page.locator('[data-ltfb-job-sidebar-hidden]')).toHaveCount(0)
})

test('blocks and restores the top bar dot and Premium link', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('navBadges', 'navPremium'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')

  await expectHidden(page, '#top-bar-home-badge')
  await expectHidden(page, '#top-bar-premium')
  // The dot goes, the nav item it sits on does not, and a badge that means a
  // person did something is left alone.
  await expectVisible(page, 'button[aria-label="Home, 1 new notification"]')
  await expectVisible(page, '#top-bar-messaging-badge')

  await seedSettings(NOTHING_BLOCKED)

  await expectVisible(page, '#top-bar-home-badge')
  await expectVisible(page, '#top-bar-premium')
  await expect(page.locator('[data-ltfb-nav-badges-hidden]')).toHaveCount(0)
})

// `/jobs/` claims no page sections and serves the older top bar. Both halves
// matter: the top bar is not route-gated, and it has two shapes.
test('blocks the older top bar on a route with no page sections', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('navBadges', 'navPremium'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/jobs/')

  await expectHidden(page, '#classic-top-bar-home-badge')
  await expectHidden(page, '#classic-top-bar-premium')
  await expectVisible(page, 'a[href*="/notifications/"]')
})

// The dot arrives with the notification, long after the first pass, so this
// is the mutation observer's case rather than the initial pass's.
test('blocks a dot that appears after the first pass', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
}) => {
  await clearSettings()
  await seedSettings(only('navBadges'))

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')
  await expectHidden(page, '#top-bar-home-badge')

  await page.evaluate(() => {
    const badge = document.createElement('span')
    badge.id = 'late-notifications-badge'
    badge.setAttribute('data-color-scheme', 'light')
    document.querySelector('svg#bell-fill-medium')?.after(badge)
  })

  await expectHidden(page, '#late-notifications-badge')
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
