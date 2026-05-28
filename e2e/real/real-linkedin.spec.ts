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

const networkSuggestionsSectionSelector =
  'section:not([aria-label="Contenu principal"])' +
  ':not([aria-label="Main content"])' +
  ':not([componentkey="pending-invitations-preview"])'

const networkSuggestionsHeadingPattern =
  /Suggestions for you|Personalized suggestions|Suggestions personnalisées/

const allSectionsOff = (): ExtensionSettings => ({
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPeople: false,
  networkSuggestions: false,
  networkLeftAd: false,
})

const onlyFeedOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  feed: true,
})

const onlyNetworkSuggestionsOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  networkSuggestions: true,
})

const onlyNetworkGrowOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  networkPuzzle: true,
  networkPeople: true,
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

    const suggestions = page
      .locator(networkSuggestionsSectionSelector)
      .filter({ hasText: networkSuggestionsHeadingPattern })
      .first()
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
    await checkpointScreenshot(page, testInfo, 'linkedin-network-unblocked')

    await seedSettings(onlyNetworkSuggestionsOn())

    await expect(hiddenSuggestions.first()).toBeAttached({
      timeout: smokeTimeout,
    })
    await expect(suggestions).toBeHidden({ timeout: smokeTimeout })
    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-network-blocked')

    await seedSettings(allSectionsOff())

    await expect(hiddenSuggestions).toHaveCount(0, {
      timeout: smokeTimeout,
    })
    await expect(suggestions).toBeVisible({ timeout: smokeTimeout })
    await checkpointScreenshot(page, testInfo, 'linkedin-network-restored')
  })

  test('keeps My Network invitations and hides lower Grow sections', async ({
    clearSettings,
    seedSettings,
    newRealLinkedInPage,
  }) => {
    await clearSettings()
    await seedSettings(onlyNetworkGrowOn())

    const page = await newRealLinkedInPage()
    await gotoRealLinkedInPage(page, 'https://www.linkedin.com/mynetwork/grow/')
    await assertSignedIn(page)
    await page.waitForTimeout(3000)

    const invitations = page
      .locator('section[componentkey="pending-invitations-preview"]')
      .first()
    const growTab = page.getByText('Développer').first()
    const sidebar = page.getByText('Gérer mon réseau').first()

    const hiddenLowerSectionCount = async () =>
      page
        .locator(
          [
            '[data-ltfb-network-puzzle-hidden="true"]',
            '[data-ltfb-network-people-hidden="true"]',
            '[data-ltfb-network-suggestions-hidden="true"]',
          ].join(', '),
        )
        .count()

    const visibleSectionsAfterInvitations = async () =>
      page.evaluate(() => {
        const invitations = document.querySelector<HTMLElement>(
          'section[componentkey="pending-invitations-preview"]',
        )

        if (!invitations) {
          return ['missing invitations']
        }

        return Array.from(document.querySelectorAll<HTMLElement>('section'))
          .filter(section => {
            const mainContent = section.closest(
              'section[aria-label="Contenu principal"], section[aria-label="Main content"]',
            )
            const rect = section.getBoundingClientRect()
            const style = getComputedStyle(section)

            return (
              mainContent !== null &&
              mainContent !== section &&
              Boolean(
                invitations.compareDocumentPosition(section) &
                Node.DOCUMENT_POSITION_FOLLOWING,
              ) &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0
            )
          })
          .map(section => section.innerText.slice(0, 80))
      })

    await expect(invitations).toBeVisible({ timeout: smokeTimeout })
    await expect(growTab).toBeVisible({ timeout: smokeTimeout })
    await expect(sidebar).toBeVisible({ timeout: smokeTimeout })
    await expect
      .poll(hiddenLowerSectionCount, { timeout: smokeTimeout })
      .toBeGreaterThan(0)
    await expect
      .poll(visibleSectionsAfterInvitations, {
        timeout: smokeTimeout,
      })
      .toEqual([])
  })
})
