# LinkedIn Feed Blocker

[![Release](https://img.shields.io/github/v/release/shbernal/linkedin-feed-blocker?label=Release)](https://github.com/shbernal/linkedin-feed-blocker/releases/latest)
[![CI](https://github.com/shbernal/linkedin-feed-blocker/actions/workflows/ci.yml/badge.svg)](https://github.com/shbernal/linkedin-feed-blocker/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/shbernal/linkedin-feed-blocker)](https://github.com/shbernal/linkedin-feed-blocker/blob/master/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/shbernal/linkedin-feed-blocker?style=social)](https://github.com/shbernal/linkedin-feed-blocker)

LinkedIn Feed Blocker is an experimental browser extension for reducing
distracting LinkedIn surfaces while keeping useful areas like jobs, messages,
search, profiles, direct links, and My Network invitations available.

It builds for Chrome and Chromium, and for Firefox and Zen, from one source
tree. Only the manifest differs between the two packages.

The current release is `0.3.0`.

## What it blocks

Supported LinkedIn routes:

- `https://www.linkedin.com/feed/`
- `https://www.linkedin.com/mynetwork/grow/`

Current blocking targets:

- Home main feed
- Home right-rail widgets and ad-like distractions
- My Network puzzle section
- My Network Premium upsell section
- My Network suggestions sections

Each supported section can be toggled from the popup. The current supported
page can also be toggled with `Ctrl+Shift+7` on Windows/Linux or
`Command+Shift+7` on macOS. Rebinding the shortcut in
`chrome://extensions/shortcuts`, or in Firefox's Add-ons Manager, is picked up
automatically.

## Install locally

Build the extension:

```bash
pnpm install
pnpm build            # Chrome, into dist/
pnpm build:firefox    # Firefox, into dist-firefox/
```

Then load the built directory as a temporary extension:

- **Chrome or Chromium.** Open `chrome://extensions`, enable Developer mode,
  choose "Load unpacked", and select `dist/`.
- **Firefox or Zen.** Open `about:debugging#/runtime/this-firefox`, choose
  "Load Temporary Add-on", and select `dist-firefox/manifest.json`.

## Package for the stores

```bash
pnpm package:chrome     # release/linkedin-feed-blocker-<version>.zip
pnpm package:firefox    # release/linkedin-feed-blocker-firefox-<version>.zip
pnpm package:source     # release/linkedin-feed-blocker-source-<version>.zip
```

Shared listing copy and screenshots live under `store/`; Chrome-specific listing
assets live under `chrome-web-store/`, and addons.mozilla.org metadata under
`amo/`. AMO requires the source archive alongside every upload because the
package is bundled by Vite.

Submissions to both stores are automated from published GitHub Releases. See
`docs/ci-release-flow.md` for the release workflows and required
GitHub/GCP/Mozilla configuration.

## Development

Use `pnpm`, matching the `packageManager` field in `package.json`.

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
pnpm lint:firefox
pnpm format
```

`pnpm test` runs the Vitest suite in jsdom. `pnpm e2e` runs the unpacked build
in a real Chromium against local LinkedIn-shaped fixtures. `pnpm lint:firefox`
builds the Gecko package and runs `web-ext`'s static checks over it. CI runs all
three, plus formatting, typechecking and the build.

Playwright cannot load an MV3 extension in Firefox, so `pnpm validate:firefox`
drives the built Gecko package over WebDriver BiDi instead. Real LinkedIn
Playwright checks exist for local smoke testing, but they depend on an
authenticated browser profile and live LinkedIn behavior.

## Status

This is a published prototype, not a polished extension. LinkedIn selectors are
brittle, and runtime behavior should be manually validated after changes by
loading the built directory as an unpacked extension or running the real-site
smoke lane.

The extension stores settings in `chrome.storage.local` and does not add an
external backend.

LinkedIn is a trademark of LinkedIn Corporation. This project is not affiliated
with or endorsed by LinkedIn.
