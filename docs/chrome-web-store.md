# Chrome Web Store Listing

Chrome Web Store listing assets live in `chrome-web-store/`.

- `chrome-web-store/description.txt` contains the long description to paste into
  the Chrome Web Store Developer Dashboard.
- `chrome-web-store/screenshots/README.md` records the planned screenshot order
  and filenames until real screenshots are captured.
- `chrome-web-store/screenshots/` should contain finished screenshot assets once
  they exist.

This mirrors the adjacent `tiktok-feed-blocker` asset layout, but this repo does
not have Chrome Web Store CI, release automation, or a published listing yet.

For screenshots, start with 1280x800 PNG files. The current Chrome Web Store
guidance requires at least one screenshot, allows up to five, and accepts
1280x800 or 640x400 images. Prefer full-bleed captures of the actual extension
experience over mockups.

Reference:

- [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Supplying Images](https://developer.chrome.com/docs/webstore/images)
- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)

Before a release, review the listing copy against the current extension
behavior. Keep claims narrow: the extension currently targets LinkedIn `/feed/`
and `/mynetwork/grow/`, uses local Chrome extension storage, and has not yet
been hardened with fixture or unit tests.
