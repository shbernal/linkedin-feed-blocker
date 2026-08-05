# Project Overview

LinkedIn Feed Blocker is an experimental browser extension for stripping down the
distracting parts of LinkedIn while preserving the parts that are still useful
for jobs, profiles, direct links, messages, and intentional networking.

The dev-project note frames the goal as attention control: keep LinkedIn useful
without leaving the Home feed, recommendation modules, and My Network suggestion
loops untouched. This repo is the experimental implementation of that idea.

## Current Status

Status: experimental published 0.2.0 extension.

The repo has a working MV3 extension shape, a popup, persistent settings, a
background keyboard command, and a content script with LinkedIn-specific hiding
selectors. It builds for Chromium and for Gecko from one source tree and
publishes to both the Chrome Web Store and addons.mozilla.org from published
GitHub Releases. It has listing copy, captured screenshots, promo imagery,
packaging commands for all three release artifacts, a Vitest suite with a
coverage ratchet, source-tree guards, and a fixture-backed Playwright suite. It
does not yet have a hardened selector strategy, and hiding is still inline
`display: none` applied after first paint rather than a `document_start`
stylesheet.

Use this repo as an implementation sandbox until those gaps are closed.

## Current Scope

Supported LinkedIn routes:

- `https://www.linkedin.com/feed/`
- `https://www.linkedin.com/mynetwork/grow/`

Current blocking targets:

- Home main feed.
- Home right-rail feed widgets and ads.
- My Network puzzle section.
- My Network Premium upsell section.
- My Network suggestions sections.

The extension is meant to preserve higher-value LinkedIn surfaces by default:
search, messages, jobs, direct profile pages, and My Network invitations.

## Out Of Scope For Now

- Replacing LinkedIn with a full custom shell.
- Blocking every LinkedIn route.
- Shared runtime infrastructure with `tiktok-feed-blocker`.
- A career workflow for jobs, applications, and messaging. That remains
  adjacent context, not this extension's job.

## Source Of Truth

Use this order when repo docs and planning notes disagree:

1. Current source code.
2. Repo-local docs under `docs/`.
3. `/home/shb/notes/dev-projects/linkedin-feed-blocker.md` for background.
4. Workspace-level notes under `/home/shb/Work/zen-media/docs/`.

The planning notes can be stale. Keep this repo's docs aligned with the code
when implementation changes.
