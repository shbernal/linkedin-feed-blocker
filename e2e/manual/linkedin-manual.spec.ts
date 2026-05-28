import type { BrowserContext } from '@playwright/test'
import { test } from '../fixtures/realExtension'

const manualStartUrl =
  process.env.LINKEDIN_MANUAL_URL ?? 'https://www.linkedin.com/mynetwork/grow/'

const waitForManualStop = async (context: BrowserContext) => {
  await new Promise<void>(resolve => {
    const stop = () => {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      context.off('close', stop)
      resolve()
    }

    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    context.once('close', stop)
  })
}

test('manual LinkedIn extension session', async ({
  extensionContext,
  extensionId,
  newRealLinkedInPage,
}) => {
  test.setTimeout(0)

  const page = await newRealLinkedInPage()
  await page.goto(manualStartUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })

  console.log(`Manual LinkedIn session: ${manualStartUrl}`)
  console.log(`Extension ID: ${extensionId}`)
  console.log('Close the browser or stop the command to end the session.')

  await waitForManualStop(extensionContext)
})
