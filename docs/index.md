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
- [Build Targets](./build-targets.md) explains the Chrome and Firefox build
  commands, how the two manifests differ, and how to lint and runtime-validate
  the Firefox package.
- [Firefox And AMO](./firefox-amo.md) explains the callback-only `chrome.*`
  rule and why the polyfill was rejected, the permanent add-on id, the
  data-collection declaration, and what distributing on addons.mozilla.org
  obliges the repository to do.
- [Chrome Web Store Listing](./chrome-web-store.md) explains how listing assets
  are split between `store/` and `chrome-web-store/`, the privacy form
  justifications, the screenshot set, and the local ZIP packaging command.
- [AMO Listing](./amo-listing.md) explains the addons.mozilla.org listing copy,
  metadata, listing assets, the preview throttle, and the source-submission
  requirement.
- [CI And Release Flow](./ci-release-flow.md) explains pull-request validation,
  GitHub Release publishing to both the Chrome Web Store and
  addons.mozilla.org, and required GitHub/GCP/Mozilla configuration.
- [Testing](./testing.md) explains the three test layers, the Chrome API mock,
  the shared LinkedIn fixtures and the rule they follow, the coverage map, and
  the local real-site smoke-test lane.

When behavior, settings shape, Chrome API usage, selector strategy, validation,
or publishing assumptions change, check whether these docs should be updated in
the same change.
