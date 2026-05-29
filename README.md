# LinkedIn Feed Blocker

LinkedIn Feed Blocker is an experimental Chrome extension for reducing
distracting LinkedIn surfaces while keeping useful areas like jobs, messages,
search, profiles, direct links, and My Network invitations available.

The current release is `0.1.1`.

## What It Blocks

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
`Command+Shift+7` on macOS.

## Install Locally

Build the extension:

```bash
pnpm install
pnpm build
```

Then load `dist/` as an unpacked extension in Chrome or Chromium:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select this repo's `dist/` directory.

## Package For Chrome Web Store

Create the upload ZIP:

```bash
pnpm package:chrome
```

The ZIP is written to `release/linkedin-feed-blocker-0.1.1.zip`. Store listing
copy and media live under `chrome-web-store/`.

Future Chrome Web Store submissions are automated from published GitHub
Releases. See `docs/ci-release-flow.md` for the release workflow and required
GitHub/GCP configuration.

## Development

Use `pnpm`, matching the `packageManager` field in `package.json`.

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm format
```

There is no default automated test suite yet. CI runs formatting, typechecking,
Playwright harness typechecking, and build checks. Real LinkedIn Playwright
checks exist for local smoke testing, but they depend on an authenticated
browser profile and live LinkedIn behavior.

## Status

This is a published prototype, not a polished extension. LinkedIn selectors are
brittle, and runtime behavior should be manually validated after changes by
loading `dist/` as an unpacked extension or running the real-site smoke lane.

The extension stores settings in `chrome.storage.local` and does not add an
external backend.

LinkedIn is a trademark of LinkedIn Corporation. This project is not affiliated
with or endorsed by LinkedIn.
