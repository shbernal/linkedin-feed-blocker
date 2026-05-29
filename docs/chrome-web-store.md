# Chrome Web Store Listing

Chrome Web Store listing assets live in `chrome-web-store/`.

- `chrome-web-store/description.txt` contains the long description to paste into
  the Chrome Web Store Developer Dashboard.
- `chrome-web-store/privacy-justifications.md` contains paste-ready privacy,
  single-purpose, permission, and host-permission justifications for the
  Developer Dashboard privacy form.
- `chrome-web-store/promo-small.png` is the required 440x280 small promo image.
- `chrome-web-store/screenshots/README.md` records the screenshot order and
  filenames.
- `chrome-web-store/screenshots/` contains the current 1280x800 PNG screenshot
  assets.

This mirrors the adjacent `tiktok-feed-blocker` asset layout, but this repo does
not have Chrome Web Store CI, release automation, or a published listing yet.

The current screenshot set uses five 1280x800 PNG files. The current Chrome Web
Store guidance requires at least one screenshot, allows up to five, and accepts
1280x800 or 640x400 images. Prefer full-bleed captures of the actual extension
experience over mockups.

Build the upload ZIP with:

```bash
pnpm package:chrome
```

That command rebuilds `dist/` and writes the upload ZIP under `release/`, which
is intentionally ignored by git.

Reference:

- [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Supplying Images](https://developer.chrome.com/docs/webstore/images)
- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)

Before submitting a release, review the listing copy and media against the
current extension behavior. Keep claims narrow: the extension currently targets
LinkedIn `/feed/` and `/mynetwork/grow/`, uses local Chrome extension storage,
and has not yet been hardened with fixture or unit tests.

## Privacy Form Process

Before filling the Developer Dashboard privacy form:

1. Compare `manifest.config.ts` against
   `chrome-web-store/privacy-justifications.md`.
2. Check that every manifest `permissions`, `host_permissions`, and
   `content_scripts.matches` entry has a matching justification.
3. Remove justification text for permissions that are no longer in the
   manifest, and remove manifest permissions that no longer support the single
   purpose.
4. Re-read the popup, background, content script, and shared settings behavior
   before submitting claims about local storage, host access, or data handling.
5. Keep every dashboard answer under the field limit shown in the Developer
   Dashboard.
