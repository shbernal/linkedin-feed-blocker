# Repository Instructions

## Project State

This is an experimental Manifest V3 browser extension for reducing distracting
LinkedIn surfaces. It builds for Chromium and for Gecko from one source tree and
ships to the Chrome Web Store and addons.mozilla.org. Treat it as a published
prototype with release automation, not as a polished extension.

The broader dev-project note is useful background, but the current source and
repo-local docs are the durable source of truth for implementation details. This
project is adjacent to `tiktok-feed-blocker` and uses the same broad
GitHub Release to store workflow shape, adapted to this repo's smaller
validation surface.

## Project Shape

The extension is built with Vite, React, TypeScript, and
`@crxjs/vite-plugin`.

- `manifest.config.ts` defines the MV3 manifest, reads the version from
  `package.json`, and switches the background entry and the Gecko settings on
  `EXT_TARGET`.
- `vite.config.ts` switches the output directory and the dev-server CORS origin
  on the same variable.
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
- `src/test/` holds the shared Chrome API mock, the Vitest setup file, and the
  LinkedIn fixture markup used by both the unit and Playwright layers.
- `tests/` holds source-tree guards: the callback-only `chrome.*` check, the
  two-target manifest check, and the AMO listing-asset logic. They run inside
  Vitest; the `.ts` ones are compiled by `tsconfig.node.json`.
- `e2e/specs/` is the deterministic Playwright suite CI runs; `e2e/real/` and
  `e2e/manual/` are the opt-in credentialed lanes it cannot.
- `scripts/` holds the plain-ESM release, validation and development tooling:
  the source archiver, the AMO publisher with its listing-asset planner and
  write-throttle budget, the Gecko runtime validator, the icon renderer, the
  Chromium and Gecko launchers, the runtime inspector, and the shared browser
  resolution and `--help` handling the rest of them import.
- `public/icons/` contains extension icons copied into builds. They are
  generated from `store/logo.svg`, not hand-exported.
- `store/` contains listing assets shared across stores: the long description,
  the screenshot set, and the logo in SVG and 1024px PNG form.
- `chrome-web-store/` contains Chrome-specific listing assets: privacy
  justifications and the promo tile with its SVG source.
- `amo/` contains addons.mozilla.org listing metadata: the listing JSON, the
  preview captions, the data-collection answer, and the source-submission
  instructions.
- `docs/` contains contributor-facing project and implementation notes.
- `.github/workflows/ci.yml` validates pull requests and pushes to `master`.
- `.github/workflows/publish-cws.yml` and `.github/workflows/publish-amo.yml`
  publish to the two stores from published GitHub Releases, independently.
- `dist/`, `dist-firefox/` and `release/` are generated or packaged outputs and
  are ignored by git.

## Commands

Use `pnpm`, following the `packageManager` field in `package.json`.

- `pnpm dev` starts the Vite dev server for extension development.
- `pnpm dev:chrome [url]` builds and opens `dist/` in a real Chromium on a
  throwaway profile; `pnpm dev:firefox [url]` and `pnpm dev:zen [url]` do the
  same for `dist-firefox/` as a temporary add-on. `FIREFOX_BINARY` overrides the
  Gecko binary.
- `pnpm inspect:chrome [url]` builds, loads `dist/`, and prints a JSON snapshot
  of the running extension: id, granted permissions, the resolved command
  binding, visible tabs, storage, popup controls, and the managed attributes on
  the page. `INSPECT_PROFILE_DIR=.e2e/linkedin-real-profile` runs it against the
  signed-in profile.
- `pnpm typecheck` runs `tsc -b`, which covers the extension, the Node-side
  config plus `tests/`, and the Playwright harness in one pass. There is no
  separate harness typecheck.
- `pnpm test` runs the Vitest suite once; `pnpm test:watch` and
  `pnpm test:coverage` are the watch and coverage forms.
- `pnpm e2e` builds the extension and runs the fixture Playwright suite;
  `pnpm e2e:headed` and `pnpm e2e:ui` are the headed and UI forms.
- `pnpm build` runs TypeScript checks and creates the Chrome build in `dist/`;
  `pnpm build:firefox` creates the Gecko build in `dist-firefox/`.
- `pnpm lint` runs oxlint over the source tree; `pnpm lint:fix` applies the
  fixes it can make on its own.
- `pnpm lint:firefox` builds the Gecko target and runs `web-ext lint` over it.
- `pnpm validate:firefox` drives the Gecko build in a real Firefox over
  WebDriver BiDi. Set `FIREFOX_BINARY` to run it against Zen.
- `pnpm package:chrome`, `pnpm package:firefox` and `pnpm package:source` write
  the release artifacts under `release/`.
- `pnpm publish:amo` submits to addons.mozilla.org; `--dry-run` is the safe
  form and uploads nothing.
- `pnpm icons` re-renders the icon set and the promo tile from their SVG
  sources; `--check` reports drift without writing. It needs `rsvg-convert`.
- `pnpm format` checks oxfmt formatting; `pnpm format:write` applies it.
- `pnpm preview` previews the Vite build.

For docs-only changes, run `pnpm format` over the touched markdown files. For source, manifest, popup, content-script, background, settings, icon,
or packaging changes, run at least `pnpm format`, `pnpm lint`,
`pnpm typecheck`, `pnpm test:coverage`, `pnpm build`, `pnpm e2e`, and
`pnpm lint:firefox`.

## CI And Publishing

- Normal CI runs two jobs: `validate` (`pnpm format`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test:coverage`, `pnpm build`, `pnpm lint:firefox`)
  and `e2e` (`pnpm e2e`). Both publish workflows repeat the same gates.
- Both store workflows run only on published GitHub Releases and require the
  release tag to match `package.json` with an optional leading `v`. They are
  independent: neither waits for the other.
- The Chrome workflow expects repository variables named `CWS_EXTENSION_ID`,
  `CWS_PUBLISHER_ID`, `GCP_PROJECT_ID`, `GCP_SERVICE_ACCOUNT`, and
  `GCP_WORKLOAD_IDENTITY_PROVIDER`.
- The AMO workflow expects the secrets `MOZILLA_ADDON_JWT_ISSUER` and
  `MOZILLA_ADDON_JWT_SECRET` in the `addons-mozilla-org` environment.
- The Google Cloud Workload Identity Federation provider is shared with
  `shbernal/tiktok-feed-blocker`. Its trust condition names both repositories
  and restricts them to tag refs. Narrowing it to this repository alone breaks
  TikTok's releases. `docs/ci-release-flow.md` carries the exact condition.
- A successful AMO release ends in review, not live. Never write tooling or
  docs that wait for or report `public` on submission.
- Every AMO version carries a source archive, and every release must stay
  reproducible from a clean extraction of it. Do not make the build depend on
  anything outside the archive. `amo/previews.lock.json` is read by the
  publisher, never by the build, which is what keeps it out of that constraint.
- `amo/previews.lock.json` records what the live AMO listing holds so a release
  uploads only what changed. Every way it can be unusable must degrade to a full
  replace, never to skipping: failing open costs one upload, failing closed
  leaves a changed screenshot unpublished and says nothing.
- Do not publish releases, push tags, upload packages, or change Chrome Web
  Store or AMO settings unless explicitly asked. `pnpm publish:amo --dry-run`
  uploads nothing and is the safe form.

## Coding Guidelines

- Keep changes narrow and follow the existing TypeScript style: strict types, no
  semicolons, single quotes, 2-space indentation, and 80-column oxfmt
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
- Blocking is inline `display: none` plus a managed attribute, applied by the
  content script. That stays the mechanism for every section, and it stays the
  only thing that marks an element as hidden by this extension.
- `src/content/blocking.css` is a separate concern: a `document_start` curtain
  that hides the `/feed/` route's targets until the content script has read
  settings, so the feed does not flash before the first pass. It is generated
  from `SECTION_TARGETS` by `src/content/blockingStyles.ts` and checked byte for
  byte by `tests/blocking-css.test.ts`; never hand-edit it. It covers `feed` and
  `rightFeed` only. The three `/mynetwork/grow/` sections match on text content
  or document position and have no CSS equivalent.
- The curtain is scoped to the feed route by the manifest's `matches`, not by an
  attribute the content script writes, which would reintroduce the race it
  exists to close.
- `data-ltfb-ready` on `<html>` is one-way. Absent means "not decided yet",
  never "nothing blocked", so teardown sets it rather than clearing it. The
  curtain also expires on its own after `CURTAIN_EXPIRY_MS`, because a content
  script that never runs would otherwise leave LinkedIn permanently blank. That
  is why the curtain uses `content-visibility` and `visibility` rather than
  `display: none`: an animation can restore those two and cannot restore
  `display`.
- Preserve high-value LinkedIn surfaces by default. In particular, the My
  Network invitation area should stay visible unless the user explicitly asks to
  block it.
- Never `await` a `chrome.*` call. Gecko exposes `chrome.*` as callback-only, so
  an awaited call resolves to `undefined` there with no error while every Chrome
  check stays green. `tests/browser-api-compat.test.ts` enforces this.
- Only the manifest may differ between build targets. The JavaScript, CSS, HTML
  and icons must be the same bytes in `dist/` and `dist-firefox/`, and only the
  background entry and `browser_specific_settings.gecko` may vary.
  `tests/manifest-targets.test.ts` enforces this.
- `browser_specific_settings.gecko.id` is permanent. Changing it creates a
  different add-on on AMO and strands every installed user.
- Keep the popup compact. It is designed around a 320px width, so avoid verbose
  explanatory text inside the extension UI.
- Never add `<input type="color">` or `<input type="file">` to the popup. In a
  Gecko action popup the native dialog steals focus and destroys the popup
  document mid-interaction. `tests/popup-native-dialogs.test.ts` enforces this.
- No two manifest entries may share a basename. crxjs names each output chunk
  after its entry file's basename, so a collision makes the generated
  `service-worker-loader.js` import whichever chunk resolves first. That
  shipped once, in `7e10cad`, with the background entry importing the content
  script and every check green. `tests/manifest-entry-names.test.ts` enforces
  this.
- oxlint runs its `correctness` category over the tree, plus
  `react-hooks/exhaustive-deps` and `react-hooks/rules-of-hooks` scoped to
  `src/popup/`. Those two are the reason the project lints at all: a dependency
  left out of an effect is invisible to `tsc` and to every test that renders
  once. Three rules are suppressed in `.oxlintrc.json` and one call site is
  suppressed inline in `scripts/publish-amo.mjs`, each with its reason next to
  it. Add to that list only with the same treatment.

## Testing Guidelines

- Prefer the smallest layer that proves the behavior: Vitest first, the fixture
  Playwright suite when the claim needs a real extension runtime, and the
  real-site lane only for selector drift. Gecko sits outside that ladder,
  because Playwright cannot load an MV3 extension in Firefox at all;
  `pnpm validate:firefox` is its runtime lane.
- `pnpm validate:firefox` reports a check it could not run as `SKIP`, never as a
  pass. Its page-level checks need a LinkedIn session in the persistent profile,
  and Zen cannot reach extension pages at all. Keep it that way.
- `src/test/fixtures/linkedin.ts` is the single source of LinkedIn-shaped markup
  for both deterministic layers. Copy attributes and nesting from a real page;
  never write the markup a selector expects. A fixture written to fit the
  selector produces a green suite that matches nothing in production.
- Content-script tests must pair `clearAllBlocking()` with
  `cleanupContentScript()` in teardown, or blocking state leaks into the next
  test.
- Coverage thresholds in `vitest.config.ts` are a ratchet. Raise them when
  coverage rises; do not lower them to make a change fit.
- The My Network invitation area staying visible is covered by tests in both
  deterministic layers. Keep it that way when touching the suggestion rule.

## Documentation Guidelines

- Prefer `docs/` for contributor-facing status, architecture, validation, and
  maintenance notes.
- Keep `README.md` concise and aligned with the current user-facing extension
  behavior.
- `README.md` and `docs/project-overview.md` state the shipped version as a
  literal. Both have to move with `package.json`;
  `tests/documented-version.test.ts` enforces this. Version literals anywhere
  else are examples, not claims.
- Update `docs/current-implementation.md` when runtime surfaces, settings shape,
  message contracts, selectors, or manifest behavior changes.
- Update `docs/experimental-status.md` when known limitations, validation gaps,
  or the hardening plan changes.
- Update `docs/ci-release-flow.md` when CI gates, release triggers, workflow
  variables or secrets, or either store's publishing behavior changes.
- Update `docs/build-targets.md` when the target switch, the manifest
  differences, or the Firefox lint and runtime validation change.
- Update `docs/firefox-amo.md` when the Gecko rules or AMO's obligations change,
  and `docs/amo-listing.md` when the listing copy, metadata, or assets change.
- Update `docs/testing.md` when test layers, commands, the Chrome API mock, the
  fixtures, or the coverage map change.
- Store form copy is plaintext. No backticks, emphasis, lists, links, or match
  patterns inside any answer body in `chrome-web-store/` or `amo/` — the fields
  they are pasted into render none of it.
- Keep docs tied to current code. Put speculative roadmap context in docs only
  when the user asks for planning documentation.

## Generated And Release Files

- Do not hand-edit `dist/`; update source/config and rebuild instead.
- Do not create or replace files in `release/` unless doing explicit release
  packaging.
- Do not bump `package.json` version unless explicitly requested.
- Do not hand-edit GitHub Release assets; rebuild from source and let the
  publish workflow attach the generated zip when doing automated releases.
- Do not hand-edit the icon PNGs, `store/logo-source.png`, or the promo tile.
  Edit the SVG source and run `pnpm icons`; `pnpm icons --check` reports drift.

## Artwork

- The mark must not reproduce LinkedIn's logo or wordmark. It does use their
  brand blue (`#0A66C2`) on a rounded-square tile, which is a deliberate owner
  decision taken for recognizability at favicon size, overriding the earlier
  rule against it. Understand the tradeoff before touching it: a rounded blue
  tile is close to LinkedIn's own app icon, and both stores restrict listings
  that use another company's branding in a way that suggests affiliation. This
  is a known and accepted rejection vector, not an oversight to be tidied away.
  If a reviewer rejects on branding, the graphite mark in `a755e41` is the
  fallback, not a new design. Naming the product stays nominative use.
- Rejected icon directions are recorded in `docs/icon-explorations.md` with what
  each one cost at 16px. Read it before proposing a new mark, and add a round to
  it rather than discarding the sketches.
- Judge every icon change at 16px, not at 1024. That is the size the extensions
  page favicon uses, and it is where a mark with too much in it turns to mud.
- The mark is a suited figure seated in a lotus pose, and it carries no
  prohibition ring. Do not add one back without reading
  `docs/icon-explorations.md`: every ring variant tried collapsed to the same red
  smudge at 16px, because red against the tile blue is a 1.45:1 luminance step
  where the figure's near-white (`#F1F5F9`) is 5.19:1. The ring was retired on
  that measurement, not on taste.
- Three pieces of the figure's geometry are load-bearing at 16px and are not
  styling. Keep at least 100 units of tile colour between the head and the
  shoulders, or the neck antialiases shut and the figure becomes one blob. Keep
  the tile-coloured gap between each arm and the torso, which is what reads as a
  pose rather than a silhouette. Keep the tie at 64 units wide, which is exactly
  one device pixel at 16px; narrower and it smears to pink.
- Detail that cannot survive 16px belongs in the tile colour, cut out of the
  figure — the closed eyes and the lapels work that way. They carry the suit at
  listing size and disappear cleanly rather than becoming gravel.
- Red (`#E5484D`) is now only the tie. It is the accent, not the subject, which
  is what makes its poor luminance separation from the tile affordable.
- The mark must work on light and dark backgrounds, which is what the saturated
  tile is for.
- Replacing a Chrome Web Store listing image is a manual dashboard paste and
  puts the item back through review. Only the AMO listing icon is pushed
  automatically, by `pnpm publish:amo`.

## Manual Validation Notes

`pnpm dev:chrome` builds and opens `dist/` in a real Chromium when behavior
needs runtime validation. Walk the same list on Gecko with `pnpm dev:firefox`
or `pnpm dev:zen` before a release: it is where the background script (not a
service worker) and the callback-only `chrome.*` surface can diverge, and where
the popup is a XUL panel rather than a tab. When a result is confusing, run
`pnpm inspect:chrome` before reading source: it prints what the running
extension actually sees. Check at least:

- popup toggles persist via `chrome.storage.local`;
- `/feed/` main feed and right-rail blocking behave as expected;
- `/mynetwork/grow/` `networkPuzzle`, `networkPremium` and `networkSuggestions`
  blocking behaves as expected while invitations remain visible;
- the command in `manifest.config.ts` toggles the currently supported LinkedIn
  page;
- disabled sections restore elements hidden by the extension.
