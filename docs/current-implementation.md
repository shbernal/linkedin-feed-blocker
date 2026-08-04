# Current Implementation

The extension currently has three runtime surfaces that communicate through
shared settings and Chrome APIs: the popup, background service worker, and
content script.

## Manifest

`manifest.config.ts` defines the Manifest V3 extension metadata. It reads the
extension version from `package.json`, registers the background service worker,
the LinkedIn content script, popup entry point, storage permission, active-tab
permission, LinkedIn host permissions, keyboard command, and icons.

The content script matches all `*.linkedin.com` pages, even though blocking is
currently only useful on `/feed/` and `/mynetwork/grow/`.

The two entry files must keep distinct basenames
(`src/background/service-worker.ts` and `src/content/content-script.ts`). crxjs
names each output chunk after its entry's basename, so when both were called
`main.ts` the generated `dist/service-worker-loader.js` imported the content
script chunk instead of the background one and the keyboard command never
registered. After a build, `dist/service-worker-loader.js` should import the
`service-worker.ts-*.js` chunk.

## Shared Settings

`src/shared/settings.ts` is the storage contract between popup, content script,
and background-triggered updates.

Important exported types and helpers:

- `ExtensionSettings` is the full persisted settings shape.
- `PageSection` is the allowed blocked-section key union.
- `DEFAULT_SETTINGS` enables all supported sections.
- `normalizeSettings(...)` accepts unknown storage values and returns a valid
  settings object.
- `deriveSettingsFromStorage(...)` preserves migration from
  `LEGACY_ACTIVE_STORAGE_KEY`.
- `syncActiveWithPages(...)` derives `active` from section toggles.

Current section keys:

| Key                  | Intended surface                     |
| -------------------- | ------------------------------------ |
| `feed`               | Home main feed                       |
| `rightFeed`          | Home right-rail feed widgets and ads |
| `networkPuzzle`      | My Network puzzle section            |
| `networkPremium`     | My Network Premium upsell section    |
| `networkSuggestions` | My Network suggestions sections      |

When adding or removing a section, update shared settings, popup controls,
content selectors, keyboard toggle behavior, and docs together.

## Background Command Flow

`src/background/service-worker.ts` listens for the `toggle-current-page-block`
command, currently suggested as `Ctrl+Shift+7` (`Command+Shift+7` on macOS).
When the command fires, it queries the active tab, checks that the tab URL is on
`linkedin.com` or a LinkedIn subdomain (`src/shared/linkedin.ts`), and sends this
content-script message:

```ts
{
  action: 'toggleCurrentPageBlock',
}
```

The background script intentionally ignores missing tab IDs, non-LinkedIn URLs,
and expected `sendMessage` failures from tabs without an injected content
script.

The content script also listens for the same focused-page shortcut directly.
That page-level listener is the more reliable path on environments where
Chrome's extension command dispatch does not fire for number-row shortcuts. It
ignores editable fields and uses a short duplicate guard so a working Chrome
command and the page-level listener do not double-toggle the page.

Content scripts cannot read `chrome.commands`, so the background script resolves
the live binding with `chrome.commands.getAll()` on every background start and
mirrors it into the `toggleShortcut` storage key. `src/shared/shortcut.ts` parses
that string into a keydown matcher, which is what keeps the in-page fallback
aligned with the real binding — including the macOS `Command+Shift+7` case and
any binding the user has rebound in `chrome://extensions/shortcuts`. An unbound
command mirrors an empty string, which falls back to the manifest default. A
binding the page can never observe parses to `null` and the fallback matches
nothing, rather than silently answering the default keys.

## Chrome API Conventions

Every `chrome.*` call site uses the callback form. Gecko exposes `chrome.*` as
callback-only, so an awaited call resolves to `undefined` there with no error
while every Chrome check still passes. `scripts/check-browser-api.mjs` scans
`src/` for `await chrome.` and fails CI on a match.

## Popup Flow

`src/popup/App.tsx` reads settings from `chrome.storage.local`, normalizes them,
persists the normalized result, and renders compact toggles for the supported
sections.

On user changes, the popup:

1. Derives the next `ExtensionSettings`.
2. Saves the settings to `chrome.storage.local`.
3. Queries the active tab.
4. Sends an `updateSettings` message to the content script when a tab is
   available.

The popup groups toggles under Home and My Network and is sized around a 320px
width.

## Content Script Flow

The content script is split into four modules:

| File                            | Responsibility                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/content/selectors.ts`      | `SECTION_TARGETS`, the managed `data-ltfb-*` attribute per section, and the DOM predicates |
| `src/content/routes.ts`         | maps a pathname to the sections the extension may touch there                              |
| `src/content/blocking.ts`       | hide, restore, and the managed-attribute bookkeeping                                       |
| `src/content/content-script.ts` | the manifest entry: listeners, observer, scheduled re-apply, shortcut state                |

Together they:

- map each `PageSection` to a managed `data-ltfb-*` attribute;
- map each section to one or more selector targets;
- hide matched elements with `element.style.display = 'none'`;
- restore only elements previously marked with the managed data attribute;
- react to popup messages and storage changes;
- toggle the current supported route when the bound shortcut is pressed on a
  focused LinkedIn page outside editable fields;
- reapply blocking from a `MutationObserver` whose element-insertion callbacks
  coalesce into a single re-apply scheduled 100ms out.

An element LinkedIn itself already set to `display: none` is skipped rather than
adopted, so disabling a section never reveals something the page meant to keep
hidden.

`content-script.ts` exports `initContentScript()` and `cleanupContentScript()`
and only bootstraps itself outside test mode, so the pair can be driven directly
from jsdom. `cleanupContentScript()` removes every listener, disconnects the
observer, and cancels a pending re-apply.

Supported route toggling is narrow:

- `/feed/` toggles `feed` and `rightFeed`.
- `/mynetwork/grow/` toggles `networkPuzzle`, `networkPremium`, and
  `networkSuggestions`.

Selector application is route-gated: `/feed/` only applies Home targets, and
`/mynetwork/grow/` only applies My Network targets. Unsupported routes restore
any elements previously hidden by the extension.

## Current Selector Strategy

The selector strategy is based on observed LinkedIn DOM attributes and
structure, not a stable public API.

Current examples:

- Home feed targets a `mainFeed` lazy-column container.
- Home right rail targets game links, discover-hub links, ad images, and a feed
  advertisement iframe.
- My Network puzzle targets a section inside LinkedIn's `<main>` or
  aria-labelled main content, excluding the top-level Primary content wrapper,
  with a LinkedIn games link and a text fallback for puzzle promo copy.
- My Network Premium targets an auto-component section inside LinkedIn's
  `<main>` or aria-labelled main content that contains both Premium text and a
  Premium link.
- My Network suggestions targets auto-component sections inside LinkedIn's
  `<main>` or aria-labelled main content after the pending invitations preview,
  excluding sections already controlled by the puzzle and Premium toggles.

This works as an experiment, but it should be treated as brittle until covered
by fixtures or real-browser smoke checks.

## Validation Today

Available commands:

- `pnpm check:browser-api`
- `pnpm typecheck`
- `pnpm build`
- `pnpm format`
- `pnpm typecheck:e2e`
- `pnpm e2e:real:setup`
- `pnpm e2e:real:login`
- `pnpm e2e:real`

The current Playwright coverage is an opt-in real LinkedIn smoke check rather
than a deterministic default suite. It uses a copied persistent Chromium
profile under `.e2e/linkedin-real-profile`, loads the built extension, and
captures screenshots/video/trace artifacts under ignored Playwright output
directories.

`e2e/real/background-command.spec.ts` guards the entry-name regression: it
asserts the service worker is running the background chunk by checking that
`chrome.commands.getAll()` resolves the toggle command, that
`chrome.commands.onCommand.hasListeners()` is true, and that the live binding
reached the `toggleShortcut` mirror. It needs the extension loaded but not a
LinkedIn session, so it runs without the `RUN_REAL_LINKEDIN_E2E` gate.

The one path no harness covers is Chrome delivering a real OS keystroke to
`chrome.commands.onCommand`. Playwright's key events reach the renderer, so they
exercise the in-page fallback rather than the browser-level command dispatch;
that link needs a human pressing the shortcut in a normal Chrome window.

There are still no unit tests or fixture tests in this repo. Runtime behavior
outside the real smoke path still needs manual validation by loading `dist/` as
an unpacked extension.
