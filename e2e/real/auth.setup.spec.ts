import { test } from '@playwright/test'
import {
  closeBrowserContext,
  launchBrowserProfileContext,
} from '../fixtures/extensionRuntime'
import { resolveRealLinkedInProfilePath } from '../fixtures/realProfile'

test('authenticate persistent LinkedIn profile @setup', async ({
  headless,
}) => {
  test.setTimeout(0)

  const profilePath = resolveRealLinkedInProfilePath()
  const context = await launchBrowserProfileContext({
    userDataDir: profilePath,
    headless,
    loadExtension: false,
  })
  const page = await context.newPage()
  const donePromise = Promise.race([
    page.waitForEvent('close'),
    context.waitForEvent('close'),
  ])

  await page.goto('https://www.linkedin.com/feed/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })

  console.log(`
LinkedIn real E2E profile setup

Profile: ${profilePath}

1. Confirm LinkedIn is signed in in the Chromium window.
2. Complete any checkpoint, 2FA, cookie, or verification prompts manually.
3. Visit https://www.linkedin.com/feed/ once and confirm the feed loads.
4. Close the Chromium tab or window to finish setup.
`)

  await page.bringToFront()
  await donePromise
  await closeBrowserContext(context)
})
