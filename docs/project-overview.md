# Project Overview

LinkedIn Feed Blocker is a local Chrome extension prototype for stripping down
the distracting parts of LinkedIn while preserving the parts that are still
useful for jobs, profiles, direct links, messages, and intentional networking.

The dev-project note frames the goal as attention control: keep LinkedIn useful
without leaving the Home feed, recommendation modules, and My Network suggestion
loops untouched. This repo is the experimental implementation of that idea.

## Current Status

Status: experimental local prototype.

The repo has a working MV3 extension shape, a popup, persistent settings, a
background keyboard command, and a content script with LinkedIn-specific hiding
selectors. It does not yet have automated tests, fixture snapshots, a release
workflow, a configured git remote, or a hardened selector strategy.

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
- Chrome Web Store publishing.
- Shared infrastructure with `tiktok-feed-blocker`.
- A public user-facing README or store listing.
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
