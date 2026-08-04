# Repository Instructions

## Project State

This is an experimental Manifest V3 Chrome extension for reducing distracting
LinkedIn surfaces. Treat it as a published prototype with release automation,
not as a polished extension.

The broader dev-project note is useful background, but the current source and
repo-local docs are the durable source of truth for implementation details. This
project is adjacent to `tiktok-feed-blocker` and now uses the same broad
GitHub Release to Chrome Web Store workflow shape, adapted to this repo's
smaller validation surface.

## Project Shape

The extension is built with Vite, React, TypeScript, and
`@crxjs/vite-plugin`.

- `manifest.config.ts` defines the MV3 manifest and reads the version from
  `package.json`.
- `src/background/service-worker.ts` handles the keyboard command that asks the
  active LinkedIn tab to toggle blocking for the current page, and mirrors the
  resolved command binding into storage for the content script.
- `src/content/content-script.ts` runs on LinkedIn pages and wires the listeners,
  the mutation observer, and the scheduled re-apply.
- `src/content/selectors.ts` owns the section-to-selector table, the managed
  `data-ltfb-*` attributes, and the DOM predicates.
- `src/content/routes.ts` maps a pathname to the sections the extension may
  touch there.
- `src/content/blocking.ts` owns hiding, restoring, and the managed-attribute
  bookkeeping.
- `src/popup/App.tsx` is the popup UI for global and per-section toggles.
- `src/shared/settings.ts` owns storage keys, defaults, normalization, and
  legacy settings migration.
- `src/shared/shortcut.ts` parses a `chrome.commands` binding into a keydown
  matcher for the in-page fallback.
- `src/shared/linkedin.ts` answers whether a URL is on LinkedIn.
- `scripts/check-browser-api.mjs` fails the build if any `chrome.*` call site is
  awaited instead of callback-based.
- `public/icons/` contains extension icons copied into builds.
- `store/` contains listing assets shared across stores: the long description
  and the screenshot set.
- `chrome-web-store/` contains Chrome-specific listing assets: privacy
  justifications, the promo tile, and the logo source artwork.
- `docs/` contains contributor-facing project and implementation notes.
- `.github/workflows/ci.yml` validates pull requests and pushes to `master`.
- `.github/workflows/publish-cws.yml` publishes Chrome Web Store submissions
  from published GitHub Releases.
- `dist/` and `release/` are generated or packaged outputs and are ignored by
  git.

## Commands

Use `pnpm`, following the `packageManager` field in `package.json`.

- `pnpm dev` starts the Vite dev server for extension development.
- `pnpm typecheck` runs the TypeScript project build without emitting files.
- `pnpm typecheck:e2e` type-checks the local Playwright real-site harness.
- `pnpm check:browser-api` fails if any `chrome.*` call site is awaited.
- `pnpm build` runs TypeScript checks and creates the extension build in
  `dist/`.
- `pnpm format` checks Prettier formatting.
- `pnpm preview` previews the Vite build.

There is no automated test suite in this repo yet. Do not document or rely on
`pnpm test` until tests are actually added.

For docs-only changes, run a targeted Prettier check on the touched markdown
files. For source, manifest, popup, content-script, background, settings, icon,
or packaging changes, run at least `pnpm check:browser-api`, `pnpm typecheck`,
`pnpm typecheck:e2e`, and `pnpm build`.

## CI And Publishing

- Normal CI runs `pnpm format`, `pnpm check:browser-api`, `pnpm typecheck`,
  `pnpm typecheck:e2e`, and `pnpm build`.
- The Chrome Web Store workflow runs only on published GitHub Releases and
  requires the release tag to match `package.json` with an optional leading
  `v`.
- The publish workflow expects repository variables named `CWS_EXTENSION_ID`,
  `CWS_PUBLISHER_ID`, `GCP_PROJECT_ID`, `GCP_SERVICE_ACCOUNT`, and
  `GCP_WORKLOAD_IDENTITY_PROVIDER`.
- Keep the Google Cloud Workload Identity Federation trust restricted to
  `shbernal/linkedin-feed-blocker` tag refs.
- Do not publish releases, push tags, upload packages, or change Chrome Web
  Store settings unless explicitly asked.

## Coding Guidelines

- Keep changes narrow and follow the existing TypeScript style: strict types, no
  semicolons, single quotes, 2-space indentation, and 80-column Prettier
  wrapping.
- Treat `ExtensionSettings` and `PageSection` as the contract between popup,
  content script, background messages, and storage. Update all related surfaces
  together when adding, renaming, or removing a blocked section.
- LinkedIn selectors are brittle. Prefer stable attributes, route-specific
  checks, accessible labels, and small fixture-backed selectors over generated
  class names or broad structural matches.
- Keep content-script DOM changes idempotent. If the script hides an element, it
  should mark that element with a managed data attribute and be able to restore
  only the elements it changed.
- The content script reapplies blocking from a mutation observer that coalesces
  into a single scheduled pass. Do not reintroduce a polling interval; if a
  surface is missed, fix the trigger or the selector.
- Hiding is still inline `display: none` plus a managed attribute, which means a
  brief flash of feed content before the first pass. Moving to a
  `document_start` stylesheet is the intended next step, not a settled design.
- Preserve high-value LinkedIn surfaces by default. In particular, the My
  Network invitation area should stay visible unless the user explicitly asks to
  block it.
- Never `await` a `chrome.*` call. Gecko exposes `chrome.*` as callback-only, so
  an awaited call resolves to `undefined` there with no error while every Chrome
  check stays green. `pnpm check:browser-api` enforces this.
- Keep the popup compact. It is designed around a 320px width, so avoid verbose
  explanatory text inside the extension UI.

## Documentation Guidelines

- Prefer `docs/` for contributor-facing status, architecture, validation, and
  maintenance notes.
- Keep `README.md` concise and aligned with the current user-facing extension
  behavior.
- Update `docs/current-implementation.md` when runtime surfaces, settings shape,
  message contracts, selectors, or manifest behavior changes.
- Update `docs/experimental-status.md` when known limitations, validation gaps,
  or the hardening plan changes.
- Update `docs/ci-release-flow.md` when CI gates, release triggers, workflow
  variables, or Chrome Web Store publishing behavior changes.
- Keep docs tied to current code. Put speculative roadmap context in docs only
  when the user asks for planning documentation.

## Generated And Release Files

- Do not hand-edit `dist/`; update source/config and rebuild instead.
- Do not create or replace files in `release/` unless doing explicit release
  packaging.
- Do not bump `package.json` version unless explicitly requested.
- Do not hand-edit GitHub Release assets; rebuild from source and let the
  publish workflow attach the generated zip when doing automated releases.

## Manual Validation Notes

After a build, load `dist/` as an unpacked extension in Chrome or Chromium when
behavior needs runtime validation. Check at least:

- popup toggles persist via `chrome.storage.local`;
- `/feed/` main feed and right-rail blocking behave as expected;
- `/mynetwork/grow/` puzzle, people sections, and left ad blocking behave as
  expected while invitations remain visible;
- the command in `manifest.config.ts` toggles the currently supported LinkedIn
  page;
- disabled sections restore elements hidden by the extension.
