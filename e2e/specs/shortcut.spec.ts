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

// `chrome.commands` is not exposed to content scripts, so the in-page keydown
// fallback can only answer the right keys if the background script mirrored
// the live binding into storage first. This is that whole round trip.
test('the toggle shortcut blocks and restores the current page', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
  readSettings,
  readToggleShortcut,
}) => {
  await clearSettings()
  await seedSettings(NOTHING_BLOCKED)
  await expect.poll(readToggleShortcut).toBe('Ctrl+Shift+7')

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/feed/')
  await expect(page.locator('#main-feed')).toBeVisible()

  await page.bringToFront()
  await page.keyboard.press('Control+Shift+7')

  await expect(page.locator('#main-feed')).toHaveCSS('display', 'none')
  await expect(page.locator('#right-rail-games')).toBeHidden()
  await expect.poll(readSettings).toMatchObject({
    active: true,
    feed: true,
    rightFeed: true,
  })

  await page.keyboard.press('Control+Shift+7')

  await expect(page.locator('#main-feed')).toBeVisible()
  await expect.poll(readSettings).toMatchObject({
    active: false,
    feed: false,
    rightFeed: false,
  })
})

test('the toggle shortcut does nothing on an unsupported route', async ({
  clearSettings,
  seedSettings,
  newLinkedInPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings(NOTHING_BLOCKED)

  const page = await newLinkedInPage()
  await page.goto('https://www.linkedin.com/jobs/')

  await page.bringToFront()
  await page.keyboard.press('Control+Shift+7')

  await expect(page.locator('#right-rail-games')).toBeVisible()
  await expect.poll(readSettings).toMatchObject(NOTHING_BLOCKED)
})
