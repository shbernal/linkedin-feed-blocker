import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Generous per-test budget only because each test launches and tears down its
  // own persistent Chromium; a cold first launch has been seen to spend most of
  // a 30s budget on shutdown alone. Real assertion failures still surface in
  // seconds through the `expect` timeout below.
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
})
