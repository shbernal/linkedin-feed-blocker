# Icon explorations

This file keeps the icon directions the project looked at and did not ship, so a
later round starts from what was already learned instead of rediscovering it.
Only the shipped mark lives in `store/logo.svg`; everything here is history.

The sketches in `icon-explorations/` are reference images, not build inputs.
Nothing in the build, the icon pipeline, or either store listing reads them.
`scripts/generate-icons.mjs` still renders every shipped asset from
`store/logo.svg` and the promo tile alone, so `pnpm icons --check` continues to
govern only the mark that ships.

## Round 1, August 2026

Ran after the mark moved to LinkedIn's brand blue, to test whether something
more distinctive than a prohibition ring could carry the icon. Five concepts,
judged against the shipped mark at listing size, 48px, and true 16px.

| #   | Concept                                      | Sketch                                                                         | Verdict                                             |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1   | Necktie behind a prohibition ring            | [1-necktie-prohibition.png](./icon-explorations/1-necktie-prohibition.png)     | Rejected. Ring survives 16px, tie does not          |
| 2   | Suited figure covering its eyes, see-no-evil | [2-see-no-evil-suit.png](./icon-explorations/2-see-no-evil-suit.png)           | Rejected for 16px; strongest at listing size        |
| 3   | Suited figure seated in a lotus pose         | [3-seated-lotus-sketch.png](./icon-explorations/3-seated-lotus-sketch.png)     | **Shipped**, after a vector redraw                  |
| 4   | Megaphone behind a prohibition ring          | [4-megaphone-prohibition.png](./icon-explorations/4-megaphone-prohibition.png) | Rejected. Best ring of the four, unreadable subject |
| 5   | Feed cards reread as a closing window blind  | [5-closing-blind.png](./icon-explorations/5-closing-blind.png)                 | Runner-up. Most legible at 16px of all six          |

### What the round established

The finding worth keeping: **every concept built on a prohibition ring collapsed
to the same red-ring-on-blue smudge at 16px.** Concepts 1 and 4 were
indistinguishable from each other and from the mark they were meant to replace.
If the ring is what reads, the subject inside it is detail paid for at listing
size and lost at favicon size. That is the argument that retired the ring.

Concept 5 was the most legible of all six at 16px, because three fat horizontal
bars are the most robust shape at that size and nothing had to survive inside a
ring. It lost on meaning rather than legibility: with no slash it reads as
_quieted_ rather than _blocked_. It remains the strongest fallback if the seated
figure ever proves too soft, and it is a continuous evolution of the card motif
rather than a reset.

Concepts 2 and 3 both failed the first 16px test as sketched, a white blob and a
pale pyramid. Concept 3 was chosen anyway and the failure fixed in the vector
redraw rather than accepted: see `store/logo.svg` for the geometry and
[Artwork](../AGENTS.md#artwork) for the rules it now has to hold. Concept 2 has
no such fix available, because the gesture that makes it work is the first thing
a 16px grid destroys.

### Making concept 3 survive 16px

The sketch failed its own 16px test, so the redraw was not a trace. Six vector
passes, and what fixed it was not simplification:

The first three passes merged the arms and crossed legs into one smooth bell on
the theory that fewer shapes survive better. They read as a mountain, or a shirt
collar. The pose was gone at every size, including 1024. **Negative space, not
shape count, is what makes a figure read.** Restoring the tile-coloured gap
between each arm and the torso, and letting two knee circles break past the ends
of the leg bar, brought the pose back at 128 and 48 without hurting 16.

Three measurements then decided the geometry, all of them following from the
768-unit tile being 12 device pixels at 16px:

- the head needs ≥100 units of clearance from the shoulders, or antialiasing
  closes the neck and head and body fuse into one blob;
- the tie needs to be 64 units wide, exactly one device pixel, or it lands across
  two at partial alpha and reads as a pink smear;
- detail that cannot survive belongs in the tile colour, cut out of the figure,
  where it disappears cleanly instead of turning to gravel.

Two things were tried and dropped. A single centred dash for closed eyes reads as
a minus badge, so it became two dashes. A blue V at the ankles, meant to say
_crossed legs_, reads as a checkmark.

### Reproducing the sketches

The sketches are raster output from an image model, so they are illustrations of
a composition rather than artwork that could be shipped. They were generated
with the
Codex CLI, one image per invocation:

```
codex exec --skip-git-repo-check --sandbox workspace-write \
  -m gpt-5.6-sol -c model_reasoning_effort=high -C <outdir> \
  "Generate an image: <subject> <style> Save it as <outdir>/<name>.png and report the path."
```

Every subject was rendered against a shared style suffix, which is what kept the
set comparable:

> Flat vector app-icon illustration, no photorealism. Square canvas, a single
> rounded-square tile filling the frame with a 12 percent margin, tile fill solid
> LinkedIn blue hex 0A66C2, corner radius about 22 percent of the tile. One bold
> centred subject built from thick simple geometric shapes with generous negative
> space, drawn in near-white hex F1F5F9 with a single accent in red hex E5484D.
> Absolutely no text, no letters, no numbers, no words, no watermark, no
> signature. No gradients, no drop shadows, no 3D, no bevels, no outlines thinner
> than 4 percent of the tile width. The silhouette must stay readable when the
> whole image is shrunk to 16 by 16 pixels, so use at most three distinguishable
> elements.

The per-concept subjects are recorded in the sketch filenames and the table
above; regenerating is only worth doing to explore a new direction, since a
model will not reproduce these exact images.

### Comparison sheet

A side-by-side page was published as a Claude artifact during the round, showing
all six marks at 200px, 48px and true 16px on light and dark grounds, with a
pixel-grid overlay:

- <https://claude.ai/code/artifact/ccc678c8-92ed-4ee3-a80b-2e89dbfff20e>

That page is private to the repository owner and is not a durable dependency.
a contributor cannot open it. The committed sketches plus this file are the
public record, and the sheet is regenerable from them.
