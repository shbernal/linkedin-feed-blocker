# Build targets

The same source tree builds two extension packages. The target is selected by
the `EXT_TARGET` environment variable, which `vite.config.ts` and
`manifest.config.ts` both read.

| Target  | Command              | `EXT_TARGET` | Output          |
| ------- | -------------------- | ------------ | --------------- |
| Chrome  | `pnpm build`         | unset        | `dist/`         |
| Firefox | `pnpm build:firefox` | `firefox`    | `dist-firefox/` |

Any value other than `firefox`, including none, builds the Chrome package. The
Chrome output is the default so the existing store workflow never has to opt in.

`pnpm package:firefox` builds the Firefox target and zips it to
`release/linkedin-feed-blocker-firefox-<version>.zip` with `web-ext build`. The
version comes from the built manifest, so it always matches `package.json`.

`pnpm package:chrome` is the local convenience equivalent for the Chrome
package. It has no counterpart in the adjacent TikTok repository, which this
layout otherwise copies; the Chrome Web Store workflow zips `dist/` inline and
does not use it either way, so it is kept only because it is useful by hand.

`pnpm package:source` writes `release/linkedin-feed-blocker-source-<version>.zip`
from `git archive`, which AMO requires alongside every Firefox upload because
the package is bundled by Vite. It archives `HEAD` by default and takes a ref
argument for releases: `pnpm package:source v0.2.0`. See
[AMO Listing](./amo-listing.md).

## Target differences

Only the manifest differs. The JavaScript, CSS, HTML, and icons are the same
bytes in both packages, and `tests/manifest-targets.test.ts` fails if any
manifest key other than the two below diverges.

- **Background entry.** Chrome gets `background.service_worker`; Gecko has no
  extension service workers and gets `background.scripts` instead. crxjs reads
  this entry straight off `manifest.config.ts` and does not rewrite it per
  target, so the conditional has to live in the manifest config. crxjs does add
  `"type": "module"` to the Firefox entry itself.
- **`browser_specific_settings.gecko`.** Firefox only. It carries the add-on id
  `linkedin-feed-blocker@shbernal.github.io`, which AMO binds the listing to and
  which must never change, plus `strict_min_version` and
  `data_collection_permissions`.
- **Dev server CORS.** `pnpm dev` allows `chrome-extension://` origins by
  default and `moz-extension://` origins when `EXT_TARGET=firefox`.

The manifest's `content_scripts` carries two entries, and both are identical
across targets. The second is CSS only: it injects `src/content/blocking.css` at
`document_start` on the `/feed/` route, which is what stops the feed flashing
before the content script's first pass. `web-ext lint` has no objection to it,
and the built stylesheet is the same bytes in `dist/` and `dist-firefox/`. The
curtain's behaviour was checked in a real Firefox as well as a real Chromium
before it landed, because Playwright cannot load an MV3 extension in Gecko and
`pnpm validate:firefox` cannot reach an extension page to observe it. See
[Current Implementation](./current-implementation.md).

`strict_min_version` is `140.0`. The floor is set by
`data_collection_permissions`, which Firefox only understands from 140 onward;
below that the key is silently ignored and the declaration never reaches the
user. Nothing else in the manifest needs a version that high.

## Validating the Firefox package

`pnpm lint:firefox` is the fastest check that the package is valid for Gecko. It
catches unsupported manifest keys, bad add-on ids, and reserved keyboard
shortcuts. It runs in the `validate` CI job.

Zero errors is the bar. Three warnings across two classes are expected and are
not defects:

- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` for
  `data_collection_permissions`, which Firefox for Android only supports from
  version 142. The listing targets desktop, so the desktop floor stays at 140
  rather than excluding Firefox ESR users for an Android-only warning.
- Two `UNSAFE_VAR_ASSIGNMENT` for `innerHTML` in the popup chunk, which is
  React's own bundle. The extension writes no markup of its own.

The toggle command binds `Ctrl+Shift+7` and `Command+Shift+7`. Firefox's
reserved-shortcut set is not Chrome's, so this was checked against `web-ext
lint` before anything else in the Gecko work: it is accepted. Changing the
binding later would mean changing the README, the in-page fallback default in
`src/shared/shortcut.ts`, both store listings, and these docs, so treat it as
settled.

## Firefox runtime validation

`pnpm validate:firefox` builds the Firefox package and exercises it in a real
Firefox, then writes screenshots and a `validation.json` result file to
`test-results/firefox/<binary>/`.

Playwright cannot load an MV3 extension in Firefox, so the runner in
`scripts/validate-firefox.mjs` talks to Firefox directly. Firefox exposes
WebDriver BiDi on `--remote-debugging-port`, and BiDi's `webExtension.install`
takes an unpacked directory, so the built package can be installed and driven
without geckodriver, a signed build, or an extra dependency. The profile pins
`extensions.webextensions.uuids` so the popup's `moz-extension://` URL is known
before the extension is installed.

Four checks run with no account at all, and they are the ones that matter most
on Gecko:

- the add-on installs under the expected id;
- the popup renders every control, in order;
- the browser has the toggle command bound to `Ctrl+Shift+7`;
- the background script mirrored that binding into `storage.local`.

The last one is the one that matters. Gecko runs the background entry as a plain
script rather than a service worker, and `chrome.commands.getAll` there is
callback-only. The `toggleShortcut` key only exists if that background script
ran and its callback fired, so this is the check that proves the Firefox
background target works at all.

### The page checks need a signed-in profile

Unlike the adjacent TikTok blocker, every surface this extension blocks is
behind a LinkedIn login. Logged out, `/feed/` and `/mynetwork/grow/` both
redirect to `/login/`, the content script's route check correctly matches
nothing, and there is nothing to hide.

That is why the profile is persistent, at
`node_modules/.tmp/gecko-profiles/<binary>`. Run once with
`FIREFOX_VALIDATE_HEADED=1`, sign in to LinkedIn in the window it opens, and the
page checks run on every later invocation. Until then they are reported as
`SKIP`, never as passes.

With a signed-in profile the run also covers: sections hidden on both supported
routes, pending invitations still visible on My Network, popup toggles
persisting to `storage.local` and surviving a reload, sections toggling
independently, hidden elements restored when a section is disabled, and
`Ctrl+Shift+7` re-blocking the current page.

A route counts as blocked only when the extension marked at least one element
with a managed `data-ltfb-*-hidden` attribute and every element it marked
computes to `display: none`. Requiring a match is what keeps the check from
going green against a page LinkedIn has renamed out from under it. Those
attribute names are read out of the built bundle rather than restated in the
script. They are plain string literals in `src/content/selectors.ts` and survive
minification, so adding a section puts it under validation with no
change to the runner.

Useful environment variables:

- `FIREFOX_BINARY` points the run at another Gecko browser.
- `FIREFOX_VALIDATE_HEADED=1` shows the browser instead of running headless.
- `FIREFOX_VALIDATE_PORT` moves the remote-agent port off `9334`.
- `FIREFOX_PROFILE_DIR` overrides the persistent profile directory.

`node scripts/validate-firefox.mjs --help` prints the same list with its
defaults. Going through `pnpm validate:firefox --help` also works, but builds
the Firefox target first.

For driving the Gecko build by hand rather than checking it automatically,
`pnpm dev:firefox` and `pnpm dev:zen` install `dist-firefox/` as a temporary
add-on on a throwaway profile and leave the window open. They read
`FIREFOX_BINARY` from the same resolution this script does, so one variable
covers every Gecko lane. See [Testing](./testing.md).

### Zen

`FIREFOX_BINARY=/usr/bin/zen-browser pnpm exec node scripts/validate-firefox.mjs`
runs the same checks in Zen. Zen installs the Firefox package unchanged. There
is no third build and no third listing.

Zen refuses to navigate any browsing context to a `moz-extension://` URL, so the
popup, storage, and command checks are skipped there and reported as `SKIP`.
This extension has no in-page control of its own, so unlike the TikTok blocker
there is no overlay switch to drive the remaining checks through: on a
signed-out Zen profile the run is reduced to "the add-on installs and logs no
errors". Signing the Zen profile in restores the page-level checks; nothing
restores the extension-page ones.

Zen is a sanity check. Firefox is the gate.

## Chrome regression check

The Chrome package must not change when the Firefox target does. Build it and
compare `dist/manifest.json` against the previous build; asset filenames are
content-hashed, so an unchanged manifest means unchanged assets. Both targets
rebuild byte-identically from a clean output directory.
