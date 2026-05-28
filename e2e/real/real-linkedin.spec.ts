import type { Locator, Page, TestInfo } from '@playwright/test'
import { test, expect } from '../fixtures/realExtension'
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
} from '../../src/shared/settings'

const smokeTimeout = 45_000

const feedSelector =
  'div[data-testid="mainFeed"][data-component-type="LazyColumn"]' +
  '[role="list"][componentkey="container-update-list_mainFeed-lazy-container"]'

const networkPuzzleSelector =
  'main section:not([aria-label="Primary content"])' +
  ':has(a[href*="/games/"]), ' +
  'section[aria-label="Primary content"] section:has(a[href*="/games/"]), ' +
  'section[aria-label="Contenu principal"] section:has(a[href*="/games/"]), ' +
  'section[aria-label="Main content"] section:has(a[href*="/games/"])'

const networkPremiumSelector =
  'main section[componentkey^="auto-component-"]:has(a[href^="/premium"]), ' +
  'main section[componentkey^="auto-component-"]' +
  ':has(a[href*="linkedin.com/premium"]), ' +
  'section[aria-label="Contenu principal"] ' +
  'section[componentkey^="auto-component-"]:has(a[href^="/premium"]), ' +
  'section[aria-label="Contenu principal"] ' +
  'section[componentkey^="auto-component-"]' +
  ':has(a[href*="linkedin.com/premium"]), ' +
  'section[aria-label="Main content"] ' +
  'section[componentkey^="auto-component-"]:has(a[href^="/premium"]), ' +
  'section[aria-label="Main content"] ' +
  'section[componentkey^="auto-component-"]' +
  ':has(a[href*="linkedin.com/premium"])'

const networkSuggestionsSelector =
  'section[componentkey="pending-invitations-preview"] ~ ' +
  'section[componentkey^="auto-component-"]' +
  ':not(:has(a[href^="/premium"]))' +
  ':not(:has(a[href*="linkedin.com/premium"]))' +
  ':not(:has(a[href^="/games"]))' +
  ':not(:has(a[href*="linkedin.com/games"]))'

const allSectionsOff = (): ExtensionSettings => ({
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPremium: false,
  networkSuggestions: false,
})

const onlyFeedOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  feed: true,
})

const onlyNetworkPuzzleOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  networkPuzzle: true,
})

const onlyNetworkPremiumOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  networkPremium: true,
})

const onlyNetworkSuggestionsOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  networkSuggestions: true,
})

const loginUrlPattern = /\/login|checkpoint|uas\/login/

const gotoRealLinkedInPage = async (page: Page, url: string) => {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
}

const assertSignedIn = async (page: Page) => {
  await expect
    .poll(() => page.url(), { timeout: smokeTimeout })
    .not.toMatch(loginUrlPattern)
  await expect(
    page.locator('input[name="session_key"], input[name="session_password"]'),
  ).toHaveCount(0)
}

const checkpointScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  name: string,
) => {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  })
}

const revealLazySection = async (page: Page, locator: Locator) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await locator.count()) > 0) {
      return
    }

    await page.evaluate(() => {
      window.scrollBy(0, Math.round(window.innerHeight * 0.9))
    })
    await page.waitForTimeout(500)
  }
}

test.describe('real LinkedIn selector smoke', () => {
  test.skip(
    process.env.RUN_REAL_LINKEDIN_E2E !== '1',
    'Set RUN_REAL_LINKEDIN_E2E=1 to run real LinkedIn smoke tests.',
  )

  test.afterEach(async ({ seedSettings }) => {
    await seedSettings(DEFAULT_SETTINGS)
  })

  test('blocks and restores the real home feed', async ({
    clearSettings,
    seedSettings,
    newRealLinkedInPage,
  }, testInfo) => {
    await clearSettings()
    await seedSettings(allSectionsOff())

    const page = await newRealLinkedInPage()
    await gotoRealLinkedInPage(page, 'https://www.linkedin.com/feed/')
    await assertSignedIn(page)

    const feed = page.locator(feedSelector).first()
    const hiddenFeedTargets = page.locator('[data-ltfb-feed-hidden="true"]')

    await expect(feed).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-feed-unblocked')

    await seedSettings(onlyFeedOn())

    await expect(hiddenFeedTargets.first()).toBeAttached({
      timeout: smokeTimeout,
    })
    await expect(feed).toBeHidden({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-feed-blocked')

    await seedSettings(allSectionsOff())

    await expect(hiddenFeedTargets).toHaveCount(0, {
      timeout: smokeTimeout,
    })
    await expect(feed).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-feed-restored')
  })

  test('toggles the real home feed from the focused page shortcut', async ({
    clearSettings,
    seedSettings,
    newRealLinkedInPage,
  }, testInfo) => {
    await clearSettings()
    await seedSettings(allSectionsOff())

    const page = await newRealLinkedInPage()
    await gotoRealLinkedInPage(page, 'https://www.linkedin.com/feed/')
    await assertSignedIn(page)

    const feed = page.locator(feedSelector).first()
    const hiddenFeedTargets = page.locator('[data-ltfb-feed-hidden="true"]')

    await expect(feed).toBeVisible({ timeout: smokeTimeout })
    await page.bringToFront()
    await page.locator('body').click()
    await page.keyboard.press('Control+Shift+7')

    await expect(hiddenFeedTargets.first()).toBeAttached({
      timeout: smokeTimeout,
    })
    await expect(feed).toBeHidden({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-feed-shortcut-blocked')

    await page.keyboard.press('Control+Shift+7')

    await expect(hiddenFeedTargets).toHaveCount(0, {
      timeout: smokeTimeout,
    })
    await expect(feed).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(
      page,
      testInfo,
      'linkedin-feed-shortcut-restored',
    )
  })

  test('blocks and restores the real My Network puzzle', async ({
    clearSettings,
    seedSettings,
    newRealLinkedInPage,
  }, testInfo) => {
    await clearSettings()
    await seedSettings(allSectionsOff())

    const page = await newRealLinkedInPage()
    await gotoRealLinkedInPage(page, 'https://www.linkedin.com/mynetwork/grow/')
    await assertSignedIn(page)

    const puzzle = page.locator(networkPuzzleSelector).first()
    const hiddenPuzzle = page.locator(
      '[data-ltfb-network-puzzle-hidden="true"]',
    )
    const invitations = page
      .locator('section[componentkey="pending-invitations-preview"]')
      .first()

    await expect(puzzle).toBeVisible({ timeout: smokeTimeout })
    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-network-unblocked')

    await seedSettings(onlyNetworkPuzzleOn())

    await expect(hiddenPuzzle.first()).toBeAttached({
      timeout: smokeTimeout,
    })
    await expect(puzzle).toBeHidden({ timeout: smokeTimeout })
    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-network-blocked')

    await seedSettings(allSectionsOff())

    await expect(hiddenPuzzle).toHaveCount(0, {
      timeout: smokeTimeout,
    })
    await expect(puzzle).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-network-restored')
  })

  test('blocks and restores the real My Network Premium section when present', async ({
    clearSettings,
    seedSettings,
    newRealLinkedInPage,
  }, testInfo) => {
    await clearSettings()
    await seedSettings(allSectionsOff())

    const page = await newRealLinkedInPage()
    await gotoRealLinkedInPage(page, 'https://www.linkedin.com/mynetwork/grow/')
    await assertSignedIn(page)

    const premium = page
      .locator(networkPremiumSelector)
      .filter({ hasText: /premium/i })
      .first()
    const hiddenPremium = page.locator(
      '[data-ltfb-network-premium-hidden="true"]',
    )
    const invitations = page
      .locator('section[componentkey="pending-invitations-preview"]')
      .first()

    await revealLazySection(page, premium)
    if ((await premium.count()) === 0) {
      testInfo.annotations.push({
        type: 'note',
        description:
          'LinkedIn did not render a My Network Premium section for this profile run.',
      })
      await checkpointScreenshot(page, testInfo, 'linkedin-network-no-premium')
      return
    }

    await expect(premium).toBeVisible({ timeout: smokeTimeout })
    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-network-premium')

    await seedSettings(onlyNetworkPremiumOn())

    await expect(hiddenPremium.first()).toBeAttached({
      timeout: smokeTimeout,
    })
    await expect(premium).toBeHidden({ timeout: smokeTimeout })
    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(
      page,
      testInfo,
      'linkedin-network-premium-blocked',
    )

    await seedSettings(allSectionsOff())

    await expect(hiddenPremium).toHaveCount(0, {
      timeout: smokeTimeout,
    })
    await expect(premium).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(
      page,
      testInfo,
      'linkedin-network-premium-restored',
    )
  })

  test('blocks and restores real My Network suggestions when present', async ({
    clearSettings,
    seedSettings,
    newRealLinkedInPage,
  }, testInfo) => {
    await clearSettings()
    await seedSettings(allSectionsOff())

    const page = await newRealLinkedInPage()
    await gotoRealLinkedInPage(page, 'https://www.linkedin.com/mynetwork/grow/')
    await assertSignedIn(page)

    const suggestions = page.locator(networkSuggestionsSelector).first()
    const hiddenSuggestions = page.locator(
      '[data-ltfb-network-suggestions-hidden="true"]',
    )
    const invitations = page
      .locator('section[componentkey="pending-invitations-preview"]')
      .first()

    await revealLazySection(page, suggestions)
    if ((await suggestions.count()) === 0) {
      testInfo.annotations.push({
        type: 'note',
        description:
          'LinkedIn did not render a My Network suggestions section for this profile run.',
      })
      await checkpointScreenshot(
        page,
        testInfo,
        'linkedin-network-no-suggestions',
      )
      return
    }

    await expect(suggestions).toBeVisible({ timeout: smokeTimeout })
    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-network-suggestions')

    await seedSettings(onlyNetworkSuggestionsOn())

    await expect(hiddenSuggestions.first()).toBeAttached({
      timeout: smokeTimeout,
    })
    await expect(suggestions).toBeHidden({ timeout: smokeTimeout })
    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(
      page,
      testInfo,
      'linkedin-network-suggestions-blocked',
    )

    await seedSettings(allSectionsOff())

    await expect(hiddenSuggestions).toHaveCount(0, {
      timeout: smokeTimeout,
    })
    await expect(suggestions).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(
      page,
      testInfo,
      'linkedin-network-suggestions-restored',
    )
  })
})
