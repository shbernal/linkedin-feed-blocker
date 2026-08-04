# Experimental Status

This extension has moved beyond a placeholder scaffold, but it should still be
treated as an experimental implementation.

## Already Done

- MV3 extension scaffold with Vite, React, TypeScript, and
  `@crxjs/vite-plugin`.
- LinkedIn manifest targeting and host permissions.
- Background keyboard command for toggling the current supported LinkedIn page.
- Popup UI with a master toggle and per-section toggles for Home and My Network.
- Persistent settings in `chrome.storage.local` with legacy active-flag
  migration.
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
- Source-tree guard that fails if any `chrome.*` call site is awaited.
- Opt-in real LinkedIn smoke-test lane that reuses an ignored copied Chromium
  profile and records inspection artifacts.
- Listing copy and five 1280x800 screenshots under `store/`, plus extension
  icons and a 440x280 small promo image for the Chrome Web Store.
- Local Chrome upload ZIP packaging with `pnpm package:chrome`.
- GitHub Actions CI split into a `validate` job (format, typecheck, tests with
  coverage, build) and a separate `e2e` job, with the same gates repeated in the
  publish workflow.
- GitHub Release to Chrome Web Store publishing workflow, modeled on the
  adjacent TikTok blocker.
- Content script split into selector, route, blocking, and wiring modules with
  an exported init/cleanup pair.
- In-page shortcut fallback matched against the browser's real command binding
  rather than a hard-coded `Ctrl+Shift+7`.

## Why It Is Still Rough

The current blocking approach is deliberately simple and not very efficient.

- The content script is injected on all LinkedIn pages, while the useful targets
  are currently only `/feed/` and `/mynetwork/grow/`.
- Blocking re-runs from a subtree-wide `MutationObserver`, which fires on any
  element insertion anywhere on the page.
- Each run still re-queries every enabled selector group for the current
  supported route.
- Hiding happens from JavaScript after the page has painted, so blocked sections
  flash briefly on load. A `document_start` stylesheet would fix that for the
  selector-only targets, but the predicate-gated My Network sections cannot be
  expressed in static CSS, so a partial gate is the most that is available.
- Several selectors use `:has(...)` and broad section-level matches. These can
  be expensive and brittle on LinkedIn's dynamic DOM.
- Selectors are based on current observed markup, including attributes that may
  change without warning.
- Hiding uses inline `display: none`, which is reversible for managed elements
  but not a nuanced layout-preserving strategy.
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
3. Move selector-only hiding to a `document_start` stylesheet so blocked
   sections stop flashing, accepting that the predicate-gated My Network
   sections cannot follow.
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
