# Testing

This repo now has a local, opt-in real-site smoke-test lane for inspecting the
extension against LinkedIn with screenshots, video, and traces. It is separate
from the normal build checks because it depends on LinkedIn uptime, account
state, regional UI, verification prompts, and current DOM structure.

## Commands

- `pnpm typecheck` runs the extension TypeScript project build.
- `pnpm build` runs TypeScript checks and writes the unpacked extension to
  `dist/`.
- `pnpm typecheck:e2e` type-checks the Playwright real-site harness.
- `pnpm e2e:real:setup` opens the persistent LinkedIn profile without loading
  the extension so the account session can be repaired manually.
- `pnpm e2e:real:login` is an alias for `pnpm e2e:real:setup`.
- `pnpm e2e:real` builds the extension and runs the real LinkedIn smoke test
  with the extension loaded.
- `pnpm manual:linkedin` builds the extension, opens a headed Chromium window
  with the extension loaded, and keeps the session open until the browser is
  closed or the command is stopped.

## Persistent Profile

The real-site lane uses `.e2e/linkedin-real-profile`, which is ignored by git.
For this workstation it is seeded from the `santiago` Chromium profile in
`/home/shb/Work/linkedin-careers/data/browser-profiles/santiago`.

The copied profile is test state. Do not commit it, do not paste LinkedIn
cookies or tokens into chat or repo files, and delete or recopy it if the state
becomes inconsistent.

Set `LINKEDIN_REAL_PROFILE_DIR=/absolute/or/relative/path` to use another
profile directory.

## Setup Flow

1. Seed `.e2e/linkedin-real-profile` from the `santiago` profile.
2. Run `pnpm e2e:real:setup` or `pnpm e2e:real:login`.
3. Confirm LinkedIn is signed in in the Chromium window.
4. Complete any checkpoint, 2FA, cookie, or verification prompts.
5. Visit `https://www.linkedin.com/feed/` once and confirm the feed loads.
6. Close the Chromium tab or window.

## Real Smoke Test

Run `pnpm e2e:real` after setup. The test opens the copied persistent profile
with the built extension loaded, visits `https://www.linkedin.com/feed/`,
captures an unblocked checkpoint screenshot, enables only Home feed blocking
through extension storage, captures a blocked screenshot, then restores the
feed and captures a final screenshot.

Playwright stores failure screenshots, retained failure video, traces, and
explicit checkpoint screenshots under `test-results/`. The HTML report is
written to `playwright-report/`. Both directories are ignored by git.

This lane is a selector-drift smoke check. It should not replace deterministic
unit or fixture tests when those are added.

## Manual LinkedIn Session

Run `pnpm manual:linkedin` when you want to move around LinkedIn manually with
the current `dist/` extension loaded in the same persistent profile used by the
real smoke tests.

Set `LINKEDIN_MANUAL_URL=https://www.linkedin.com/feed/` to start on another
LinkedIn route. The default start URL is
`https://www.linkedin.com/mynetwork/grow/`.
