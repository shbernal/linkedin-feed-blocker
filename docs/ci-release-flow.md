# CI And Release Flow

This project uses GitHub Actions for pull-request validation and for publishing
to the Chrome Web Store and addons.mozilla.org. Both stores are fed from one
source tree; see [Build Targets](./build-targets.md).

## Workflows

`.github/workflows/ci.yml` runs on pull requests and pushes to `master`.

It runs two jobs. They are split so a browser-level flake reddens only the
end-to-end signal and leaves the unit-test result readable.

The `validate` job:

1. Checks out the repository.
2. Installs pnpm `11.20.0`, matching `package.json`.
3. Sets up Node `24` with pnpm caching.
4. Installs dependencies with `pnpm install --frozen-lockfile`.
5. Runs `pnpm format`.
6. Runs `pnpm typecheck`.
7. Runs `pnpm test:coverage`.
8. Runs `pnpm build`.
9. Runs `pnpm lint:firefox`, which builds the Gecko target and runs `web-ext`'s
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
any file under `src/` awaits a `chrome.*` call. Gecko exposes `chrome.*` as
callback-only, so an awaited call resolves to `undefined` there with no error
while every Chrome-side check still passes; this is the only gate that can catch
that regression.

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

## Chrome Web Store Publishing

The publish workflow uses the GitHub environment `chrome-web-store`.

The release job:

1. Checks out the release tag.
2. Runs the same install, format, typecheck, test, build and end-to-end gates
   as CI, so a release cannot ship past a red suite.
3. Verifies the configured GitHub repository variables are present.
4. Verifies the release tag matches `package.json`.
5. Zips the generated `dist/` directory.
6. Authenticates to Google Cloud through GitHub OIDC.
7. Uploads the zip with Chrome Web Store API v2.
8. Polls Chrome Web Store upload processing status.
9. Submits the item for publishing.
10. Uploads the zip as a GitHub Release asset.

Release tags should use a leading `v`, for example `v0.1.1`. The workflow
strips the leading `v` and requires the remaining value to match `package.json`
exactly. For `v0.1.1`, `package.json` must contain `"version": "0.1.1"`. Both
publish workflows enforce this independently.

## addons.mozilla.org Publishing

The AMO workflow uses the GitHub environment `addons-mozilla-org` and the
secrets `MOZILLA_ADDON_JWT_ISSUER` and `MOZILLA_ADDON_JWT_SECRET`. These are
credentials, not configuration, so they are secrets rather than repository
variables.

The release job:

1. Verifies both `MOZILLA_ADDON_*` secrets are present. This runs first, before
   the checkout, so a missing credential fails the run in seconds instead of
   after the gates and packaging that would otherwise precede the upload.
2. Checks out the release tag.
3. Runs the same install, format, typecheck, test and end-to-end gates as CI.
4. Verifies the release tag matches `package.json`.
5. Runs `pnpm package:source`. This happens **before** the build, so the source
   archive cannot pick up build output. `HEAD` is the release tag in this job,
   so archiving `HEAD` archives the tag.
6. Runs `pnpm package:firefox`, which builds `dist-firefox/` and zips it.
7. Runs `web-ext lint` over the built package.
8. Runs `pnpm publish:amo`, which uploads the package, waits for AMO's
   server-side validation, creates the version with the reviewer notes, attaches
   the source archive, and reapplies the listing icon.
9. Attaches both zips to the GitHub Release.

`scripts/publish-amo.mjs` drives AMO API v5 directly rather than going through
`web-ext sign`, which reports listed-channel review state poorly and has been
seen to exit non-zero on submissions that actually succeeded.

**A successful AMO release ends in review, not live.** A listed version is
queued for human review, so the expected successful outcome is a file status of
`unreviewed` and an add-on status of `nominated` until the first approval — not
`public`. Until that first approval the public API returns `401` and the listing
URL returns `404`. See [Firefox And AMO](./firefox-amo.md).

AMO requires a source archive with every version because the package is bundled
by Vite. That is an ongoing obligation, not a first-submission hurdle; see
[Source Code Submission](../amo/source-submission.md).

## GitHub Configuration

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
own JWT, because AMO caps a token's life at five minutes past `iat` — shorter
than the validation polling loop can run.

## Google Cloud Configuration

Chrome Web Store publishing is authenticated through Google Cloud Workload
Identity Federation.

The Google Cloud setup has three parts:

1. A service account that is authorized in the Chrome Web Store Developer
   Dashboard.
2. A Workload Identity Pool provider that trusts GitHub Actions OIDC tokens.
3. An IAM binding that lets this repository's GitHub Actions identity
   impersonate the Chrome Web Store service account.

The provider should remain restricted to this repository and release tag refs:

```text
(assertion.repository == 'shbernal/tiktok-feed-blocker' ||
  assertion.repository == 'shbernal/linkedin-feed-blocker') &&
  assertion.ref.startsWith('refs/tags/')
```

That restriction means pull requests, branch pushes, and workflows from other
repositories cannot use the Chrome Web Store service account through this trust
path. The same provider is shared with the adjacent TikTok blocker, so keep both
repositories in the condition when updating it.

## Normal Release Procedure

1. Update `package.json` to the next extension version.
2. Run local validation:

   ```sh
   pnpm format
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
8. Publish a GitHub Release with a matching tag, for example `v0.1.1`.
9. Watch both the `Publish Chrome Web Store` and
   `Publish addons.mozilla.org` GitHub Actions runs.
10. Confirm Chrome Web Store shows the new version as submitted or published,
    and that AMO shows the version as awaiting review.

Chrome Web Store rejects reused extension versions, and so does AMO, so every
release must bump `package.json` before publishing.

Do not run `pnpm publish:amo --sync-previews` in the same hour as a release.
Both draw on one AMO throttle budget and the sync is what will stall; see
[AMO Listing](./amo-listing.md).

## Useful Checks

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
gh release view v0.1.1 \
  --repo shbernal/linkedin-feed-blocker \
  --json tagName,name,isDraft,isPrerelease,assets,url
```

List configured repository variables:

```sh
gh variable list --repo shbernal/linkedin-feed-blocker
```

## Security Notes

GitHub repository variables are not secrets. They are suitable here because the
workflow stores only IDs and configuration names in variables.

The sensitive part of the release flow is the short-lived Google access token.
It is minted inside the release job through OIDC and is not stored in GitHub.

Do not print access tokens in workflow logs. If a future change introduces a
sensitive value that is not managed as a GitHub secret, mask it explicitly
before use.
