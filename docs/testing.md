# Testing

Three layers, in the order you should reach for them:

1. **Vitest** (`src/**/*.test.ts`, `tests/`) — fast jsdom tests over the pure
   logic, the content script, the popup, the background script, and the source
   tree itself. This is the default place for a new test.
2. **Fixture Playwright** (`e2e/specs/`) — the real unpacked MV3 build in a
   real Chromium, driven against local LinkedIn-shaped HTML. Deterministic,
   needs no account, and runs in CI.
3. **Real-site Playwright** (`e2e/real/`, `e2e/manual/`) — opt-in, headed, and
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

## Vitest Environment

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

## Chrome API Mock

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
deliberate — it is what stops a Gecko-incompatible call from passing. Override
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
on — `componentkey` values, `data-testid`, `data-component-type`, `role`, `alt`
text, and the nesting depth the `:has(> ...)` chains walk — is copied from a
real LinkedIn page rather than written to fit the selector. Writing the markup a
selector expects produces a suite that passes while the extension matches
nothing in production. When a selector changes, re-copy the real element instead
of adjusting the fixture until it goes green.

Which URL a fixture is served from is part of that fidelity. `getFixtureBody`
routes on `pathname`, and `/jobs/` deliberately carries right-rail markup the
feed selectors would match, so a route-gating regression fails there instead of
on a real page.

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

## Source Convention Guards

`tests/` holds checks about the source tree rather than about runtime behavior.
They run in the same Vitest command and need Node APIs, so the directory is
compiled by `tsconfig.node.json`; `tsconfig.app.json` deliberately limits
`types` to `vite/client` and `chrome` so Node globals stay out of extension
source.

`tests/browser-api-compat.test.ts` fails if any file under `src/` awaits a
`chrome.*` call. Gecko exposes `chrome.*` as callback-only and puts the
promise-returning variants on `browser.*`, so an awaited call yields `undefined`
there and the extension breaks silently while every Chrome test stays green.
Keep those call sites callback-based.

`tests/manifest-targets.test.ts` loads `manifest.config.ts` once per build
target and asserts what each one emits: a module service worker and no Gecko
block for Chrome, `background.scripts` and the permanent add-on id for Firefox,
and — the load-bearing one — that **no other manifest key differs between them**.
One source tree, one set of assets, and a manifest that varies in exactly two
documented places is the rule the whole dual build rests on. It also checks that
the manifest's `suggested_key` and `DEFAULT_TOGGLE_SHORTCUT` in
`src/shared/shortcut.ts` name the same keys, since the in-page fallback would
otherwise answer a binding the browser never made.

`tests/amo-previews.test.mjs` covers the AMO listing-asset planning in
`scripts/amo-previews.mjs` — image types and sizes, manifest parsing, the
replace-don't-reconcile sync plan, and the drift line — plus a check that every
screenshot `amo/previews.json` names is actually on disk. It is `.mjs` because
the module under test is: the publish scripts are plain ESM run by node, not
part of a TypeScript project reference. Vitest picks it up from the same default
glob as the `.ts` suites.

## Coverage Map

- `src/shared/settings.test.ts` — defaults, normalization, the `feedPuzzle` to
  `rightFeed` rename, the `extensionActive` migration, and active/section sync.
- `src/shared/shortcut.test.ts` — binding parsing including the macOS `Command`
  and glyph forms, the unbound fallback, and keydown matching.
- `src/shared/linkedin.test.ts` — host matching, including lookalike hosts.
- `src/content/routes.test.ts` — the path-to-sections table.
- `src/content/selectors.test.ts` — the My Network predicates, including the
  ordering rule that keeps the invitation area visible.
- `src/content/blocking.test.ts` — hide, restore, managed-attribute
  bookkeeping, idempotence, not adopting elements LinkedIn already hid, and
  route gating.
- `src/content/content-script.test.ts` — startup, storage changes, runtime
  messages, the in-page shortcut fallback and its duplicate-suppression window,
  the coalescing mutation observer, and teardown.
- `src/background/service-worker.test.ts` — shortcut mirroring and the command
  path from event to active-tab message.
- `src/popup/App.test.tsx` — loading, every switch, persistence, tab
  notification, and external storage changes.
- `tests/browser-api-compat.test.ts` — the callback-only `chrome.*` rule.
- `tests/manifest-targets.test.ts` — the two build targets and the rule that
  only the background entry and the Gecko block may differ between them.
- `tests/amo-previews.test.mjs` — the AMO listing-asset planning and the
  checked-in previews manifest.

The module-level auto-start and the `import.meta.hot` dispose hook in
`src/content/content-script.ts` are the known uncovered lines; both are gated on
not running under `MODE=test`, which is what lets the tests drive
`initContentScript()` per case. The Playwright suite covers the auto-start path
for real.

Coverage thresholds in `vitest.config.ts` are a **ratchet, not a target**: they
sit a couple of points under the measured numbers so an unrelated change cannot
quietly erode coverage. Raise them when coverage rises.

## Adding Tests

Prefer the smallest layer that proves the behavior.

- Shared pure logic goes in `src/shared/*.test.ts`.
- Background behavior should import the module and invoke the listener the
  Chrome mock captured. The module wires itself up on import, so reload it with
  `vi.resetModules()` per test.
- Popup behavior should use Testing Library queries by accessible name.
- Content-script behavior should render fixture markup, call
  `initContentScript()`, and assert through `getComputedStyle(...).display` and
  the managed `data-ltfb-*` attributes — hiding and the bookkeeping that makes
  restore possible are two different claims.
- Content-script tests must run `clearAllBlocking()` alongside
  `cleanupContentScript()` in teardown. The shared `document.body.innerHTML = ''`
  in `src/test/setup.ts` does not undo the managed attributes, so without it
  blocking state leaks into the next test. That pair is the same one
  `import.meta.hot.dispose` runs, so teardown matches production.

## Persistent Profile

The real-site lane uses `.e2e/linkedin-real-profile`, which is ignored by git.
For this workstation it is seeded from the `santiago` Chromium profile in
`/home/shb/Work/linkedin-careers/data/browser-profiles/santiago`.

The copied profile is test state. Do not commit it, do not paste LinkedIn
cookies or tokens into chat or repo files, and delete or recopy it if the state
becomes inconsistent.

Set `LINKEDIN_REAL_PROFILE_DIR=/absolute/or/relative/path` to use another
profile directory.

### Setup Flow

1. Seed `.e2e/linkedin-real-profile` from the `santiago` profile.
2. Run `pnpm e2e:real:setup` or `pnpm e2e:real:login`.
3. Confirm LinkedIn is signed in in the Chromium window.
4. Complete any checkpoint, 2FA, cookie, or verification prompts.
5. Visit `https://www.linkedin.com/feed/` once and confirm the feed loads.
6. Close the Chromium tab or window.

### Real Smoke Test

Run `pnpm e2e:real` after setup. The test opens the copied persistent profile
with the built extension loaded, visits `https://www.linkedin.com/feed/`,
captures an unblocked checkpoint screenshot, enables only Home feed blocking
through extension storage, captures a blocked screenshot, then restores the feed
and captures a final screenshot.

Playwright stores failure screenshots, retained failure video, traces, and
explicit checkpoint screenshots under `test-results/`. The HTML report is
written to `playwright-report/`. Both directories are ignored by git.

This lane exists for selector drift. It is not a substitute for the fixture
suite, and the fixture suite is not a substitute for it: only the real site can
tell you LinkedIn changed its markup.

### Manual LinkedIn Session

Run `pnpm manual:linkedin` when you want to move around LinkedIn manually with
the current `dist/` extension loaded in the same persistent profile used by the
real smoke tests.

Set `LINKEDIN_MANUAL_URL=https://www.linkedin.com/feed/` to start on another
LinkedIn route. The default start URL is
`https://www.linkedin.com/mynetwork/grow/`.
