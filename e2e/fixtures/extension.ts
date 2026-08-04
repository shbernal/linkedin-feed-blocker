import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import {
  LEGACY_ACTIVE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  type ExtensionSettings,
} from '../../src/shared/settings'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../../src/shared/shortcut'
import {
  closeBrowserContext,
  getExtensionId,
  getStorageValue,
  launchBrowserProfileContext,
  openExtensionPage as openExtensionPageInContext,
  removeStorageValues,
  setStorageValue,
  waitForExtensionWorker,
} from './extensionRuntime'
import { installLinkedInFixtureRoutes } from './linkedinPages'

type ExtensionFixtures = {
  extensionContext: BrowserContext
  extensionId: string
  newLinkedInPage: () => Promise<Page>
  openExtensionPage: (pagePath: string) => Promise<Page>
  clearSettings: () => Promise<void>
  seedSettings: (settings: ExtensionSettings) => Promise<void>
  readSettings: () => Promise<ExtensionSettings | undefined>
  readToggleShortcut: () => Promise<string | undefined>
}

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({ headless }, use, testInfo) => {
    const userDataDir = testInfo.outputPath('chromium-profile')
    const context = await launchBrowserProfileContext({
      userDataDir,
      headless,
    })

    await installLinkedInFixtureRoutes(context)
    await waitForExtensionWorker(context)

    await use(context)
    await closeBrowserContext(context)
  },

  extensionId: async ({ extensionContext }, use) => {
    await use(await getExtensionId(extensionContext))
  },

  newLinkedInPage: async ({ extensionContext }, use) => {
    await use(async () => extensionContext.newPage())
  },

  openExtensionPage: async ({ extensionContext, extensionId }, use) => {
    await use(async pagePath => {
      return openExtensionPageInContext(extensionContext, extensionId, pagePath)
    })
  },

  clearSettings: async ({ extensionContext }, use) => {
    await use(async () => {
      await removeStorageValues(extensionContext, [
        SETTINGS_STORAGE_KEY,
        LEGACY_ACTIVE_STORAGE_KEY,
      ])
    })
  },

  seedSettings: async ({ extensionContext }, use) => {
    await use(async settings => {
      await setStorageValue(extensionContext, SETTINGS_STORAGE_KEY, settings)
    })
  },

  readSettings: async ({ extensionContext }, use) => {
    await use(async () =>
      getStorageValue<ExtensionSettings>(
        extensionContext,
        SETTINGS_STORAGE_KEY,
      ),
    )
  },

  readToggleShortcut: async ({ extensionContext }, use) => {
    await use(async () =>
      getStorageValue<string>(extensionContext, TOGGLE_SHORTCUT_STORAGE_KEY),
    )
  },
})

export { expect }
