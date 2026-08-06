# AMO Listing

AMO-specific listing assets live in `amo/`, mirroring how `chrome-web-store/`
holds the Chrome-specific ones. Copy that both stores publish verbatim lives in
`store/` instead of being duplicated into each.

- `store/description.txt` contains the long description. It is shared with the
  Chrome listing rather than living in `amo/`; see
  [Store Listing Copy](#store-listing-copy-is-shared) below.
- `amo/listing.json` contains the rest of the listing metadata — slug, summary,
  categories, tags, and support links — in the shape the AMO API accepts. See
  [The Slug Is Not The Repo Name](#the-slug-is-not-the-repo-name) below.
- `amo/previews.json` orders and captions the screenshots AMO publishes; see
  [Listing Assets](#listing-assets-are-repo-driven-too) below.
- `amo/data-collection.md` contains the `data_collection_permissions` answer,
  the evidence it rests on, and paste-ready permission justifications for
  reviewer notes.
- `amo/source-submission.md` contains the reviewer build instructions, how to
  produce the source archive, and the recorded reproducibility result.

Screenshots are shared with the Chrome listing: `store/screenshots/` holds the
five images used on both stores. AMO has no promo-tile requirement, so it needs
nothing the Chrome listing does not already have. Do not copy those files into
`amo/` and do not regenerate them for AMO. `amo/previews.json` references them
in place, and stays in `amo/` because it is AMO-shaped metadata — localized
captions and `position` semantics — about images Chrome consumes without either.

## The Slug Is Not The Repo Name

The AMO slug is `quiet-linkedin`, not `linkedin-feed-blocker`. The obvious slug
is taken by an unrelated add-on published in June 2021 under the guid
`{78400a4a-b6fe-4f7d-a831-734229802784}`, so it was never available here. The
adjacent TikTok blocker uses its repo name only because that slug happened to be
free; do not treat matching the repo name as the convention.

AMO reports the collision late and bluntly. The slug lives in the same JSON body
as the version, so the first sign of it is a `400` from the `PUT` that creates
the add-on, after the package has already uploaded and validated:

```json
{ "slug": ["addon with this slug already exists."] }
```

That `PUT` creates the add-on and its first version together, so a slug
collision fails atomically and leaves nothing behind to clean up. Check
availability before a first submission rather than discovering it mid-release:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  https://addons.mozilla.org/api/v5/addons/addon/<slug>/
```

`404` means the slug is free. `200` means it is taken, and the response body
names the add-on holding it.

Changing the slug later breaks every published link to the listing, so it is
effectively permanent once the add-on is public. It is not the guid, though:
`browser_specific_settings.gecko.id` stays
`linkedin-feed-blocker@shbernal.github.io` regardless, and that is the value
that must never change.

## Store Listing Copy Is Shared

The long description is the only listing field both stores publish verbatim, so
there is one copy at `store/description.txt` and no per-store duplicate. It is
plain text with `-` bullets, which is the format both stores render acceptably:
AMO accepts a limited set of HTML tags in this field and the Chrome Web Store
does not, so the shared file stays at that lowest common denominator. Wanting
markup on the AMO side is the one thing that would justify splitting the file
again.

Because it is shared, it must also be store-neutral. Naming Chrome in the copy —
as "Chrome extension storage" did until the Gecko target landed — puts the wrong
browser in front of every Firefox user.

The two stores consume it at different speeds. AMO is automatic: the release job
reapplies it. Chrome is a manual dashboard paste, so a copy edit is live on AMO
at the next release while Chrome still shows the old text until someone pastes
it. Edits to this file are effectively queued AMO changes; do not park draft
copy there.

## Listing Metadata Is Applied Through The API

The listing is set from this repository, not from the AMO developer dashboard,
so it stays reviewable in version control. `scripts/publish-amo.mjs` sends
`amo/listing.json` with `description` filled in from `store/description.txt` on
every release, so a dashboard edit is overwritten by the next one. `name` comes
from the manifest.

The add-on record does not exist until the first version upload, which is why
the metadata travels with the submission rather than being applied ahead of it.

Field constraints worth knowing before editing:

- `summary` is capped at 250 characters and `name` at 50.
- `tags` and `categories` are closed vocabularies, not free text: AMO defines 42
  tags and 15 extension categories and rejects anything else. The live lists are
  `https://addons.mozilla.org/api/v5/addons/tags/` and `.../addons/categories/`,
  and `pnpm publish:amo --dry-run` checks the file against both. This listing
  uses the `social-communication` category and the `content blocker` and
  `social media` tags; `tags` is additionally capped at 10. There is no
  `linkedin` tag, and asking for one is how a release fails.
- Do not probe a tag with `GET /api/v5/addons/search/?tag=<tag>`. The write
  endpoint rejects a tag outside the vocabulary but search does not: it returns
  HTTP 200 and `count: 0` for a name that is not a tag at all, so a zero count
  means "not a tag" as often as it means "an unused tag".
- `categories` is a flat array in v5. The published API reference still shows it
  keyed by application; that shape is accepted only for backwards compatibility,
  and the Android categories behind it no longer exist.
- Localized fields are written as `{"en-US": "..."}`. They read back in a richer
  shape than they are written in, so do not round-trip a `GET` response into a
  `PATCH` body.
- `is_experimental` is `false`, matching how the extension is presented on the
  Chrome Web Store. The repository calling itself a prototype is an internal
  maturity note; flagging the add-on experimental on one store and not the other
  would tell the same users two different things about the same package.

## Listing Assets Are Repo-Driven Too

The listing icon and the screenshots are metadata on the add-on, not on a
version, and they do not come from the package. The manifest `icons` key drives
`about:addons`; the AMO page shows a placeholder until something uploads an icon
explicitly. Neither can ride along on the listing `PUT`, because AMO takes both
as multipart form-data only and refuses `icon` at add-on creation. Both are
applied after the version is created, which is also when the add-on record first
exists on a maiden submission.

`scripts/publish-amo.mjs` applies them:

| Asset    | Endpoint                               | When                        |
| -------- | -------------------------------------- | --------------------------- |
| Icon     | `PATCH /addons/addon/{guid}/` (`icon`) | every release               |
| Previews | `POST`/`DELETE .../previews/{id}/`     | only with `--sync-previews` |

Captions are a second call — see the throttle note below for why that is forced
rather than chosen.

Constraints, which the script checks locally so a bad file fails before anything
is uploaded: PNG or JPEG only, not animated, under 4MB. The icon must also be
square — AMO enforces that server-side. Previews have no minimum dimension; the
1000x750 in AMO's documentation is a resize target, not a rejection threshold.
The five 1280x800 screenshots are accepted as they are.

### Preview Writes Are Throttled Hard

Every call on the previews endpoint is an unsafe method, so all of them count
against AMO's add-on submission throttles: 3/minute, 10/hour and 24/day per
user. Reads are free. This listing has five screenshots, so a sync costs five
uploads, five caption patches and a delete per superseded image — over an hour's
budget on its own, and enough to trip the limit partway through.

The script waits out the `Retry-After` header and retries, so a sync works but
spends most of its wall-clock idle; it prints the call count up front so a slow
run is not mistaken for a hung one. A 429 is the only status it retries, since
every other failure means the request itself is wrong. Waits are not short:
crossing the hourly boundary has been observed on the TikTok listing to cost a
single wait of just under an hour.

It does not wait out all of them. Which bucket was hit changes the header by
four orders of magnitude, and the daily one answers with whatever is left of its
24 hours — that is not a wait, it is a different day. The TikTok listing lost
its 1.4.1 release to one: handed 52277 seconds, it slept, inside a GitHub job
that is cancelled at six hours. A whole runner spent, no version created, and
the reason visible only in a log line six hours above the failure.
`planThrottleRetry` in `scripts/amo-previews.mjs` caps a single wait at 70
minutes — clear of the hourly boundary, which is the longest wait that is still
a real one — and caps what one run may spend throttled at two hours, since waits
under the ceiling still add up past the job serving them. Five screenshots means
five throttled writes, so this listing is likelier to meet the second cap than
the first. Past either, the run fails at once and prints when the bucket
refills, so the answer is to re-run it after that.

The throttle is not specific to previews. `AddonViewSet` carries the same
classes, so the listing `PUT` and the icon `PATCH` draw on one shared budget — a
release already spends about four calls of the ten. **Do not run a preview sync
in the same hour as a release**: this listing's eleven calls plus those four
exceed the cap several times over, and the sync is what will stall. This is the
other reason `--assets-only` is a separate command rather than a flag on the
release path.

There is no way to raise the ceiling. `GranularUserRateThrottle` honors one
bypass, the `API_BYPASS_THROTTLING` permission, and that is a group membership
granted to Mozilla's own release-engineering and QA accounts — not something a
token, key, or scope can obtain. The throttle keys on the authenticated user
with independent per-IP limits on top, so re-minting credentials changes
nothing. The only lever is making fewer calls.

The two calls per image are not avoidable. `caption` is writable when a preview
is created, but `TranslationSerializerField` deserializes a dictionary only — a
bare string needs the `l10n_flat_input_output` gate — and multipart cannot carry
one, so the localized caption has to follow as JSON.

### Why Previews Are Opt-In

A sync replaces: it uploads every entry in `amo/previews.json` and deletes what
was published before. It cannot do less. AMO re-encodes images on ingest, so a
local file and its published copy never share a hash, and nothing on a preview
records which manifest entry produced it. Any attempt to reuse a published
preview would amount to assuming its bytes are still the ones on disk — and a
swapped screenshot that silently never uploads is the failure worth avoiding.

Replacing on every release would churn the public listing for description-only
changes, so `--sync-previews` is off by default. To keep that from going quiet,
every release without the flag prints how many previews the manifest holds
versus how many AMO has. Equal counts are reported as equal counts, not as a
match — the images themselves are not comparable from here.

Order in `amo/previews.json` is the display order. `position` is derived from the
index rather than written out, so reordering the file reorders the listing.
`tests/amo-previews.test.mjs` covers that logic and also fails if a file the
manifest names has been moved or deleted.

### Repairing A Live Listing

`pnpm publish:amo --assets-only` applies the icon, and with `--sync-previews` the
previews, to the add-on that already exists. It uploads no package and creates no
version, which is what makes it usable between releases. AMO accepts both while a
version sits in review, since they are add-on metadata rather than version
metadata.

## The Listing Icon Is Not Yet The One To Ship

`scripts/publish-amo.mjs` pushes `public/icons/icon128.png` to the listing on
every release. That artwork is still the pre-redesign icon, so the first AMO
submission must wait for the new one — otherwise the maiden release publishes the
current icon and the next one republishes over it, with an AMO review in between.

## Source Submission Is Mandatory

AMO requires the source of any add-on built by a bundler. Every version upload
must carry a source archive built with `pnpm package:source`, and a reviewer must
be able to rebuild the submitted package from it byte for byte. See
[Source Code Submission](../amo/source-submission.md) for the archive contents,
the reviewer instructions, and the recorded reproducibility result.

## Before Submitting A Version

1. Compare `manifest.config.ts` against `amo/data-collection.md`; every
   permission needs a current justification and no stale ones.
2. Confirm the `data_collection_permissions` answer still matches what the code
   does, including the `src/` search for network APIs it rests on.
3. Re-read `store/description.txt` against user-visible behavior changes in the
   release, remembering the same text is the Chrome listing copy.
4. Rebuild from a fresh extraction of the source archive and confirm the output
   matches the submitted package.
5. Run `pnpm publish:amo --dry-run`. It resolves the listing, prints the reviewer
   notes and previews, and validates the tags and categories against AMO.
   Metadata AMO rejects is only rejected on the call that creates the version,
   which happens after the release that triggered it is already published, so the
   dry run is the last cheap place to catch it.
