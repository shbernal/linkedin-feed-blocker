// Renders every raster listing asset from its tracked SVG source, so the icon
// set is regenerable rather than a pile of orphaned PNGs. Nothing in the build
// runs this: the PNGs it writes are committed, and both stores are handed the
// committed files. It exists so a change to the mark is one edit plus one
// command instead of six hand-exported images that drift apart.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { printHelpAndExit } from './help.mjs'

// rsvg-convert rather than a Node rasteriser: it is the one that renders these
// sources correctly at 16px, and keeping the dependency out of package.json
// keeps it out of the source archive AMO reviewers rebuild.
const RENDERER = 'rsvg-convert'

const MARK = 'store/logo.svg'
const PROMO = 'chrome-web-store/promo-tile-440x280.svg'

// The 128 icon carries its artwork at 96x96 with 16px of transparent padding,
// which is the Chrome Web Store's stricter rule; the source SVG is laid out at
// 8x that so every size below is a clean division.
const ASSETS = [
  { source: MARK, output: 'store/logo-source.png', width: 1024, height: 1024 },
  { source: MARK, output: 'public/icons/icon128.png', width: 128, height: 128 },
  { source: MARK, output: 'public/icons/icon48.png', width: 48, height: 48 },
  { source: MARK, output: 'public/icons/icon16.png', width: 16, height: 16 },
  {
    source: PROMO,
    output: 'chrome-web-store/promo-tile-440x280.png',
    width: 440,
    height: 280,
  },
]

printHelpAndExit(`
Usage: pnpm icons [--check] [--help]

Renders the extension icons, the 1024 logo source, and the Chrome Web Store
promo tile from their tracked SVG sources with ${RENDERER}.

Options
  --check     re-render to a temporary directory and report which committed
              PNGs would change, without writing any of them

Judge a new mark at 16px, not at 1024. That is the size the extensions page
favicon uses and where a mark with too much in it falls apart.

Replacing the promo tile means a manual Chrome Web Store dashboard paste and
puts the listing back through review. The AMO listing icon is the only one
pushed automatically, by pnpm publish:amo.

See docs/chrome-web-store.md and docs/amo-listing.md.
`)

const check = process.argv.slice(2).includes('--check')

try {
  execFileSync(RENDERER, ['--version'], { stdio: 'ignore' })
} catch {
  console.error(
    `error: ${RENDERER} not found; install librsvg to regenerate the assets`,
  )
  process.exit(1)
}

const root = process.cwd()
// Written next to the outputs rather than in /tmp so a --check run cannot cross
// a filesystem boundary, and removed on the way out either way.
const scratch = check
  ? fs.mkdtempSync(path.join(root, '.icons-check-'))
  : undefined

let changed = 0

try {
  for (const asset of ASSETS) {
    const destination = check
      ? path.join(scratch, path.basename(asset.output))
      : path.join(root, asset.output)

    fs.mkdirSync(path.dirname(destination), { recursive: true })
    execFileSync(RENDERER, [
      '-w',
      String(asset.width),
      '-h',
      String(asset.height),
      path.join(root, asset.source),
      '-o',
      destination,
    ])

    if (!check) {
      console.log(`${asset.output}  ${asset.width}x${asset.height}`)
      continue
    }

    const committed = path.join(root, asset.output)
    const stale =
      !fs.existsSync(committed) ||
      !fs.readFileSync(committed).equals(fs.readFileSync(destination))

    if (stale) {
      changed += 1
    }
    console.log(`${stale ? 'STALE' : 'ok   '} ${asset.output}`)
  }
} finally {
  if (scratch) {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

if (check && changed > 0) {
  console.error(
    `\n${changed} asset(s) differ from their source; run pnpm icons`,
  )
  process.exit(1)
}
