# Media capture

The README's demo GIF, before/after, and popup image come from three commands.
`pnpm media:snapshot` saves real LinkedIn pages once, `pnpm media:capture`
records the extension against that snapshot offline, and `pnpm media:encode`
turns the recording into the images. Capture and encode write to
`media-capture/`, which git ignores. Nothing is copied into the repository for
you: look at the output, then copy what changed.

| File                  | Where it goes                     |
| --------------------- | --------------------------------- |
| `demo.gif`            | `.github/readme/demo.gif`         |
| `before-after.png`    | `.github/readme/before-after.png` |
| `popup.png`           | `.github/readme/popup.png`        |
| `feed-*.png`          | source stills for the composite   |
| `network-blocked.png` | a still of My Network, blocked    |

The store screenshots under `store/screenshots/` come from `pnpm store:shots`,
which replays the same snapshot through the same blur selectors and is
documented in [Chrome Web Store](./chrome-web-store.md).

## Why there is a snapshot

LinkedIn shows nothing useful signed out, and it signs a session out within one
or two page loads once the browser navigates programmatically. Recording
against the live site cost a manual sign-in per attempt, and most attempts need
several runs.

So `pnpm media:snapshot` never navigates. It opens a headed Chromium on the
real-site profile, `.e2e/linkedin-real-profile`, with the extension not loaded,
and waits for you to visit Home and My Network's Grow tab by hand, signing in
first if asked. When you land on each page it waits eight seconds and saves the
DOM with scripts, inline handlers, and the CSP meta tag removed, and with every
readable stylesheet inlined from the CSSOM. The whole visit is recorded to a
HAR. Everything goes to `.e2e/media-snapshot/`, which git ignores, because it
holds your own feed and the people in your network.

`pnpm media:capture` then serves the saved DOM for those two URLs, the HAR for
everything else, and refuses any other request. It never contacts LinkedIn and
needs no session, so it can run as often as it takes. The extension still runs
against LinkedIn's real markup, so what it hides in the recording is what it
hides on the site that day.

Two edits are made when serving a saved page. The CSP meta tag is dropped,
because its Trusted Types rule refuses the capture's overlay. The nav bar's
link to `/mynetwork` points at `/mynetwork/grow/` instead: live LinkedIn
redirects there, but the HAR may hold a stale answer for the redirect.

## What the capture does

`scripts/capture-media.mjs` loads `dist/` in headless Chromium at 1280x800.
Before the page renders it blurs everything that identifies a person: the
signed-in member's card, company page and avatar, every post and the composer,
the people and companies under "Add to your feed", the invitations, the puzzle
card that greets the member by name, and "People who viewed your profile".
`BLUR_SELECTORS` lists them. It also draws a cursor and a caption pill, since
headless Chromium draws no pointer.

It opens Home with Home unblocked, presses
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>7</kbd> to block it, toggles it off and
on again, then clicks through to My Network, which is already blocked. Frames
come from the DevTools screencast and go straight to disk. Last, it screenshots
the popup at 2x with every section on. When a step fails, it saves
`fail-<step>.png` next to the output.

`scripts/capture-media-encode.mjs` writes the GIF with ffmpeg and gifski and
the before/after composite with ImageMagick.

After a new snapshot, check the stills before copying anything: LinkedIn
changes its markup, and a blur selector that stops matching leaves a real name
in a published image. The capture does not check this for you.

## Why it runs capped

`scripts/capture-media.sh` runs capture, encode and the store shots in a
transient systemd user unit, which covers node and every process it starts. The same capture in
`tiktok-feed-blocker` once exhausted memory system-wide and froze the desktop,
and `timeout` had killed only `node`, leaving Chromium running.

| Limit                           | Effect                                               |
| ------------------------------- | ---------------------------------------------------- |
| `MemoryMax=3G`, `MemoryHigh=2G` | an overrun is OOM-killed inside the unit, not global |
| `MemorySwapMax=0`               | the unit cannot push the machine into swap           |
| `CPUQuota=400%`, `Nice=10`      | four cores at most, at low priority                  |
| `RuntimeMaxSec`                 | 240s for capture, 180s for encode and store shots    |
| `KillMode=control-group`        | no browser outlives the unit                         |

The capture script adds its own guards: it will not start with less than 3G
available, it stops above 2.2G of unit memory or after 180s, it caps the
recording at 700 frames, and it deletes its temporary profile on every exit
path. If `systemd-run --user` is unavailable, the wrapper stops instead of
running uncapped. A capture takes about 20 seconds and peaks under 400M.

`pnpm media:snapshot` is not capped this way: it runs one headed browser for as
long as you take to click through.

## Requirements

Linux with a systemd user session and cgroup v2 memory delegation, a Chromium
binary, ffmpeg, gifski, ImageMagick 7, and fontconfig. `pnpm media:capture`
builds `dist/` first.
