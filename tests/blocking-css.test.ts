import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBlockingCss } from '../src/content/blockingStyles'

// `src/content/blocking.css` is checked in because the manifest declares it and
// the browser injects it at document_start, but it is generated from the same
// selector table the JavaScript path reads. This guard is the only thing making
// the checked-in copy trustworthy: without it the CSS and the JS could disagree
// about what a section targets and nothing would say so.
//
// Regenerate with UPDATE_BLOCKING_CSS=1 pnpm test.
const CSS_PATH = resolve(process.cwd(), 'src/content/blocking.css')

describe('src/content/blocking.css', () => {
  it('is what src/content/blockingStyles.ts generates', () => {
    const generated = buildBlockingCss()

    if (process.env.UPDATE_BLOCKING_CSS === '1') {
      writeFileSync(CSS_PATH, generated)
    }

    expect(readFileSync(CSS_PATH, 'utf8')).toBe(generated)
  })
})
