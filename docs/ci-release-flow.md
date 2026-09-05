# CI and release flow

This project uses GitHub Actions for pull-request validation and for publishing
to the Chrome Web Store and addons.mozilla.org. Both stores are fed from one
source tree; see [Build Targets](./build-targets.md).

## Workflows

`.github/workflows/ci.yml` runs on pull requests and pushes to `master`.

It runs two jobs. They are split so a browser-level flake reddens only the
end-to-end signal and leaves the unit-test result readable.

The `validate` job:

1. Checks out the repository.
2. Installs pnpm, taking the version from `packageManager` in `package.json`.
3. Sets up Node `24` with pnpm caching.
4. Installs dependencies with `pnpm install --frozen-lockfile`.
5. Runs `pnpm format`.
6. Runs `pnpm lint` with `--format github`, so a finding renders as an inline
   annotation on the pull request rather than a line in the log.
7. Runs `pnpm typecheck`.
8. Runs `pnpm test:coverage`.
9. Runs `pnpm build`.
10. Runs `pnpm lint:firefox`, which builds the Gecko target and runs `web-ext`'s
    static checks over it. Zero errors is the bar; the expected warnings are
    listed in [Build Targets](./build-targets.md).

`pnpm typecheck` is a single `tsc -b`, which covers the extension, the Node-side
config plus `tests/`, and the Playwright harness through project references.

The `e2e` job installs Playwright's Chromium with `--with-deps` and runs
`pnpm e2e`, then uploads the HTML report as an artifact even when the suite
fails. The persistent context that loads the unpacked build needs a real
Chromium rather than the bundled headless shell, which is why that install step
exists.

`tests/browser-api-compat.test.ts` runs inside `pnpm test:coverage` and fails if
any file under `src/` awaits a `chrome.*` call. It is the only gate that catches
that regression; see
[Never await a `chrome.*` call](./firefox-amo.md#never-await-a-chrome-call).

`.github/dependabot.yml` opens weekly update pull requests for npm dependencies
and GitHub Actions. Development dependencies are grouped into a single pull
request, with at most five open npm pull requests at a time. Both stores' review
processes flag stale bundled dependencies, so this keeps the shipped tree moving
even when nothing else changes.

`.github/workflows/publish-cws.yml` runs when a GitHub Release is published.
It validates the release, builds the extension, uploads the packaged `dist/`
directory to Chrome Web Store, submits the item for review, and attaches the zip
to the GitHub Release.

`.github/workflows/publish-amo.yml` runs on the same trigger and submits the
Firefox package to addons.mozilla.org. The two workflows are independent:
neither waits for the other, and each repeats the validation gates itself so a
release cannot ship past a red suite through either path.

## Chrome Web Store publishing

The publish workflow uses the GitHub environment `chrome-web-store`.

The release job:

1. Checks out the release tag.
2. Runs the same install, format, lint, typecheck, test, build and end-to-end
   gates as CI, so a release cannot ship past a red suite.
3. Verifies the configured GitHub repository variables are present.
4. Verifies the release tag matches `package.json`.
5. Zips the generated `dist/` directory.
6. Authenticates to Google Cloud through GitHub OIDC.
7. Uploads the zip with Chrome Web Store API v2.
8. Polls Chrome Web Store upload processing status.
9. Submits the item for publishing.
10. Uploads the zip as a GitHub Release asset.

The two steps that write a response to a file take the status from curl's
`-w '%{http_code}'` rather than from `--fail-with-body`. With `--fail-with-body`
the body lands in the file and curl exits non-zero, which under the default
`bash -e` aborts the step before anything prints it. The TikTok extension's
1.4.1 release failed on a 400 whose message was never shown. Whatever Chrome
answers with is printed before the status is checked.

Release tags should use a leading `v`, for example `v0.2.0`. The workflow
strips the leading `v` and requires the remaining value to match `package.json`
exactly. For `v0.2.0`, `package.json` must contain `"version": "0.2.0"`. Both
publish workflows enforce this independently.

## addons.mozilla.org publishing

The AMO workflow uses the GitHub environment `addons-mozilla-org` and the
secrets `MOZILLA_ADDON_JWT_ISSUER` and `MOZILLA_ADDON_JWT_SECRET`. These are
credentials, so they are secrets rather than repository
variables.

The release job:

1. Verifies both `MOZILLA_ADDON_*` secrets are present. This runs first, before
   the checkout, so a missing credential fails the run in seconds instead of
   after the gates and packaging that would otherwise precede the upload.
2. Checks out the release tag.
3. Runs the same install, format, lint, typecheck, test and end-to-end gates as
   CI.
4. Verifies the release tag matches `package.json`.
5. Runs `pnpm package:source`. This happens **before** the build, so the source
   archive cannot pick up build output. `HEAD` is the release tag in this job,
   so archiving `HEAD` archives the tag.
6. Runs `pnpm package:firefox`, which builds `dist-firefox/` and zips it.
7. Runs `web-ext lint` over the built package.
8. Runs `pnpm publish:amo`, which uploads the package, waits for AMO's
   server-side validation, creates the version with the reviewer notes, attaches
   the source archive, and reapplies the listing icon.
9. Attaches both zips, and the listing lock if one was written, to the GitHub
   Release.

`scripts/publish-amo.mjs` drives AMO API v5 directly rather than going through
`web-ext sign`, which reports listed-channel review state poorly and has been
seen to exit non-zero on submissions that actually succeeded.

**Step 8 is only half proven in CI.** The job has run once, for v0.2.0. With the
`addons-mozilla-org` secrets it authenticated, uploaded the package and got a
passing validation back, so the credential path and the upload are known to work
from Actions. It then failed on the version-creating `PUT`, because the slug it
asked for was taken; see [The Slug Is Not The Repo
Name](./amo-listing.md#the-slug-is-not-the-repo-name). That `PUT` and everything
after it — the source attach, the listing icon, the lock, and step 9's asset
upload — have only ever run from a maintainer's machine, which is how 0.2.0
reached AMO. Expect the next release to be the first end-to-end run of the back
half, and read a failure there as untested rather than broken.

`pnpm publish:amo --check` re-proves the credentials on their own. It makes one
authenticated `GET` and prints the account it resolved to; nothing is uploaded.

**A successful AMO release ends in review, not live.** A listed version is
queued for human review, so the expected successful outcome is a file status of
`unreviewed`, not `public`. The add-on itself already reads `public` from 0.2.0's
approval and keeps reading that while the new file waits, so the add-on status
is not what says whether the release landed. See
[Firefox And AMO](./firefox-amo.md).

AMO requires a source archive with every version because the package is bundled
by Vite. That is an ongoing obligation, not a first-submission hurdle; see
[Source Code Submission](../amo/source-submission.md).

## GitHub configuration

The Chrome publish workflow uses the GitHub environment `chrome-web-store` and
these repository variables:

- `CWS_EXTENSION_ID`: `foncphmfnndmjembiamdmciojcdjnlpc`
- `CWS_PUBLISHER_ID`: `45b66eec-fe97-4bca-a892-b10af59a0fab`
- `GCP_PROJECT_ID`: `chrome-webstore-ci-9b6f6e`
- `GCP_SERVICE_ACCOUNT`:
  `chrome-webstore-ci@chrome-webstore-ci-9b6f6e.iam.gserviceaccount.com`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`:
  `projects/366600061980/locations/global/workloadIdentityPools/github/providers/github`

These values are identifiers and configuration, not credentials. Do not store a
Google service-account JSON key in GitHub for this flow.

The workflow also uses these permissions:

- `contents: write`, so it can attach the packaged zip to the GitHub Release.
- `id-token: write`, so GitHub Actions can request an OIDC token for Google
  Cloud authentication.

The AMO workflow uses the GitHub environment `addons-mozilla-org`, the two
`MOZILLA_ADDON_*` secrets above, and only `contents: write`. It authenticates
with a JWT it mints itself, so it needs no OIDC token. Every request mints its
own JWT, because AMO caps a token's life at five minutes past `iat`, shorter
than the validation polling loop can run.

AMO's write throttles are paced rather than only retried. `pnpm publish:amo`
tracks what it has sent and waits before a call that would land in a full
window, counting every send whether or not AMO accepted it, because a rejected
request still spends budget on the windows it did not violate. A 429 the model
did not predict is still retried, but only when the wait is one this run can
serve: a single wait is capped at 70 minutes and a whole run at two hours.
Anything longer is a bucket that refills on a scale a GitHub job does not live
on, so the run fails and prints the time to re-run after.

The job also uploads only what changed. `amo/previews.lock.json` records the
hashes of the icon and each preview as last pushed, and an absent or unusable
lock degrades to a full replace. The job cannot commit the lock back, so it
attaches it to the release; committing it makes the next release cheaper and
skipping that costs nothing beyond a redundant upload. See
[Preview Writes Are Throttled Hard](./amo-listing.md#preview-writes-are-throttled-hard)
and [The Listing Lock](./amo-listing.md#the-listing-lock).

## Google Cloud configuration

Chrome Web Store publishing is authenticated through Google Cloud Workload
Identity Federation.

The Google Cloud setup has three parts:

1. A service account that is authorized in the Chrome Web Store Developer
   Dashboard.
2. A Workload Identity Pool provider that trusts GitHub Actions OIDC tokens.
3. An IAM binding that lets this repository's GitHub Actions identity
   impersonate the Chrome Web Store service account.

The provider should remain restricted to these two repositories and release tag
refs:

```text
(assertion.repository == 'shbernal/tiktok-feed-blocker' ||
  assertion.repository == 'shbernal/linkedin-feed-blocker') &&
  assertion.ref.startsWith('refs/tags/')
```

That restriction means pull requests, branch pushes, and workflows from other
repositories cannot use the Chrome Web Store service account through this trust
path. The same provider is shared with the adjacent TikTok blocker, so keep both
repositories in the condition when updating it.

## Normal release procedure

1. Update `package.json` to the next extension version.
2. Run local validation:

   ```sh
   pnpm format
   pnpm lint
   pnpm typecheck
   pnpm test:coverage
   pnpm build
   pnpm e2e
   pnpm lint:firefox
   ```

3. For content-script, selector, or popup changes, run the real-site smoke lane
   with the local authenticated profile, and the Gecko runtime check:

   ```sh
   pnpm e2e:real
   pnpm validate:firefox
   ```

4. Check whether `store/description.txt` or `store/screenshots/` need updates
   for the user-facing change. Remember `store/` is shared: an edit there is a
   queued AMO change as well as a Chrome dashboard paste.
5. Confirm the Firefox package still rebuilds byte-for-byte from a clean
   extraction of the source archive, then run `pnpm publish:amo --dry-run`.
6. Commit the release candidate and version bump.
7. Push `master`.
8. Publish a GitHub Release with a matching tag, for example `v0.2.0`.
9. Watch both the `Publish Chrome Web Store` and
   `Publish addons.mozilla.org` GitHub Actions runs.
10. Confirm Chrome Web Store shows the new version as submitted or published,
    and that AMO shows the version as awaiting review.

Chrome Web Store rejects reused extension versions, and so does AMO, so every
release must bump `package.json` before publishing.

Do not run `pnpm publish:amo --sync-previews` in the same hour as a release.
Both draw on one AMO throttle budget and the sync is what will stall; see
[AMO Listing](./amo-listing.md).

## When a publish job fails

The two publish jobs are independent, and a store that rejected a submission
usually has not recorded the version at all. Re-run the failed job rather than
cutting a new tag:

```sh
gh run rerun <run-id> --repo shbernal/linkedin-feed-blocker
```

A re-run replays the original commit, so it does not pick up a fix pushed to
`master` afterwards, which only reaches the next release. What it is for is a
store-side condition that has since cleared.

Two of those are known from the TikTok extension, which publishes through the
same two workflows:

- **AMO throttled the submission.** The failure prints when the bucket refills;
  re-run after that. AMO's daily add-on-submission budget is per user and a
  release spends about four calls, so a release cut within a day of the last one
  in either repository, since the credential is shared, can land on it.
- **Chrome answered 400 on the upload.** Read the message the step now prints
  before assuming anything. The TikTok 1.4.1 upload hit one while 1.4.0 was
  still in review and its body was discarded, so whether Chrome refuses an
  upload against an item with a pending submission is a guess that was never
  settled. If it recurs here, the log will say. Check what is actually live
  first:

  ```sh
  curl -sI "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=200&acceptformat=crx3&x=id%3Dfoncphmfnndmjembiamdmciojcdjnlpc%26uc" |
    grep -i location
  ```

Neither case burns the version number: nothing was created on either store, so
the same tag can be re-run until it lands.

## Useful checks

List recent runs:

```sh
gh run list --repo shbernal/linkedin-feed-blocker --limit 10
```

Watch a run:

```sh
gh run watch <run-id> --repo shbernal/linkedin-feed-blocker --exit-status
```

Inspect the release asset:

```sh
gh release view v0.2.0 \
  --repo shbernal/linkedin-feed-blocker \
  --json tagName,name,isDraft,isPrerelease,assets,url
```

List configured repository variables:

```sh
gh variable list --repo shbernal/linkedin-feed-blocker
```

## Security notes

GitHub repository variables are not secrets. They are suitable here because the
workflow stores only IDs and configuration names in variables.

The sensitive part of the release flow is the short-lived Google access token.
It is minted inside the release job through OIDC and is not stored in GitHub.

Do not print access tokens in workflow logs. If a future change introduces a
sensitive value that is not managed as a GitHub secret, mask it explicitly
before use.
