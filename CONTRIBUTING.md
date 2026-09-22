# Contributing

This is an experimental extension with real users on two stores. Changes are
welcome; the constraints below exist because breaking one of them is not
noticeable until a release is already out.

Start with [AGENTS.md](./AGENTS.md) for the rules that have consequences, and
[docs/index.md](./docs/index.md) for everything else.

## AI disclosure

Pull requests written with an AI harness are fine, including ones written
entirely by one. Most of this repository was. The only requirement is that you
say so, and name the harness and the model.

There is no review penalty for disclosing. The reason to ask is that reviewing
generated code well means knowing which parts a human actually read, and that is
not guessable from the diff.

## Setup

Use `pnpm`, following the `packageManager` field in `package.json`.

```sh
pnpm install
pnpm dev:chrome     # builds and opens dist/ in a real Chromium
```

`pnpm dev:firefox` and `pnpm dev:zen` do the same for the Gecko build. All three
use a throwaway profile, so they cannot disturb a signed-in session.

The extension builds for Chrome and Chromium, and for Firefox and Zen, from one
source tree. Only the manifest differs between the two packages.

```sh
pnpm build           # Chrome, into dist/
pnpm build:firefox   # Firefox, into dist-firefox/
```

To load a build into your everyday browser instead:

- **Chrome or Chromium.** Open `chrome://extensions`, enable Developer mode,
  choose "Load unpacked", and select `dist/`.
- **Firefox or Zen.** Open `about:debugging#/runtime/this-firefox`, choose
  "Load Temporary Add-on", and select `dist-firefox/manifest.json`.

LinkedIn selectors are brittle. After a change to what gets blocked, load the
build and look at the real pages, or run the real-site lane below.

## Test layers

`pnpm test` runs the Vitest suite in jsdom. `pnpm e2e` runs the unpacked build
in a real Chromium against local LinkedIn-shaped fixtures. `pnpm lint:firefox`
builds the Gecko package and runs `web-ext`'s static checks over it.

Playwright cannot load an MV3 extension in Firefox, so `pnpm validate:firefox`
drives the built Gecko package over WebDriver BiDi instead. The real-LinkedIn
Playwright lanes depend on a signed-in browser profile and on whatever LinkedIn
serves that day. [docs/testing.md](./docs/testing.md) covers all of it.

## What to run

| If you touched                                 | Run                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| documentation only                             | `pnpm format`                                                   |
| `src/`, `manifest.config.ts`, `vite.config.ts` | the full gate below                                             |
| `scripts/`                                     | the full gate, plus the script's own `--help`                   |
| `tests/`, `e2e/`, `src/**/*.test.*`            | `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm e2e` |
| the manifest, or anything Gecko-shaped         | the full gate, plus `pnpm validate:firefox`                     |
| `src/content/selectors.ts` or the fixtures     | the full gate, plus `pnpm e2e:real` if you have a session       |
| `store/logo.svg` or the promo tile source      | `pnpm icons --check`, and judge the result at 16px              |
| `scripts/publish-amo.mjs` or `amo/`            | the full gate, plus `pnpm publish:amo --dry-run`                |

The full gate is what both CI jobs run:

```sh
pnpm format && pnpm lint && pnpm typecheck && pnpm test:coverage &&
  pnpm build && pnpm e2e && pnpm lint:firefox
```

## What CI does not run

CI covers the deterministic layers and nothing else. These are yours to run, and
assuming CI has them covered is how a regression ships:

- `pnpm validate:firefox`, the Gecko runtime lane. Playwright cannot load an
  MV3 extension in Firefox at all, so nothing automated covers that target's
  runtime. It reports a check it could not run as `SKIP`, never as a pass, and
  on a signed-out profile most of it skips: read the output rather than the
  exit code.
- `pnpm e2e:real` and `pnpm manual:linkedin`, the real-site lanes. They need a
  LinkedIn session and are the only thing that can notice LinkedIn changed its
  markup.
- `pnpm icons --check`, for icon drift. It needs `rsvg-convert`.
- The manual checklist in [docs/testing.md](./docs/testing.md).

## What not to put in a pull request

- **A version bump.** Releases are cut deliberately.
- **`dist/`, `dist-firefox/` or `release/`.** All generated and all gitignored.
- **Edited icon PNGs, `store/logo-source.png`, or the promo tile.** Edit the SVG
  source and run `pnpm icons`.
- **An edited `src/content/blocking.css`.** It is generated; change
  `src/content/blockingStyles.ts` and run `UPDATE_BLOCKING_CSS=1 pnpm test`.
- **A changed `browser_specific_settings.gecko.id`.** Changing it does not
  rename the add-on, it creates a different one and strands every installed
  user.
- **Live store copy edited to match a change.** Listing text under `store/`,
  `chrome-web-store/` and `amo/` is published separately and is plaintext: no
  backticks, emphasis, lists or links inside any answer body.
- **Fixture markup written to fit a selector.** See below.

## The fixture rule

`src/test/fixtures/linkedin.ts` is the single source of LinkedIn-shaped markup
for both deterministic test layers. Every attribute the selectors key on is
copied from a real LinkedIn page.

When a selector stops matching, the fix is to re-copy the real element, not to
adjust the fixture until the selector passes. A fixture written to fit the
selector produces a green suite that matches nothing in production, and it stays
green while the extension quietly does nothing on the real site.

This is the rule most likely to be broken by someone trying to make a test pass,
and it is the one whose breakage is hardest to notice.

## Releases and store packages

Releases are cut by a maintainer. Publishing a GitHub Release submits to both
the Chrome Web Store and addons.mozilla.org;
[docs/ci-release-flow.md](./docs/ci-release-flow.md) has the workflows and the
GitHub, GCP and Mozilla configuration they need. To build the packages locally:

```sh
pnpm package:chrome     # release/linkedin-feed-blocker-<version>.zip
pnpm package:firefox    # release/linkedin-feed-blocker-firefox-<version>.zip
pnpm package:source     # release/linkedin-feed-blocker-source-<version>.zip
```

AMO needs the source archive with every upload because Vite bundles the
package. Shared listing copy and screenshots live under `store/`,
Chrome-specific listing assets under `chrome-web-store/`, and AMO metadata
under `amo/`.

## README media

The demo GIF, the before/after, and the popup under `.github/readme/` are
recorded from real LinkedIn pages with personal content blurred.
[docs/media-capture.md](./docs/media-capture.md) explains how to regenerate
them.

## Commit messages

Say what the change does and why, on its own terms. No branch names, no phase or
step numbers, no reference to a working directory. Branches are deleted after
merge and the message is what survives.
