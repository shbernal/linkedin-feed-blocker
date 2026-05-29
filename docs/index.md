# Documentation Index

This directory contains contributor-facing notes for the experimental LinkedIn
Feed Blocker extension. Keep user-facing marketing or installation copy out of
this directory unless the task explicitly calls for it.

- [Project Overview](./project-overview.md) explains the goal, current scope,
  and relationship to the broader dev-project note.
- [Current Implementation](./current-implementation.md) summarizes the runtime
  surfaces, settings contract, and currently blocked LinkedIn sections.
- [Experimental Status](./experimental-status.md) records what already exists,
  why the current approach is rough, and what needs hardening before treating
  the extension as maintained.
- [Chrome Web Store Listing](./chrome-web-store.md) explains the store listing
  assets, privacy form justifications, screenshot set, and local ZIP packaging
  command.
- [Testing](./testing.md) explains the local real-site Playwright smoke-test
  lane, persistent profile setup, and generated inspection artifacts.

When behavior, settings shape, Chrome API usage, selector strategy, validation,
or publishing assumptions change, check whether these docs should be updated in
the same change.
