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

| Key             | Intended surface                          |
| --------------- | ----------------------------------------- |
| `feed`          | Home main feed                            |
| `rightFeed`     | Home right-rail feed widgets and ads      |
| `networkPuzzle` | My Network puzzle section                 |
| `networkPeople` | My Network people recommendation sections |
| `networkLeftAd` | My Network left-rail ad                   |

When adding or removing a section, update shared settings, popup controls,
content selectors, keyboard toggle behavior, and docs together.

## Background Command Flow

`src/background/main.ts` listens for the `toggle-current-page-block` command,
currently suggested as `Ctrl+Shift+7` (`Command+Shift+7` on macOS). When the
command fires, it queries the active tab, checks that the tab URL is on
`linkedin.com` or a LinkedIn subdomain, and sends this content-script message:

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

`src/content/main.ts` owns DOM mutation behavior:

- maps each `PageSection` to a managed `data-ltfb-*` attribute;
- maps each section to one or more CSS selectors;
- hides matched elements with `element.style.display = 'none'`;
- restores only elements previously marked with the managed data attribute;
- reacts to popup messages and storage changes;
- toggles the current supported route when `Ctrl+Shift+7` is pressed on a
  focused LinkedIn page outside editable fields;
- uses a `MutationObserver` plus a 1-second interval to reapply blocking as
  LinkedIn changes the page.

Supported route toggling is narrow:

- `/feed/` toggles `feed` and `rightFeed`.
- `/mynetwork/grow/` toggles `networkPuzzle`, `networkPeople`, and
  `networkLeftAd`.

Selector application is broader than route toggling: every enabled section is
queried whenever blocking is reapplied. That keeps the prototype simple, but it
is part of the current inefficiency.

## Current Selector Strategy

The selector strategy is based on observed LinkedIn DOM attributes and
structure, not a stable public API.

Current examples:

- Home feed targets a `mainFeed` lazy-column container.
- Home right rail targets game links, discover-hub links, ad images, and a feed
  advertisement iframe.
- My Network puzzle targets game-link sections while excluding the top-level
  main content region and pending invitations.
- My Network people sections target LinkedIn auto-component recommendation
  sections while keeping invitations, tabs, and puzzle content separate.
- My Network left ad targets the ad iframe component key in the left rail.

This works as an experiment, but it should be treated as brittle until covered
by fixtures or real-browser smoke checks.

## Validation Today

Available commands:

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

There are still no unit tests or fixture tests in this repo. Runtime behavior
outside the real smoke path still needs manual validation by loading `dist/` as
an unpacked extension.
