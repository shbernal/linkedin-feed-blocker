import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/manual',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 0,
  expect: {
    timeout: 30_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    headless: false,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'manual-linkedin-chromium-extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
})
