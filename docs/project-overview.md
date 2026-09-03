# Project overview

LinkedIn Feed Blocker is an experimental browser extension for stripping down the
distracting parts of LinkedIn while preserving the parts that are still useful
for jobs, profiles, direct links, messages, and intentional networking.

The dev-project note frames the goal as attention control: keep LinkedIn useful
without leaving the Home feed, recommendation modules, and My Network suggestion
loops untouched. This repo is the experimental implementation of that idea.

## Current status

Status: experimental published 0.2.0 extension.

It builds for Chromium and for Gecko from one source tree and publishes to both
stores from published GitHub Releases. Treat it as an implementation sandbox
until the selector strategy is hardened.

[Experimental Status](./experimental-status.md) lists what exists and what is
still rough. [Current Implementation](./current-implementation.md) has the
supported routes and the blocked sections. Neither list is repeated here,
because a fourth copy of it is how the third one went stale.

The extension preserves higher-value LinkedIn surfaces by default: search,
messages, jobs, direct profile pages, and My Network invitations.

## Repository layout

The extension is built with Vite, React, TypeScript, and `@crxjs/vite-plugin`.

| Path                               | What lives there                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `manifest.config.ts`               | the MV3 manifest; reads the version from `package.json` and switches on `EXT_TARGET`          |
| `vite.config.ts`                   | output directory and dev-server CORS origin, on the same variable                             |
| `src/background/service-worker.ts` | the keyboard command, and the binding mirror the content script reads                         |
| `src/content/content-script.ts`    | the content-script entry: listeners, observer, scheduled re-apply, shortcut state             |
| `src/content/selectors.ts`         | the section-to-selector table, the managed `data-ltfb-*` attributes, and the DOM predicates   |
| `src/content/routes.ts`            | maps a pathname to the sections the extension may touch there                                 |
| `src/content/blocking.ts`          | hiding, restoring, and the managed-attribute bookkeeping                                      |
| `src/content/blockingStyles.ts`    | the pre-paint curtain: the ready gate and the generator for `blocking.css`                    |
| `src/popup/App.tsx`                | the popup UI for global and per-section toggles                                               |
| `src/shared/settings.ts`           | storage keys, defaults, normalization, and legacy settings migration                          |
| `src/shared/shortcut.ts`           | parses a `chrome.commands` binding into a keydown matcher for the in-page fallback            |
| `src/shared/linkedin.ts`           | answers whether a URL is on LinkedIn                                                          |
| `src/test/`                        | the shared Chrome API mock, the Vitest setup file, and the LinkedIn fixture markup            |
| `tests/`                           | source-tree guards, run inside Vitest; the `.ts` ones compile under `tsconfig.node.json`      |
| `e2e/specs/`                       | the deterministic Playwright suite CI runs                                                    |
| `e2e/real/`, `e2e/manual/`         | the opt-in credentialed lanes CI cannot run                                                   |
| `scripts/`                         | plain-ESM release, validation and development tooling                                         |
| `public/icons/`                    | extension icons copied into builds, generated from `store/logo.svg`                           |
| `store/`                           | listing assets shared across stores: description, screenshots, and the logo                   |
| `chrome-web-store/`                | Chrome-specific listing assets: privacy justifications and the promo tile                     |
| `amo/`                             | addons.mozilla.org listing metadata, preview captions, and the source-submission instructions |
| `docs/`                            | contributor-facing project and implementation notes                                           |
| `.github/workflows/`               | pull-request validation and the two independent store publish workflows                       |

`dist/`, `dist-firefox/` and `release/` are generated or packaged outputs and are
ignored by git.

`scripts/` holds the source archiver, the AMO publisher with its listing-asset
planner and write-throttle budget, the Gecko runtime validator, the icon
renderer, the Chromium and Gecko launchers, the runtime inspector, and the
shared browser resolution and `--help` handling the rest of them import.

## Out of scope for now

- Replacing LinkedIn with a full custom shell.
- Blocking every LinkedIn route.
- Shared runtime infrastructure with `tiktok-feed-blocker`.
- A career workflow for jobs, applications, and messaging. That remains
  adjacent context, not this extension's job.

## Source of truth

Use this order when repo docs and planning notes disagree:

1. Current source code.
2. Repo-local docs under `docs/`.
3. `/home/shb/notes/dev-projects/linkedin-feed-blocker.md` for background.
4. Workspace-level notes under `/home/shb/Work/zen-media/docs/`.

The planning notes can be stale. Keep this repo's docs aligned with the code
when implementation changes.
