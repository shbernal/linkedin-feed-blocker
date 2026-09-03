# Testing

Three layers, in the order you should reach for them:

1. **Vitest** (`src/**/*.test.ts`, `tests/`): fast jsdom tests over the pure
   logic, the content script, the popup, the background script, and the source
   tree itself. This is the default place for a new test.
2. **Fixture Playwright** (`e2e/specs/`): the real unpacked MV3 build in a
   real Chromium, driven against local LinkedIn-shaped HTML. Deterministic,
   needs no account, and runs in CI.
3. **Real-site Playwright** (`e2e/real/`, `e2e/manual/`): opt-in, headed, and
   credentialed. The selector-drift canary. CI can never run it.

Firefox sits outside that ladder, because Playwright cannot load an MV3
extension in it at all. `pnpm validate:firefox` drives the built Gecko package
over WebDriver BiDi instead; see [Build Targets](./build-targets.md).

`pnpm lint` is not a fourth layer. oxlint reads the source without running it,
so it catches a shape no test can see: a dependency left out of a popup effect
typechecks, renders, and passes any test that renders once. It runs before the
three layers, in the same position in CI, and it proves nothing about
behaviour. Its configuration and the reason behind each suppression live in
`.oxlintrc.json`.

## Commands

- `pnpm test` runs the Vitest suite once.
- `pnpm test:watch` starts Vitest in watch mode.
- `pnpm test:coverage` runs Vitest with V8 coverage into `coverage/` and fails
  below the thresholds in `vitest.config.ts`. This is what CI runs.
- `pnpm e2e` builds the extension and runs the fixture Playwright suite.
- `pnpm e2e:headed` and `pnpm e2e:ui` are the same suite, headed and in the
  Playwright UI.
- `pnpm typecheck` runs `tsc -b`, which covers the extension, the Node-side
  config plus `tests/`, and the Playwright harness through project references.
  There is no separate harness typecheck step.
- `pnpm build` writes the unpacked extension to `dist/`.
- `pnpm lint` runs oxlint over the source tree. `pnpm lint:fix` applies the
  fixes it can make on its own. CI runs the first with `--format github`.
- `pnpm dev:chrome [url]` builds and opens `dist/` in a real Chromium on a
  throwaway profile.
- `pnpm dev:firefox [url]` and `pnpm dev:zen [url]` build and install
  `dist-firefox/` as a temporary add-on in Firefox or Zen.
- `pnpm inspect:chrome [url]` builds, loads `dist/`, and prints a JSON snapshot
  of what the running extension sees.
- `pnpm lint:firefox` builds `dist-firefox/` and runs `web-ext`'s static checks
  over it. CI runs this too.
- `pnpm validate:firefox` drives the built Gecko package in a real Firefox.
- `pnpm e2e:real:setup` opens the persistent LinkedIn profile without loading
  the extension so the account session can be repaired manually.
- `pnpm e2e:real:login` is an alias for `pnpm e2e:real:setup`.
- `pnpm e2e:real` builds the extension and runs the real LinkedIn smoke test
  with the extension loaded.
- `pnpm manual:linkedin` builds the extension and keeps a headed Chromium
  window open with it loaded.

## Vitest environment

Configured in `vitest.config.ts`.

- The environment is `jsdom`, so tests exercise DOM events, React rendering and
  the real cascade without launching a browser.
- The default URL is `https://www.linkedin.com/feed/`, which gives
  content-script tests a LinkedIn-like location. Tests that need another route
  call `window.history.replaceState`.
- `src/test/setup.ts` runs before each test file. It installs a fresh Chrome
  API mock and cleans up React trees, document markup, the path, timers and
  spies after each test.
- `e2e/**` and `.e2e/**` are excluded. The second one matters: `.e2e/` is the
  gitignored scratch area for real-site profiles and throwaway probe specs, and
  a stray Playwright spec there would otherwise fail the unit run.

## Chrome API mock

`src/test/chrome.ts` provides the shared mock. Call `getChromeMock()` in a test
to seed storage, inspect messages, or control tab lookup.

Supported surfaces:

- `chrome.storage.local.get` / `set` / `remove`
- `chrome.storage.onChanged`
- `chrome.runtime.onMessage`
- `chrome.commands.onCommand` / `getAll`
- `chrome.tabs.query`
- `chrome.tabs.sendMessage`

`chrome.storage.local.seed(...)` preloads storage without firing change events;
`set(...)` and `remove(...)` emit `storage.onChanged` the way the real API does,
which is what popup and content-script code depend on.

Every mocked surface takes a callback, including `chrome.tabs.query`. That is
deliberate. It is what stops a Gecko-incompatible call from passing. Override
a lookup with `mockImplementation`, not `mockResolvedValue`:

```ts
chromeMock.tabs.query.mockImplementation((_queryInfo, callback) => {
  callback([{ id: 9 } as chrome.tabs.Tab])
})
```

## Fixtures

`src/test/fixtures/linkedin.ts` holds the LinkedIn-shaped markup, and both the
jsdom tests and the Playwright routes render from it. One page shape, two
layers.

**A fixture is only worth what it resembles.** Every attribute the selectors key
on is copied from a real LinkedIn page rather than written to fit the selector.
That covers the `componentkey` values, `data-testid`, `data-component-type`,
`role` and `alt` text, and the nesting depth the `:has(> ...)` chains walk. Writing the markup a
selector expects produces a suite that passes while the extension matches
nothing in production. When a selector changes, re-copy the real element instead
of adjusting the fixture until it goes green.

Which URL a fixture is served from is part of that fidelity. `getFixtureBody`
routes on `pathname`, and `/jobs/` deliberately carries right-rail markup the
feed selectors would match, so a route-gating regression fails there instead of
on a real page.

## Proving the pre-paint curtain

`e2e/specs/pre-paint.spec.ts` carries the two claims jsdom cannot make about
`src/content/blocking.css`.

The first is that the feed is hidden _before_ any of the extension's JavaScript
has run, rather than a moment after. `renderFixturePage` ends the body with an
inline probe that records computed styles while the document is still parsing,
which is before the content script's `document_end` entry. The spec reads what
the probe captured. The probe is test machinery rather than page markup: nothing
in `src/` sees it, and it targets ids the fixture already carries.

The second is the blank-page failure mode. If the gate is never cleared the page
stays hidden, which is worse than the flash the stylesheet replaces, so the rule
expires on its own. The spec drives that state directly, because no test of a
working extension reaches it. It seeds nothing blocked on purpose: an element
the content script has already set to `display: none` is not rendered, and an
element that is not rendered runs no animations, so seeding the defaults would
test a state the real failure never reaches. If the content script never ran,
nothing set `display: none` either.

Both were watched failing against a neutered stylesheet before being kept. The
third spec in the file covers the gate itself and correctly keeps passing there,
which is what says the two CSS specs are testing the CSS.

## Fixture Playwright

`playwright.config.ts` runs `e2e/specs/` against the built `dist/` in a
persistent Chromium context. `e2e/fixtures/linkedinPages.ts` fulfils
`https://www.linkedin.com/**` from the shared markup, so the content script
still sees a real LinkedIn URL with no account and no network.

`e2e/fixtures/extension.ts` provides the per-test context, the extension id, a
LinkedIn page, the popup page, and storage seed/read helpers that go through the
service worker.

The per-test timeout is 60s only because each test launches and tears down its
own persistent Chromium and a cold first launch has been seen to spend most of a
30s budget on shutdown alone. Assertion failures still surface in seconds
through the 5s `expect` timeout.

Real-site smoke tests keep their own configs (`playwright.real.config.ts`,
`playwright.manual.config.ts`) and are never picked up by `pnpm e2e`.

## Source convention guards

`tests/` holds checks about the source tree rather than about runtime behavior.
They run in the same Vitest command and need Node APIs, so the directory is
compiled by `tsconfig.node.json`; `tsconfig.app.json` deliberately limits
`types` to `vite/client` and `chrome` so Node globals stay out of extension
source.

`tests/browser-api-compat.test.ts` fails if any file under `src/` awaits a
`chrome.*` call. Keep those call sites callback-based; see
[Never await a `chrome.*` call](./firefox-amo.md#never-await-a-chrome-call) for
what an awaited one does in Gecko.

`tests/manifest-targets.test.ts` loads `manifest.config.ts` once per build
target and asserts what each one emits: a module service worker and no Gecko
block for Chrome, `background.scripts` and the permanent add-on id for Firefox,
and, the one everything else rests on, that **no other manifest key differs
between them**.
One source tree, one set of assets, and a manifest that varies in exactly two
documented places is the rule the whole dual build rests on. It also checks that
the manifest's `suggested_key` and `DEFAULT_TOGGLE_SHORTCUT` in
`src/shared/shortcut.ts` name the same keys, since the in-page fallback would
otherwise answer a binding the browser never made.

`tests/manifest-entry-names.test.ts` fails if two manifest entries share a
basename. crxjs names each output chunk after its entry file's basename, so
when the background and content-script entries were both `main.ts` the
generated `service-worker-loader.js` imported whichever `main.ts-<hash>.js` it
resolved first, which was the content script. `chrome.commands.onCommand`
registered in no shipped build and every check stayed green. It walks the whole
manifest object rather than reading two keys by name, so a later `options_page`
or `web_accessible_resources` entry is covered without anyone remembering.

`tests/popup-native-dialogs.test.ts` fails if anything under `src/popup/`
declares an `<input type="color">` or `<input type="file">`. In a Gecko action
popup either one opens a native dialog that takes focus, and the panel closes
on focus loss, destroying the popup document mid-interaction. Chrome keeps the
popup alive, so nothing else in the suite can see it. The guard strips comments
before matching, because the rule is the kind that gets written down next to
the code it forbids, and skips test files, which construct these inputs on
purpose.

`tests/blocking-css.test.ts` fails if `src/content/blocking.css` is not byte
for byte what `src/content/blockingStyles.ts` generates. The stylesheet is
checked in because the manifest declares it and the browser injects it at
`document_start`, but it is built from the same `SECTION_TARGETS` table the
JavaScript path reads. This guard is the only thing making the checked-in copy
trustworthy: without it the CSS and the JS could disagree about what a section
targets and nothing would say so. Regenerate with
`UPDATE_BLOCKING_CSS=1 pnpm test`. The file is in `.oxfmtrc.json`'s ignore list,
because reformatting it fails its own guard.

`tests/documented-version.test.ts` fails if the version stated in `README.md`
or `docs/project-overview.md` is not the one in `package.json`. Nothing else
propagates a version bump into either file. Every other version literal in the
tree sits inside an example command or a tag-naming sentence, which is why the
guard names two files instead of walking the docs.

`tests/amo-throttle.test.mjs` covers the budget model in
`scripts/amo-throttle.mjs`: which calls are billed to which scope, that the wait
is measured from the send whose expiry frees the window, and that the longest
full window wins when more than one is. Its main case asserts the property
rather than the shape, which is that no send is ever made into a window AMO
would reject. Asserting a particular sequence of waits would only restate the
implementation.

`tests/amo-previews.test.mjs` covers the AMO listing-asset planning in
`scripts/amo-previews.mjs`: image types and sizes, manifest parsing, the
replace-don't-reconcile sync plan, and the drift line. It also checks that every
screenshot `amo/previews.json` names is actually on disk. It is `.mjs` because
the module under test is: the publish scripts are plain ESM run by node, not
part of a TypeScript project reference. Vitest picks it up from the same default
glob as the `.ts` suites.

## Coverage map

- `src/shared/settings.test.ts`: defaults, normalization, the `feedPuzzle` to
  `rightFeed` rename, the `extensionActive` migration, and active/section sync.
- `src/shared/shortcut.test.ts`: binding parsing including the macOS `Command`
  and glyph forms, the unbound fallback, and keydown matching.
- `src/shared/linkedin.test.ts`: host matching, including lookalike hosts.
- `src/content/routes.test.ts`: the path-to-sections table.
- `src/content/selectors.test.ts`: the My Network predicates, including the
  ordering rule that keeps the invitation area visible.
- `src/content/blocking.test.ts`: hide, restore, managed-attribute
  bookkeeping, idempotence, not adopting elements LinkedIn already hid, and
  route gating.
- `src/content/content-script.test.ts`: startup, storage changes, runtime
  messages, the in-page shortcut fallback and its duplicate-suppression window,
  the coalescing mutation observer, and teardown.
- `src/background/service-worker.test.ts`: shortcut mirroring and the command
  path from event to active-tab message.
- `src/popup/App.test.tsx`: loading, every switch, persistence, tab
  notification, and external storage changes.
- `tests/browser-api-compat.test.ts`: the callback-only `chrome.*` rule.
- `tests/manifest-targets.test.ts`: the two build targets and the rule that
  only the background entry and the Gecko block may differ between them.
- `tests/manifest-entry-names.test.ts`: the rule that no two manifest entries
  share a basename, under both build targets.
- `tests/popup-native-dialogs.test.ts`: the rule that the popup declares no
  input that opens a native dialog.
- `tests/documented-version.test.ts`: the two documents that state the shipped
  version against `package.json`.
- `tests/blocking-css.test.ts`: the generated `document_start` stylesheet
  against its generator.
- `src/content/blockingStyles.test.ts`: the curtain selector list, the two
  properties an animation can restore, the self-expiry, and the one-way gate.
- `tests/amo-previews.test.mjs`: the AMO listing-asset planning, the listing
  lock and its twelve fail-open cases, and the checked-in previews manifest.
- `tests/amo-throttle.test.mjs`: the AMO write-throttle budget model.

`tests/helpers/manifest.ts` is not a test. It holds the `EXT_TARGET`-switching
loader the two manifest guards share, so there is one loader rather than one
per file.

The module-level auto-start and the `import.meta.hot` dispose hook in
`src/content/content-script.ts` are the known uncovered lines; both are gated on
not running under `MODE=test`, which is what lets the tests drive
`initContentScript()` per case. The Playwright suite covers the auto-start path
for real.

The coverage thresholds in `vitest.config.ts` are a floor that only moves up.
They sit a couple of points under the measured numbers so an unrelated change
cannot quietly erode coverage while a real refactor still has room.

## Rules that keep these layers honest

- Prefer the smallest layer that proves the behaviour: Vitest first, the fixture
  Playwright suite when the claim needs a real extension runtime, and the
  real-site lane only for selector drift.
- `src/test/fixtures/linkedin.ts` is the single source of LinkedIn-shaped markup
  for both deterministic layers. Copy attributes and nesting from a real page;
  never write the markup a selector expects. A fixture written to fit the
  selector produces a green suite that matches nothing in production.
- Content-script tests must pair `clearAllBlocking()` with
  `cleanupContentScript()` in teardown, or blocking state leaks into the next
  test.
- Raise the coverage thresholds when coverage rises. Never lower them to make a
  change fit.
- `pnpm validate:firefox` reports a check it could not run as `SKIP`, never as a
  pass. Its page-level checks need a LinkedIn session in the persistent profile,
  and Zen cannot reach extension pages at all. Keep it that way.
- The My Network invitation area staying visible is covered in both
  deterministic layers. Keep it that way when touching the suggestion rule.

## Manual validation

The deterministic layers prove the selectors match the markup that was copied
and that the extension runtime behaves. They cannot tell you the popup looks
right or that a real feed is quiet. After a build, drive it by hand.

`pnpm dev:chrome` is the Chromium pass. Walk the same list on Gecko with
`pnpm dev:firefox` or `pnpm dev:zen` before a release: that is where the
background script is not a service worker, the `chrome.*` surface is
callback-only, and the popup is a XUL panel rather than a tab. When a result is
confusing, run `pnpm inspect:chrome` before reading source.

Check at least:

- popup toggles persist via `chrome.storage.local`;
- `/feed/` main feed and right-rail blocking behave as expected, and the feed
  does not flash before the first pass;
- `/mynetwork/grow/` `networkPuzzle`, `networkPremium` and `networkSuggestions`
  blocking behaves as expected while invitations remain visible;
- the command in `manifest.config.ts` toggles the currently supported LinkedIn
  page;
- disabled sections restore elements hidden by the extension.

## Adding tests

Prefer the smallest layer that proves the behavior.

- Shared pure logic goes in `src/shared/*.test.ts`.
- Background behavior should import the module and invoke the listener the
  Chrome mock captured. The module wires itself up on import, so reload it with
  `vi.resetModules()` per test.
- Popup behavior should use Testing Library queries by accessible name.
- Content-script behavior should render fixture markup, call
  `initContentScript()`, and assert through `getComputedStyle(...).display` and
  the managed `data-ltfb-*` attributes. Hiding and the bookkeeping that makes
  restore possible are two different claims.
- Content-script tests must run `clearAllBlocking()` alongside
  `cleanupContentScript()` in teardown. The shared `document.body.innerHTML = ''`
  in `src/test/setup.ts` does not undo the managed attributes, so without it
  blocking state leaks into the next test. That pair is the same one
  `import.meta.hot.dispose` runs, so teardown matches production.

## Driving the built extension by hand

Three commands get to the starting line of the manual checklist in `AGENTS.md`,
which otherwise means a build, a browser, an unpacked-extension dialog and a
URL. Each builds first, so a stale `dist/` cannot produce a confusing result.

`pnpm dev:chrome [url]` opens `dist/` in a real Chromium and leaves the window
open. `pnpm dev:firefox [url]` and `pnpm dev:zen [url]` install `dist-firefox/`
as a temporary add-on in Firefox or Zen. Gecko is where the background script
is not a service worker, the `chrome.*` surface is callback-only and the popup
is a XUL panel, so walking the checklist there before a release is the point of
the second and third.

All three use a throwaway profile under `node_modules/.tmp/`, recreated on every
launch, so extension storage from the last session cannot make this one lie
about defaults. They are deliberately not under `.e2e/`, which holds the
real-site profile someone signed in by hand.

`FIREFOX_BINARY` picks the Gecko binary for all three Gecko lanes, including
`pnpm validate:firefox`, so a fork that is not Zen needs no new command.

### Inspecting the running extension

`pnpm inspect:chrome [url]` prints a JSON snapshot of the live extension: its
id, the permissions the browser granted, the resolved `chrome.commands`
binding, the tabs the worker can see, storage contents, the popup's rendered
controls, and the `data-ltfb-*` attributes on the page.

The principle is getting the browser's answer before reasoning from the source.
LinkedIn's markup is brittle by constraint and the content script is
route-gated, so "the selector missed" and "the route table does not list this
section on this path" look identical from the outside. The snapshot separates
them: it reports the pathname it actually landed on next to the attributes it
actually found.

A field it could not read is reported as an error string rather than a default,
because a snapshot that invents plausible state is worse than no snapshot.

`INSPECT_PROFILE_DIR=.e2e/linkedin-real-profile` runs it against the signed-in
profile, which is the only way to see blocking on a real feed. Without it
LinkedIn redirects to the auth wall, the content script correctly matches
nothing, and the snapshot says so.

## Persistent profile

The real-site lane keeps its Chromium profile inside the repository, at
`.e2e/linkedin-real-profile`. The whole `.e2e/` directory is ignored by git.
Nothing is seeded from outside: `pnpm e2e:real:setup` launches a persistent
context on that path, which creates it on first run, and you sign in to
LinkedIn there.

The profile is test state and it holds a live LinkedIn session. Do not commit
it, do not paste LinkedIn cookies or tokens into chat or repo files, and delete
it and run setup again if the state becomes inconsistent.

Set `LINKEDIN_REAL_PROFILE_DIR=/absolute/or/relative/path` to point the lane at
a profile somewhere else, which is the escape hatch for reusing an existing
signed-in profile rather than the normal path.

### Setup flow

1. Run `pnpm e2e:real:setup` or `pnpm e2e:real:login`.
2. Sign in to LinkedIn in the Chromium window it opens.
3. Complete any checkpoint, 2FA, cookie, or verification prompts.
4. Visit `https://www.linkedin.com/feed/` once and confirm the feed loads.
5. Close the Chromium tab or window.

### Real smoke test

Run `pnpm e2e:real` after setup. The test opens the persistent profile with the
built extension loaded, visits `https://www.linkedin.com/feed/`,
captures an unblocked checkpoint screenshot, enables only Home feed blocking
through extension storage, captures a blocked screenshot, then restores the feed
and captures a final screenshot.

Playwright stores failure screenshots, retained failure video, traces, and
explicit checkpoint screenshots under `test-results/`. The HTML report is
written to `playwright-report/`. Both directories are ignored by git.

This lane exists for selector drift. It is not a substitute for the fixture
suite, and the fixture suite is not a substitute for it: only the real site can
tell you LinkedIn changed its markup.

### Manual LinkedIn session

Run `pnpm manual:linkedin` when you want to move around LinkedIn manually with
the current `dist/` extension loaded in the same persistent profile used by the
real smoke tests.

Set `LINKEDIN_MANUAL_URL=https://www.linkedin.com/feed/` to start on another
LinkedIn route. The default start URL is
`https://www.linkedin.com/mynetwork/grow/`.
