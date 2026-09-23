# Privacy and permission justifications

Use this copy for the Chrome Web Store Developer Dashboard privacy and
permission form. Keep each answer aligned with `manifest.config.ts` and current
runtime behavior before submitting a build.

The body text under each heading is the answer itself and goes into a plain-text
form field verbatim, so it stays free of Markdown: no backticks, emphasis, or
lists. Headings are labels, not answers, and may keep their markup.

Last reviewed against `manifest.config.ts` on 2026-09-23.

## Single purpose description

LinkedIn Feed Blocker helps users reduce distraction on LinkedIn by blocking
only supported LinkedIn feed and recommendation surfaces. It currently targets
the Home feed, Home right rail, the top bar notification dots and Premium link,
the promotional sidebar on job postings, and selected My Network recommendation
modules, while leaving profiles, job postings, messages, search, direct links,
and My Network invitations available. Users control each supported section from
the popup or shortcut, and settings are stored locally in Chrome extension
storage.

## Permission justifications

### `activeTab`

activeTab is used only after a user action from the popup or keyboard command to
identify and message the currently active LinkedIn tab. This lets the extension
apply the user's chosen blocking state to the page they are viewing without
broad tab history access or background scanning of unrelated tabs.

### `storage`

storage saves the user's local extension settings, including whether blocking is
enabled and which supported LinkedIn sections are blocked. The extension stores
this configuration in chrome.storage.local; it does not use this permission to
collect or transmit browsing data.

### Host permission `*://*.linkedin.com/*`

Access to LinkedIn pages is required because the content script must run there
to hide or restore selected feed, right-rail, top bar, job posting sidebar, and
My Network recommendation sections. The extension checks routes and only applies
blocking to supported LinkedIn surfaces. It does not run on non-LinkedIn sites.
