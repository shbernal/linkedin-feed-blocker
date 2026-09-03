# Data Collection And Permission Justifications

Use this copy for the addons.mozilla.org submission. Keep every answer aligned
with `manifest.config.ts` and current runtime behavior before submitting a
build. This is the AMO counterpart to
`chrome-web-store/privacy-justifications.md`; the underlying claims are the
same, but AMO asks for them in a different shape.

The body text under each heading is the answer itself and goes into a plain-text
form field verbatim, so it stays free of Markdown — no backticks, emphasis, or
lists. Headings are labels, not answers, and may keep their markup.

Last reviewed against `manifest.config.ts` on 2026-09-03.

## Declared Data Collection

The Firefox manifest declares:

```json
"data_collection_permissions": { "required": ["none"] }
```

Firefox shows this to the user at install time as a statement that the add-on
collects no data. The key is only understood from Firefox 140, which is why
`strict_min_version` is `140.0` — below that floor the key is ignored and the
disclosure would never reach the user.

`none` is the strongest answer available and it may not be combined with any
other value. It is only correct while every one of the following holds.

## Basis For The `none` Answer

- The manifest requests `activeTab`, `storage`, and the host permission
  `*://*.linkedin.com/*`. Nothing else.
- The entire non-test extension API surface is `storage.local` get/set plus
  `storage.onChanged`, `tabs.query` and `tabs.sendMessage`, `runtime.onMessage`
  and `runtime.lastError`, and `commands.getAll` and `commands.onCommand`.
- `src/` contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`,
  `EventSource`, `new Image(`, or HTTP client dependency. The only remote URLs
  in the tree are LinkedIn and example.com string literals inside tests.
- Settings are written to and read from `chrome.storage.local` only. There is no
  sync storage, no remote endpoint, and no telemetry.
- The content script reads the page to find the containers it hides, and it
  reads element text to tell a puzzle promo from a Premium upsell from a
  suggestion module. It does not persist, transmit, or derive anything from
  page content.
- The only value the extension writes that did not come from the user is the
  resolved keyboard binding, mirrored from `commands.getAll` into
  `storage.local` so the in-page fallback can match the same keys. That is
  browser state, not browsing data.

If a future change transmits anything off the device — analytics, sync,
crash reporting, a remote config fetch — `data_collection_permissions` must
change before that ships. It is a user-facing promise, not a formality.

## Permission Justifications

Send these as reviewer notes if AMO asks why each permission is needed.

### `activeTab`

Used only after a user action from the popup or the keyboard command, to
identify and message the currently active LinkedIn tab. It applies the user's
chosen blocking state to the page they are looking at, without broad tab access
or background scanning of unrelated tabs.

### `storage`

Saves the user's local settings: whether blocking is enabled, and whether the
Home feed, the Home right rail, and the My Network puzzle, Premium, and
suggestion sections are each blocked. It also holds the keyboard binding the
browser resolved for the toggle command, so the in-page fallback matches the
same keys. Written to storage.local. It is not used to collect or transmit
browsing data.

### Host permission `*://*.linkedin.com/*`

The content script must run on LinkedIn pages to find the Home feed, the Home
right-rail widgets, and the My Network puzzle, Premium, and suggestion modules,
and to hide or restore whichever of them the user has chosen to block. It runs
on no other site.

## Review Process

Before submitting a version:

1. Compare `manifest.config.ts` against this file.
2. Check that every `permissions`, `host_permissions`, and
   `content_scripts.matches` entry has a justification here, and that no
   justification survives for a permission that has been removed.
3. Re-read the popup, background, content script, and shared settings code
   before repeating the claims about local storage, host access, and data
   handling.
4. Re-run the `src/` search for network APIs listed above. The `none`
   declaration rests on it.
