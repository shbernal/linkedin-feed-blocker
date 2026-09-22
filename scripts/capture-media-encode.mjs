// Turns the frames and stills from scripts/capture-media.mjs into the README
// GIF and the before/after composite. Run it through
// scripts/capture-media.sh, which caps memory and CPU for ffmpeg, gifski, and
// ImageMagick as well.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { printHelpAndExit } from './help.mjs'

const defaultOutDir = 'media-capture'

printHelpAndExit(`
Usage: pnpm media:encode [--help]

Reads frames.json and the stills written by pnpm media:capture and writes, in
the same directory:
  demo.gif          960px wide, 12fps, for the README
  before-after.png  unblocked and blocked Home side by side

Requires ffmpeg, gifski, ImageMagick 7, and fontconfig.

Environment
  MEDIA_CAPTURE_DIR  capture directory, relative to the repo root
                     (default: ${defaultOutDir})

See docs/media-capture.md.
`)

const dir = path.resolve(
  process.cwd(),
  process.env.MEDIA_CAPTURE_DIR ?? defaultOutDir,
)
const run = (command, args) =>
  execFileSync(command, args, { cwd: dir, stdio: 'inherit' })
const read = (command, args) =>
  execFileSync(command, args, { cwd: dir, encoding: 'utf8' }).trim()
const magick = args =>
  run('magick', [
    '-limit',
    'memory',
    '512MiB',
    '-limit',
    'thread',
    '2',
    ...args,
  ])

const framesFile = path.join(dir, 'frames.json')
if (!fs.existsSync(framesFile)) {
  throw new Error(`Missing ${framesFile}. Run pnpm media:capture first.`)
}

const kept = JSON.parse(fs.readFileSync(framesFile, 'utf8'))

const concat = kept.flatMap(frame => [
  `file '${frame.file}'`,
  `duration ${frame.duration.toFixed(3)}`,
])
// The concat demuxer ignores the last duration unless the file repeats.
concat.push(`file '${kept.at(-1).file}'`)
fs.writeFileSync(path.join(dir, 'frames.txt'), `${concat.join('\n')}\n`)

const concatInput = ['-f', 'concat', '-safe', '0', '-i', 'frames.txt']
const ffmpeg = args =>
  run('ffmpeg', ['-loglevel', 'error', '-y', '-threads', '2', ...args])

fs.rmSync(path.join(dir, 'gif'), { recursive: true, force: true })
fs.mkdirSync(path.join(dir, 'gif'))
ffmpeg([
  ...concatInput,
  '-vf',
  'fps=12,scale=960:-1:flags=lanczos',
  'gif/%05d.png',
])
const gifFrames = fs
  .readdirSync(path.join(dir, 'gif'))
  .sort()
  .map(file => `gif/${file}`)
run('gifski', [
  '--quiet',
  '--fps',
  '12',
  '--width',
  '960',
  '--quality',
  '80',
  '-o',
  'demo.gif',
  ...gifFrames,
])

// Falls back to fontconfig's closest bold sans where Noto is not installed.
const font = read('fc-match', ['-f', '%{file}', 'Noto Sans:bold'])
for (const state of ['unblocked', 'blocked']) {
  magick([
    `feed-${state}.png`,
    '-resize',
    '1200x750',
    '-gravity',
    'north',
    '-background',
    '#f4f2ee',
    '-extent',
    '1200x750',
    // The panels are LinkedIn's own background colour, so without an edge
    // they dissolve into the composite's.
    '-bordercolor',
    '#d6d3cd',
    '-border',
    '1',
    `before-after-${state}.png`,
  ])
}
magick([
  '-size',
  '2448x900',
  'xc:#f4f2ee',
  'before-after-unblocked.png',
  '-geometry',
  '+16+120',
  '-composite',
  'before-after-blocked.png',
  '-geometry',
  '+1232+120',
  '-composite',
  '-font',
  font,
  '-pointsize',
  '44',
  '-gravity',
  'northwest',
  '-fill',
  '#666666',
  '-annotate',
  '+40+40',
  'LinkedIn as it ships',
  '-fill',
  '#0a66c2',
  '-annotate',
  '+1256+40',
  'With LinkedIn Feed Blocker',
  '-resize',
  '1600x',
  'before-after.png',
])

for (const file of ['demo.gif', 'before-after.png']) {
  const { size } = fs.statSync(path.join(dir, file))
  console.log(`${file} ${(size / 1024).toFixed(0)}K`)
}
