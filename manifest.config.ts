import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'LinkedIn Feed Blocker',
  version: pkg.version,
  description: pkg.description,
  permissions: ['activeTab', 'storage'],
  host_permissions: ['*://*.linkedin.com/*'],
  background: {
    service_worker: 'src/background/main.ts',
    type: 'module',
  },
  commands: {
    'toggle-current-page-block': {
      suggested_key: {
        default: 'Ctrl+Shift+7',
        mac: 'Command+Shift+7',
      },
      description: 'Toggle blocking for the current LinkedIn page',
    },
  },
  content_scripts: [
    {
      matches: ['*://*.linkedin.com/*'],
      js: ['src/content/main.ts'],
      run_at: 'document_end',
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'LinkedIn Feed Blocker',
  },
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
})
