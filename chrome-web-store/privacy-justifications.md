# Privacy And Permission Justifications

Use this copy for the Chrome Web Store Developer Dashboard privacy and
permission form. Keep each answer aligned with `manifest.config.ts` and current
runtime behavior before submitting a build.

Last reviewed against `manifest.config.ts`.

## Single Purpose Description

LinkedIn Feed Blocker helps users reduce distraction on LinkedIn by blocking
only supported LinkedIn feed and recommendation surfaces. It currently targets
the Home feed, Home right rail, and selected My Network recommendation modules,
while leaving profiles, jobs, messages, search, direct links, and My Network
invitations available. Users control each supported section from the popup or
shortcut, and settings are stored locally in Chrome extension storage.

## Permission Justifications

### `activeTab`

`activeTab` is used only after a user action from the popup or keyboard command
to identify and message the currently active LinkedIn tab. This lets the
extension apply the user's chosen blocking state to the page they are viewing
without broad tab history access or background scanning of unrelated tabs.

### `storage`

`storage` saves the user's local extension settings, including whether blocking
is enabled and which supported LinkedIn sections are blocked. The extension
stores this configuration in `chrome.storage.local`; it does not use this
permission to collect or transmit browsing data.

### Host Permission: `*://*.linkedin.com/*`

`*://*.linkedin.com/*` is required because the content script must run on
LinkedIn pages to hide or restore selected feed, right-rail, and My Network
recommendation sections. The extension checks routes and only applies blocking
to supported LinkedIn surfaces. It does not run on non-LinkedIn sites.
