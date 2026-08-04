#!/usr/bin/env node
// Gecko exposes `chrome.*` as callback-only and puts the promise-returning
// variants on `browser.*`. Awaiting a `chrome.*` call there yields `undefined`
// instead of a result, so the extension breaks silently on Firefox while every
// Chrome check stays green. Every call site has to stay callback-based.
//
// This runs as a plain Node script because the repo has no test runner yet.
// Once one lands it should move into it unchanged; the check is what proves the
// Gecko fix, so it must not be dropped in the move.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SOURCE_ROOT = resolve(process.cwd(), 'src')
const SOURCE_EXTENSIONS = ['.ts', '.tsx']
const AWAITED_CHROME_CALL = /await\s+chrome\./

const collectSourceFiles = directory => {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath)
    }

    return SOURCE_EXTENSIONS.some(extension => entry.name.endsWith(extension))
      ? [entryPath]
      : []
  })
}

const sourceFiles = collectSourceFiles(SOURCE_ROOT)

if (sourceFiles.length === 0) {
  console.error(`No source files found under ${SOURCE_ROOT}.`)
  process.exit(1)
}

const offenders = sourceFiles
  .filter(file => AWAITED_CHROME_CALL.test(readFileSync(file, 'utf8')))
  .map(file => relative(SOURCE_ROOT, file))

if (offenders.length > 0) {
  console.error('Awaited chrome.* calls found. Use the callback form instead:')
  offenders.forEach(file => console.error(`  src/${file}`))
  process.exit(1)
}

console.log(
  `Checked ${sourceFiles.length} source files: every chrome.* call site is callback-based.`,
)
