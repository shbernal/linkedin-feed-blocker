import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// `scripts/publish-amo.mjs` does not restate the reviewer build instructions:
// it lifts them out of `amo/source-submission.md` by finding a heading and
// taking the quoted block under it. That keeps what a reviewer is told and what
// the repository documents from drifting apart, at the price of a coupling
// between a string in a script and a heading in a doc that nothing else checks.
//
// It has already broken once. A docs pass restyled the heading to sentence
// case and the constant kept its title case, so `approvalNotes()` threw. The
// throw lands on the `PUT` that creates the version, which is after the package
// has been uploaded and validated and after the release that triggered it is
// already published — the release fails on a heading.
//
// Read as text rather than imported, because importing the publisher runs it.
const script = readFileSync(
  resolve(process.cwd(), 'scripts/publish-amo.mjs'),
  'utf8',
)
const doc = readFileSync(
  resolve(process.cwd(), 'amo/source-submission.md'),
  'utf8',
)

const heading = script.match(/const REVIEWER_SECTION = '([^']+)'/)?.[1]

describe('amo/source-submission.md', () => {
  it('carries the heading publish-amo.mjs looks for', () => {
    // A renamed constant fails here rather than passing vacuously below.
    expect(heading).toBeDefined()
    expect(doc).toContain(heading)
  })

  it('has a quoted block under that heading', () => {
    const section = doc.slice(doc.indexOf(heading) + heading.length)
    const quoted = section
      .split('\n## ')[0]
      .split('\n')
      .filter(line => line.startsWith('>'))

    expect(quoted).not.toEqual([])
  })
})
