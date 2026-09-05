# Repository instructions

## Project state

This is an experimental Manifest V3 browser extension for reducing distracting
LinkedIn surfaces. It builds for Chromium and for Gecko from one source tree and
ships to the Chrome Web Store and addons.mozilla.org. Treat it as a published
prototype with release automation rather than a polished extension.

The broader dev-project note is useful background, but the current source and
repo-local docs are the durable source of truth for implementation details. This
project is adjacent to `tiktok-feed-blocker` and uses the same broad
GitHub Release to store workflow shape, adapted to this repo's smaller
validation surface.

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

## Where things are written down

This file carries the decisions that are cheap to get wrong and expensive to
discover. Everything else lives in `docs/`, which is one read away and is the
copy that gets updated. When the two disagree, `docs/` and the source win.

| Question                                                       | Where                            |
| -------------------------------------------------------------- | -------------------------------- |
| what lives in which directory, and the project's scope         | `docs/project-overview.md`       |
| runtime surfaces, the settings contract, the pre-paint curtain | `docs/current-implementation.md` |
| which doc to update when something changes                     | `docs/index.md`                  |
| CI gates, both publish workflows, and the cloud configuration  | `docs/ci-release-flow.md`        |
| the two build targets and the Gecko runtime check              | `docs/build-targets.md`          |
| the Gecko rules and what AMO obliges this repository to do     | `docs/firefox-amo.md`            |
| the AMO listing, its throttles, and the listing lock           | `docs/amo-listing.md`            |
| the test layers, the fixtures, and the manual checklist        | `docs/testing.md`                |
| known limitations and the hardening direction                  | `docs/experimental-status.md`    |
| icon directions already tried and rejected                     | `docs/icon-explorations.md`      |
| how to contribute, and what CI does not run                    | `CONTRIBUTING.md`                |

## Rules with consequences

Each of these has cost something, here or in a sibling repository. Where a test
enforces one, it is named: a rule with an enforcer is a different kind of
statement from a rule that is a request.

- **Never `await` a `chrome.*` call.** Gecko exposes `chrome.*` as
  callback-only, so an awaited call resolves to `undefined` there with no error
  while every Chrome check stays green. `tests/browser-api-compat.test.ts`
  enforces this.
- **Only the manifest may differ between build targets.** The JavaScript, CSS,
  HTML and icons must be the same bytes in `dist/` and `dist-firefox/`, and only
  the background entry and `browser_specific_settings.gecko` may vary.
  `tests/manifest-targets.test.ts` enforces this.
- **No two manifest entries may share a basename.** crxjs names each output
  chunk after its entry file's basename, so a collision makes the generated
  `service-worker-loader.js` import whichever chunk resolves first. That shipped
  once, in `7e10cad`, with the background entry importing the content script and
  every check green. `tests/manifest-entry-names.test.ts` enforces this.
- **Never add `<input type="color">` or `<input type="file">` to the popup.** In
  a Gecko action popup the native dialog steals focus and destroys the popup
  document mid-interaction. `tests/popup-native-dialogs.test.ts` enforces this.
- **`README.md` and `docs/project-overview.md` state the shipped version as a
  literal.** Both move with `package.json`.
  `tests/documented-version.test.ts` enforces this. Version literals anywhere
  else are examples, not claims.
- **The My Network invitation area stays visible** unless the user explicitly
  asks to block it. Covered in both deterministic test layers; keep it that way
  when touching the suggestion rule.
- **Store form copy is plaintext.** No backticks, emphasis, lists, links, or
  match patterns inside any answer body in `chrome-web-store/` or `amo/`. The
  fields they are pasted into render none of it.
- **`src/test/fixtures/linkedin.ts` markup is copied from real LinkedIn pages,**
  never written to fit a selector. A fixture written to fit the selector
  produces a green suite that matches nothing in production.
- **Do not publish releases, push tags, upload packages, or change Chrome Web
  Store or AMO settings unless explicitly asked.** `pnpm publish:amo --dry-run`
  uploads nothing and is the safe form.

## Writing code here

- Keep changes narrow and follow the existing TypeScript style: strict types, no
  semicolons, single quotes, 2-space indentation, and 80-column oxfmt wrapping.
- Treat `ExtensionSettings` and `PageSection` as the contract between popup,
  content script, background messages, and storage. Update all related surfaces
  together when adding, renaming, or removing a blocked section.
- LinkedIn selectors are brittle. Prefer stable attributes, route-specific
  checks, accessible labels, and small fixture-backed selectors over generated
  class names or broad structural matches.
- Keep content-script DOM changes idempotent. If the script hides an element, it
  marks that element with a managed data attribute and can restore only the
  elements it changed. That attribute stays the only thing that means "this
  extension hid this".
- The content script reapplies blocking from a mutation observer that coalesces
  into a single scheduled pass. Do not reintroduce a polling interval; if a
  surface is missed, fix the trigger or the selector.
- `src/content/blocking.css` is generated. Never hand-edit it; change
  `src/content/blockingStyles.ts` and regenerate with
  `UPDATE_BLOCKING_CSS=1 pnpm test`. What it is and why it works the way it does
  is in `docs/current-implementation.md`.
- Keep the popup compact. It is designed around a 320px width, so avoid verbose
  explanatory text inside the extension UI.
- Content-script tests must pair `clearAllBlocking()` with
  `cleanupContentScript()` in teardown, or blocking state leaks into the next
  test.
- The coverage thresholds in `vitest.config.ts` only move up. Raise them when
  coverage rises; never lower them to make a change fit.
- oxlint runs its `correctness` category over the tree, plus
  `react-hooks/exhaustive-deps` and `react-hooks/rules-of-hooks` scoped to
  `src/popup/`. Three rules are suppressed in `.oxlintrc.json` and one call site
  inline in `scripts/publish-amo.mjs`, each with its reason next to it. Add to
  that list only with the same treatment.

## Frozen surfaces

Each of these is frozen for a reason, and the reason is not tidiness.

- **`browser_specific_settings.gecko.id`.** Changing it does not rename the
  add-on: it creates a different one and strands every installed user.
- **`dist/` and `dist-firefox/`.** Generated. Change source or config and
  rebuild.
- **`release/`.** Do not create or replace anything there outside explicit
  release packaging.
- **`package.json`'s version.** Do not bump it unless asked.
- **GitHub Release assets.** Rebuild from source and let the publish workflow
  attach the generated zip.
- **The icon PNGs, `store/logo-source.png`, and the promo tile.** Edit the SVG
  source and run `pnpm icons`; `pnpm icons --check` reports drift.
- **`amo/previews.lock.json`.** Written by the publisher, describing the live
  AMO listing. A release regenerates it and attaches it to the GitHub Release
  for a maintainer to commit back, so take it from there rather than editing it:
  a lock claiming more than was pushed makes a release skip the uploads it
  exists to make. Every way it can be unusable degrades to a full replace, never
  to skipping: failing open costs one upload, failing closed leaves a changed
  screenshot unpublished and says nothing.

## Artwork

- The mark must not reproduce LinkedIn's logo or wordmark. It does use their
  brand blue (`#0A66C2`) on a rounded-square tile, which is a deliberate owner
  decision taken for recognizability at favicon size, overriding the earlier
  rule against it. Understand the tradeoff before touching it: a rounded blue
  tile is close to LinkedIn's own app icon, and both stores restrict listings
  that use another company's branding in a way that suggests affiliation. This
  is a known and accepted risk. Do not tidy it away.
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
  figure. The closed eyes and the lapels work that way. They carry the suit at
  listing size and disappear cleanly rather than becoming gravel.
- Red (`#E5484D`) is now only the tie. Its poor luminance separation from the
  tile is affordable because it covers 64 units and nothing else.
- The mark must work on light and dark backgrounds. That is what the saturated
  tile is for.
- Replacing a Chrome Web Store listing image is a manual dashboard paste and
  puts the item back through review. Only the AMO listing icon is pushed
  automatically, by `pnpm publish:amo`.

## The iron laws

- **No journaling.** Comments and documentation describe the current state. They
  do not carry a log of how they got there, and neither does a plan file's
  vocabulary.
- **Commit messages describe the change, not where it came from.** No branch
  names, no plan or phase numbers, no reference to a working directory that gets
  deleted. Branches are gone after merge; say what the change does.
- **Do not lose the reader in internals.** Report at the level of what changed
  and what it costs, rather than a transcript of the steps.
- **Relocating is not deleting.** Content moved out of a file has to land
  somewhere in the same change, or it was deleted and should be described that
  way.
- **Verify rather than assume.** A guard nobody has watched fail is a guess, and
  so is a doc claim nobody checked against source.
