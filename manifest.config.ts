import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

// Gecko needs an explicit add-on id and an up-front data-collection answer.
// Chrome has no use for either key, so they are only emitted for the Firefox
// build and the default build stays exactly what ships to the Chrome Web Store.
const isFirefox = process.env.EXT_TARGET === 'firefox'

// crxjs names each output chunk after its entry file's basename, so the two
// entries must not both be called `main.ts`: the generated
// `service-worker-loader.js` then picks whichever `main.ts-<hash>.js` it
// resolves first and can end up importing the content script instead of the
// background script.
export default defineManifest({
  manifest_version: 3,
  name: 'LinkedIn Feed Blocker',
  version: pkg.version,
  description: pkg.description,
  permissions: ['activeTab', 'storage'],
  host_permissions: ['*://*.linkedin.com/*'],
  // Gecko has no extension service workers, and crxjs reads the background
  // entry straight off this manifest rather than rewriting it per target, so
  // the conditional has to live here. crxjs adds `"type": "module"` to the
  // Firefox entry itself.
  background: isFirefox
    ? { scripts: ['src/background/service-worker.ts'] }
    : { service_worker: 'src/background/service-worker.ts', type: 'module' },
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
      js: ['src/content/content-script.ts'],
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
  ...(isFirefox
    ? {
        browser_specific_settings: {
          gecko: {
            // Permanent. AMO binds the listing, the review history and every
            // installed user's update path to this id from the first upload
            // onward; changing it creates a different add-on and strands
            // everyone already on this one.
            id: 'linkedin-feed-blocker@shbernal.github.io',
            // 140 is the floor for `data_collection_permissions`; below it the
            // key is ignored and the disclosure never reaches the user.
            strict_min_version: '140.0',
            // The extension reads and writes nothing but its own settings.
            data_collection_permissions: { required: ['none'] },
          },
        },
      }
    : {}),
})
