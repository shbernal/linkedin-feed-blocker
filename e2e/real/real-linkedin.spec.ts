import type { Page, TestInfo } from '@playwright/test'
import { test, expect } from '../fixtures/realExtension'
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
} from '../../src/shared/settings'

const smokeTimeout = 45_000

const feedSelector =
  'div[data-testid="mainFeed"][data-component-type="LazyColumn"]' +
  '[role="list"][componentkey="container-update-list_mainFeed-lazy-container"]'

const allSectionsOff = (): ExtensionSettings => ({
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPeople: false,
  networkLeftAd: false,
})

const onlyFeedOn = (): ExtensionSettings => ({
  ...allSectionsOff(),
  active: true,
  feed: true,
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
})
