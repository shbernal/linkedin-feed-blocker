// Opens the built Firefox extension in a real Gecko browser as a temporary
// add-on. AGENTS.md says to walk the manual checklist on Gecko before a
// release; this is the command that makes that a single step rather than
// about:debugging and a file picker.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { printHelpAndExit } from './help.mjs'
import { resolveGeckoBinary } from './browsers.mjs'

printHelpAndExit(`
Usage: pnpm dev:firefox [url] [--help]
       pnpm dev:zen [url] [--help]

Installs dist-firefox/ as a temporary add-on in a Gecko browser and leaves the
window open until you close it. The default URL is the LinkedIn feed.

The profile is thrown away and recreated on every launch, under
node_modules/.tmp/gecko-profiles/dev-<binary>, so it is not the persistent
signed-in profile pnpm validate:firefox uses. Sign in to LinkedIn in the window
if a check needs a session, or use pnpm validate:firefox for the automated pass.

Environment
  FIREFOX_BINARY  Gecko binary to launch. pnpm dev:firefox defaults to
                  /usr/bin/firefox and pnpm dev:zen to /usr/bin/zen-browser;
                  set this for any other fork

Note: both scripts build dist-firefox/ before this script runs, so run
node scripts/open-gecko.mjs --help to read this without building.

See docs/build-targets.md.
`)

const extensionPath = path.resolve(process.cwd(), 'dist-firefox')
const binary = resolveGeckoBinary()
const startUrl = process.argv[2] ?? 'https://www.linkedin.com/feed/'
// Namespaced by binary so Firefox and Zen never share one, and named apart from
// the validator's profiles so a launch cannot wipe a signed-in session.
const profileDir = path.resolve(
  process.cwd(),
  'node_modules',
  '.tmp',
  'gecko-profiles',
  `dev-${path.basename(binary)}`,
)

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build:firefox first.`,
  )
}

if (!fs.existsSync(binary)) {
  throw new Error(
    `No Gecko binary at ${binary}. Set FIREFOX_BINARY to the one to launch.`,
  )
}

// Removed, not emptied, and not recreated: `--profile-create-if-missing` makes
// the directory itself, and creating it here first only makes web-ext report it
// as already existing.
fs.rmSync(profileDir, { recursive: true, force: true })

console.log(`
Launching ${binary} with dist-firefox/ installed as a temporary add-on.

  Profile  ${path.relative(process.cwd(), profileDir)} (thrown away next launch)
  URL      ${startUrl}

Close the window to end the session.
`)

// web-ext owns the temporary-add-on install: it speaks the remote debugging
// protocol Gecko exposes for it, which is the only way to install an unsigned
// unpacked build without a user clicking through about:debugging.
const webExt = spawn(
  'pnpm',
  [
    'exec',
    'web-ext',
    'run',
    '--source-dir',
    extensionPath,
    '--firefox',
    binary,
    '--firefox-profile',
    profileDir,
    '--profile-create-if-missing',
    '--keep-profile-changes',
    '--start-url',
    startUrl,
    '--no-reload',
  ],
  { stdio: 'inherit' },
)

webExt.on('exit', code => {
  process.exitCode = code ?? 0
})
