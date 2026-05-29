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
- Basic build/typecheck command surface.
- Opt-in real LinkedIn smoke-test lane that reuses an ignored copied Chromium
  profile and records inspection artifacts.
- Chrome Web Store listing copy, extension icons, five 1280x800 screenshots,
  and a 440x280 small promo image under `chrome-web-store/`.
- Local Chrome upload ZIP packaging with `pnpm package:chrome`.

## Why It Is Still Rough

The current blocking approach is deliberately simple and not very efficient.

- The content script is injected on all LinkedIn pages, while the useful targets
  are currently only `/feed/` and `/mynetwork/grow/`.
- Blocking re-runs from both a subtree-wide `MutationObserver` and a 1-second
  interval.
- Each run still re-queries every enabled selector group for the current
  supported route.
- Several selectors use `:has(...)` and broad section-level matches. These can
  be expensive and brittle on LinkedIn's dynamic DOM.
- Selectors are based on current observed markup, including attributes that may
  change without warning.
- Hiding uses inline `display: none`, which is reversible for managed elements
  but not a nuanced layout-preserving strategy.
- There are no fixture tests or unit tests. The real-browser smoke test is
  useful for selector drift, but it depends on live LinkedIn account state and
  is not deterministic.
- The repo has no remote, CI, automated release process, or Chrome Web Store
  publishing flow.

## Hardening Direction

Before treating this as maintained, prefer these steps:

1. Add fixture-based tests for the LinkedIn DOM shapes this extension targets.
2. Add unit tests for settings normalization, popup persistence, background
   command routing, and content-script hide/restore behavior.
3. Replace the fixed interval with a debounced observer or a more targeted
   page-change signal.
4. Narrow selectors and document which LinkedIn attributes are expected to be
   stable enough to depend on.
5. Extend real smoke coverage to `/mynetwork/grow/` after the Home feed path is
   stable.
6. Run manual unpacked-extension checks after build and record any route-specific
   caveats here.
7. Refresh and re-sanitize Chrome Web Store screenshots after selector or UI
   changes.
8. Decide whether the project stays local/unpacked or gets a real release
   pipeline.

Until then, optimize for easy inspection, quick iteration, and honest docs over
polished release behavior.
