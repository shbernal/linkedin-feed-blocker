# Current implementation

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

`content_scripts` carries a second entry, for CSS only. It injects
`src/content/blocking.css` at `document_start`, and its `matches` is narrowed to
`*://*.linkedin.com/feed` and `*://*.linkedin.com/feed/*`. The narrowing is the
point: the stylesheet has to be route-scoped, and doing it in the manifest means
the browser decides before any of the extension's code runs. Scoping it with an
attribute the content script writes would reintroduce the race the stylesheet
exists to close. Both build targets emit this entry identically.

The two entry files must keep distinct basenames
(`src/background/service-worker.ts` and `src/content/content-script.ts`). crxjs
names each output chunk after its entry's basename, so when both were called
`main.ts` the generated `dist/service-worker-loader.js` imported the content
script chunk instead of the background one and the keyboard command never
registered. After a build, `dist/service-worker-loader.js` should import the
`service-worker.ts-*.js` chunk.

## Shared settings

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

## Background command flow

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
aligned with the real binding, including the macOS `Command+Shift+7` case and
any binding the user has rebound in `chrome://extensions/shortcuts`. An unbound
command mirrors an empty string, which falls back to the manifest default. A
binding the page can never observe parses to `null` and the fallback matches
nothing, rather than silently answering the default keys.

## Chrome API conventions

Every `chrome.*` call site uses the callback form, and
`tests/browser-api-compat.test.ts` fails the suite on any `await chrome.` under
`src/`. See [Never await a `chrome.*` call](./firefox-amo.md#never-await-a-chrome-call)
for what breaks otherwise and why the polyfill was rejected.

## Popup flow

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

## Content script flow

The content script is split into five modules:

| File                            | Responsibility                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/content/selectors.ts`      | `SECTION_TARGETS`, the managed `data-ltfb-*` attribute per section, and the DOM predicates |
| `src/content/routes.ts`         | maps a pathname to the sections the extension may touch there                              |
| `src/content/blocking.ts`       | hide, restore, and the managed-attribute bookkeeping                                       |
| `src/content/blockingStyles.ts` | the pre-paint curtain: the ready gate and the generator for `blocking.css`                 |
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

### The pre-paint curtain

Blocking runs from JavaScript, which means it runs after the page has painted.
`src/content/blocking.css` closes that window on the `/feed/` route by hiding
the route's targets from `document_start` until the content script has read
settings and applied them.

It is generated from `SECTION_TARGETS` by `src/content/blockingStyles.ts` and
checked byte for byte against that generator by `tests/blocking-css.test.ts`.
Generating rather than hand-writing is what keeps the stylesheet and the
JavaScript path from disagreeing about what a section targets; the guard is what
makes the checked-in file trustworthy. Regenerate with
`UPDATE_BLOCKING_CSS=1 pnpm test`.

Only `feed` and `rightFeed` are covered. `networkPuzzle` and `networkPremium`
match on text content and `networkSuggestions` compares document position
against the pending-invitations preview, so none of the three has a CSS
equivalent. The split falls on the route boundary, which is what makes a partial
migration worth doing: `/feed/` is entirely CSS-expressible and `/feed/` is
where the flash hurts. The `/mynetwork/grow/` sections are unaffected by any of
this and keep the JavaScript path alone.

The curtain is not a second blocking mechanism. It hides nothing permanently,
marks no elements, and stops applying entirely once the gate is cleared.
`data-ltfb-ready` on `<html>` is the gate, and it is one-way: absent means "not
decided yet", never "nothing blocked", so `cleanupContentScript()` sets it
rather than clearing it. An unloaded extension must not leave the page hidden.

Two consequences worth knowing:

- The curtain hides the union of the route's targets, because nothing knows
  which sections are blocked until the settings read lands. A section the user
  left unblocked appears a moment after load rather than being hidden a moment
  after it. `chrome.storage.local` has no synchronous read, so there is no way
  around this.
- The rule expires on its own after `CURTAIN_EXPIRY_MS`. Without that, a content
  script that never runs would leave LinkedIn permanently blank, which is a
  worse failure than the flash. `READY_FALLBACK_MS` is the shorter
  JavaScript-side backstop for a storage read that never returns, so the CSS
  expiry stays the last resort.

The curtain uses `content-visibility: hidden` and `visibility: hidden` rather
than `display: none`, because `display` cannot be restored by an animation in
either engine and those two can. They are both needed:
`content-visibility` collapses a container's box the way `display: none` does
but does not hide a replaced element, and `visibility` hides the ad image and
iframe but reserves their space.

### Lifecycle

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

## Current selector strategy

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

Selector shapes are covered by `src/test/fixtures/linkedin.ts` in both the unit
and fixture-Playwright layers. They remain brittle in the sense that matters:
LinkedIn can change the markup, and only the real-site lane notices.

## Validation today

Available commands:

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm e2e`
- `pnpm build`
- `pnpm format`
- `pnpm e2e:real:setup`
- `pnpm e2e:real:login`
- `pnpm e2e:real`

`pnpm test` covers the settings contract, the shortcut parser, the route table,
the selector predicates, hide/restore, the content-script wiring, the background
command path, and the popup, in jsdom. `pnpm e2e` runs the unpacked build in a
real Chromium against local LinkedIn-shaped fixtures. Both are deterministic and
both run in CI.

The real-site Playwright lane stays opt-in: it uses a gitignored persistent
Chromium profile under `.e2e/linkedin-real-profile`, loads the built extension,
and
captures screenshots/video/trace artifacts under ignored Playwright output
directories. It is the selector-drift canary, which no fixture can be.

See [Testing](./testing.md) for the full layer map and the fixture-fidelity
rule.

`e2e/specs/background-command.spec.ts` guards the entry-name regression: it
asserts the service worker is running the background chunk by checking that
`chrome.commands.getAll()` resolves the toggle command, that
`chrome.commands.onCommand.hasListeners()` is true, and that the live binding
reached the `toggleShortcut` mirror. It needs the extension loaded but not a
LinkedIn session, which is why it sits in the deterministic suite rather than
the credentialed lane.

The one path no harness covers is Chrome delivering a real OS keystroke to
`chrome.commands.onCommand`. Playwright's key events reach the renderer, so they
exercise the in-page fallback rather than the browser-level command dispatch;
that link needs a human pressing the shortcut in a normal Chrome window.
