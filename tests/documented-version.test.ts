import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// `README.md` and `docs/project-overview.md` each state the shipped version as
// a literal, because a reader arriving at either wants a number rather than a
// pointer to `package.json`. Nothing else propagates a version bump into them,
// so without this they drift one release at a time and the drift is only ever
// noticed by someone reading a stale claim.
//
// Every other version literal in the tree sits inside an example command or a
// tag-naming sentence and is deliberately not a claim about what shipped, which
// is why this guard names two files instead of walking the docs.
const DOCUMENTED_VERSION_FILES = ['README.md', 'docs/project-overview.md']
const VERSION_LITERAL = /\b\d+\.\d+\.\d+\b/g

const packageVersion = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
).version as string

describe.each(DOCUMENTED_VERSION_FILES)('%s', file => {
  it('states the version in package.json', () => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    const found = [...new Set(source.match(VERSION_LITERAL) ?? [])]

    // Without this the guard passes on a file that stopped stating a version,
    // which is the same drift by another route.
    expect(found).not.toEqual([])
    expect(found).toEqual([packageVersion])
  })
})
