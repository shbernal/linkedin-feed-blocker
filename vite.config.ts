import path from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import manifest from './manifest.config.ts'

// `EXT_TARGET=firefox` builds the AMO package into `dist-firefox/`. Any other
// value, including none, builds the Chrome package into `dist/`, so the
// existing Chrome path never has to opt in.
const isFirefox = process.env.EXT_TARGET === 'firefox'

export default defineConfig({
  resolve: {
    alias: {
      '@': `${path.resolve(import.meta.dirname, 'src')}`,
    },
  },
  plugins: [
    react(),
    crx({ manifest, browser: isFirefox ? 'firefox' : 'chrome' }),
  ],
  build: {
    outDir: isFirefox ? 'dist-firefox' : 'dist',
  },
  server: {
    cors: {
      origin: isFirefox ? [/moz-extension:\/\//] : [/chrome-extension:\/\//],
    },
  },
})
