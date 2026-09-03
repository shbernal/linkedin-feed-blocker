import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // `e2e/**` is Playwright's; `.e2e/**` is the gitignored local scratch area
    // for real-site profiles and throwaway probe specs. Vitest must own
    // neither, or a stray spec there fails the unit run.
    exclude: [...configDefaults.exclude, 'e2e/**', '.e2e/**'],
    environmentOptions: {
      jsdom: {
        url: 'https://www.linkedin.com/feed/',
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/popup/main.tsx'],
      // A floor that only moves up. Set a couple of points below the measured
      // numbers so an unrelated change cannot quietly erode coverage, while
      // leaving room for small refactors. Raise these when coverage rises.
      // The text reporter omits fully covered files; that is `skipFull`
      // behaviour, not a gap in the report.
      thresholds: {
        statements: 95,
        branches: 91,
        functions: 96,
        lines: 95,
      },
    },
  },
})
