import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// In a Gecko action popup, `<input type="color">` and `<input type="file">`
// open a native dialog that takes focus away from the panel. The panel closes
// on focus loss, which destroys the popup document mid-interaction: the picker
// is left open over a page whose React tree no longer exists, and whatever the
// user chooses is delivered to nothing. Chrome keeps the popup alive, so this
// is invisible on the target every other check runs against.
const POPUP_ROOT = resolve(process.cwd(), 'src/popup')
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.html']
// Test files construct these inputs on purpose, to assert something about
// them. They never ship in the popup document.
const TEST_FILE = /\.test\.tsx?$/

const FORBIDDEN_TYPES = ['color', 'file']
const forbiddenPatterns = FORBIDDEN_TYPES.flatMap(type => [
  // type="color" and the JSX brace form type={'color'}
  new RegExp(`type\\s*=\\s*\\{?\\s*(["'\`])${type}\\1`, 'i'),
  // setAttribute('type', 'color'), for a popup that builds DOM by hand
  new RegExp(
    `setAttribute\\s*\\(\\s*(["'\`])type\\1\\s*,\\s*(["'\`])${type}\\2`,
    'i',
  ),
])

/**
 * The rule is the kind that gets written down next to the code it forbids, and
 * a comment naming `type="color"` to explain why it is banned would otherwise
 * fail the guard on the file documenting it. Block comments go first so a `//`
 * inside one cannot end the strip early; line comments spare `://` so a URL in
 * a string literal does not swallow the rest of its line.
 */
const stripComments = (source: string) => {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const collectPopupFiles = (directory: string): string[] => {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectPopupFiles(entryPath)
    }

    if (TEST_FILE.test(entry.name)) {
      return []
    }

    return SCANNED_EXTENSIONS.some(extension => entry.name.endsWith(extension))
      ? [entryPath]
      : []
  })
}

describe('the popup', () => {
  it('declares no input that opens a native dialog', () => {
    const popupFiles = collectPopupFiles(POPUP_ROOT)
    const offenders = popupFiles
      .filter(file => {
        const source = stripComments(readFileSync(file, 'utf8'))

        return forbiddenPatterns.some(pattern => pattern.test(source))
      })
      .map(file => relative(process.cwd(), file))

    // Without this the guard passes on a directory it failed to read.
    expect(popupFiles.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
