# Experimental Status

This extension has moved beyond a placeholder scaffold, but it should still be
treated as an experimental implementation.

## Already Done

- MV3 extension scaffold with Vite, React, TypeScript, and
  `@crxjs/vite-plugin`, building the Chromium target to `dist/` and the Gecko
  target to `dist-firefox/` from one source tree.
- LinkedIn manifest targeting and host permissions, with the background entry
  and `browser_specific_settings.gecko` switched on `EXT_TARGET`.
- Background keyboard command for toggling the current supported LinkedIn page.
- In-page shortcut fallback matched against the browser's real command binding
  rather than a hard-coded `Ctrl+Shift+7`.
- Popup UI with a master toggle and per-section toggles for Home and My Network.
- Persistent settings in `chrome.storage.local` with legacy active-flag
  migration.
- Content script split into selector, route, blocking, and wiring modules with
  an exported init/cleanup pair.
- Content-script selectors for Home feed, Home right rail, My Network puzzle,
  My Network Premium, and My Network suggestions.
- Route-gated selector application for the currently supported Home and My
  Network routes.
- Restore path for elements hidden by the extension's managed data attributes.
- Vitest suite in jsdom over the settings contract, the shortcut parser, the
  route table, the selector predicates, hide/restore, the content-script wiring,
  the background command path, and the popup, with a coverage ratchet.
- Fixture-backed Playwright suite that runs the unpacked build in a real
  Chromium against local LinkedIn-shaped pages, with no account and no network.
- Source-tree guards that fail if any `chrome.*` call site is awaited, or if the
  two build targets differ in anything but the manifest.
- Opt-in real LinkedIn smoke-test lane that reuses a gitignored in-repo
  Chromium profile and records inspection artifacts.
- oxlint over the source tree, with `react-hooks/exhaustive-deps` scoped to the
  popup, and oxfmt as the formatter.
- `web-ext lint` over the Gecko package, plus `pnpm validate:firefox`, which
  drives that package in a real Firefox over WebDriver BiDi and reports a check
  it could not run as `SKIP`.
- Listing copy and five 1280x800 screenshots under `store/`, plus extension
  icons generated from `store/logo.svg` and a 440x280 small promo image for the
  Chrome Web Store.
- addons.mozilla.org listing metadata under `amo/`, including the
  data-collection answer and the reviewer instructions for the source archive.
- Local packaging with `pnpm package:chrome`, `pnpm package:firefox` and
  `pnpm package:source`.
- GitHub Actions CI split into a `validate` job (format, lint, typecheck, tests
  with coverage, build, Gecko lint) and a separate `e2e` job.
- Two independent publish workflows, one per store, both triggered by a
  published GitHub Release and both repeating the CI gates. Neither waits for
  the other.

## Why It Is Still Rough

The current blocking approach is deliberately simple and not very efficient.

- The content script is injected on all LinkedIn pages, while the useful targets
  are currently only `/feed/` and `/mynetwork/grow/`.
- Blocking re-runs from a subtree-wide `MutationObserver`, which fires on any
  element insertion anywhere on the page.
- Each run still re-queries every enabled selector group for the current
  supported route.
- Hiding still happens from JavaScript, after the page has painted. A
  `document_start` stylesheet now covers the `/feed/` route, so the feed and
  right rail no longer flash on a full page load, but the three
  `/mynetwork/grow/` sections match on text content or document position, have
  no CSS equivalent, and still flash. Nothing covers a client-side navigation
  into a route either: the gate is already cleared by then, so the flash there
  is bounded by the observer's scheduled pass rather than by the stylesheet.
- The curtain hides the union of the feed route's targets, because nothing knows
  which sections are blocked until the settings read lands. A section the user
  left unblocked therefore appears a moment after load instead of being hidden a
  moment after it.
- Several selectors use `:has(...)` and broad section-level matches. These can
  be expensive and brittle on LinkedIn's dynamic DOM.
- Selectors are based on current observed markup, including attributes that may
  change without warning.
- Hiding uses inline `display: none`, which is reversible for managed elements
  but not a nuanced layout-preserving strategy.
- The pre-paint curtain was measured on a live LinkedIn feed, not just on
  fixtures: at the first animation frame in which each `/feed/` target existed,
  the gate was still uncleared and all four were already hidden, with the feed
  container collapsed to zero height. Because a `requestAnimationFrame` callback
  runs before its paint, no earlier paint existed for a flash to appear in.
- Fixtures resemble LinkedIn but are not LinkedIn. They prove the selectors
  still match the markup that was copied; only the opt-in real-site lane can
  notice that LinkedIn changed it.
- The publish workflow still depends on repository variables, Google Cloud OIDC
  trust, and Chrome Web Store item access being kept in sync outside the repo.

## Hardening Direction

Before treating this as maintained, prefer these steps:

1. Narrow the observer to a more targeted page-change signal than "any element
   inserted anywhere".
2. Narrow selectors and document which LinkedIn attributes are expected to be
   stable enough to depend on.
3. Decide whether the `/mynetwork/grow/` sections can be narrowed enough to
   express in CSS, which is the only way the flash there goes away. The
   `/feed/` route is already covered by a `document_start` stylesheet.
4. Extend real smoke coverage to `/mynetwork/grow/` after the Home feed path is
   stable.
5. Re-copy the fixture markup from live pages whenever a selector changes, so
   the deterministic suites keep testing the page rather than themselves.
6. Run manual unpacked-extension checks after build and record any route-specific
   caveats here.
7. Refresh and re-sanitize Chrome Web Store screenshots after selector or UI
   changes.

Until then, optimize for easy inspection, quick iteration, and honest docs over
polished release behavior.
