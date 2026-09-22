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

const SECTION_LABELS = [
  'Block red dots',
  'Block Premium link',
  'Block feed',
  'Block right feed',
  'Block puzzle',
  'Block Premium',
  'Block suggestions',
  'Block sidebar',
]

// The checkbox itself is visually replaced by the slider, so the click has to
// land on the slider while the assertions read the checkbox.
const clickSwitch = async (page: Page, label: string) => {
  await page
    .locator('.switch-row', { hasText: label })
    .locator('.slider')
    .click()
}

test('reflects and persists section toggles', async ({
  clearSettings,
  seedSettings,
  openExtensionPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings({ ...EVERYTHING_BLOCKED, rightFeed: false })

  const popup = await openExtensionPage('/src/popup/index.html')

  await expect(popup.getByLabel('Block all sections')).not.toBeChecked()
  await expect(popup.getByLabel('Block feed', { exact: true })).toBeChecked()
  await expect(popup.getByLabel('Block right feed')).not.toBeChecked()

  await clickSwitch(popup, 'Block right feed')

  await expect(popup.getByLabel('Block all sections')).toBeChecked()
  await expect.poll(readSettings).toEqual(EVERYTHING_BLOCKED)

  await clickSwitch(popup, 'Block puzzle')

  await expect(popup.getByLabel('Block puzzle')).not.toBeChecked()
  await expect.poll(readSettings).toEqual({
    ...EVERYTHING_BLOCKED,
    networkPuzzle: false,
  })
})

test('turns every section off and back on from the master toggle', async ({
  clearSettings,
  seedSettings,
  openExtensionPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings(EVERYTHING_BLOCKED)

  const popup = await openExtensionPage('/src/popup/index.html')

  await clickSwitch(popup, 'Block all sections')

  for (const label of SECTION_LABELS) {
    await expect(popup.getByLabel(label, { exact: true })).not.toBeChecked()
  }
  await expect.poll(readSettings).toEqual(NOTHING_BLOCKED)

  await clickSwitch(popup, 'Block all sections')

  for (const label of SECTION_LABELS) {
    await expect(popup.getByLabel(label, { exact: true })).toBeChecked()
  }
  await expect.poll(readSettings).toEqual(EVERYTHING_BLOCKED)
})
