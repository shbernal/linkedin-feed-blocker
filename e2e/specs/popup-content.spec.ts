import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/extension'
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

const clickSwitch = async (page: Page, label: string) => {
  await page
    .locator('.switch-row', { hasText: label })
    .locator('.slider')
    .click()
}

test('popup changes reach an open LinkedIn page', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
  openExtensionPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings(NOTHING_BLOCKED)

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')
  await expect(page.locator('#main-feed')).toBeVisible()

  const popup = await openExtensionPage('/src/popup/index.html')
  await expect(
    popup.getByLabel('Block feed', { exact: true }),
  ).not.toBeChecked()

  await clickSwitch(popup, 'Block feed')

  await expect(page.locator('#main-feed')).toHaveCSS('display', 'none')
  await expect(page.locator('#main-feed')).toHaveAttribute(
    'data-ltfb-feed-hidden',
    'true',
  )
  await expect.poll(readSettings).toMatchObject({ active: true, feed: true })

  await clickSwitch(popup, 'Block feed')

  await expect(page.locator('#main-feed')).toBeVisible()
  await expect.poll(readSettings).toMatchObject({ active: false, feed: false })
})
