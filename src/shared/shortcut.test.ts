import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOGGLE_SHORTCUT,
  matchesShortcut,
  parseShortcut,
  resolveToggleShortcut,
} from './shortcut'

const noModifiers = {
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
}

const keydown = (init: KeyboardEventInit) => {
  return new KeyboardEvent('keydown', init)
}

describe('parseShortcut', () => {
  it('parses the default Chrome binding', () => {
    expect(parseShortcut('Ctrl+Shift+7')).toEqual({
      ...noModifiers,
      ctrlKey: true,
      shiftKey: true,
      code: 'Digit7',
    })
  })

  // Chrome reports the macOS binding as `Command+...`, which is the Meta key,
  // not Control. Treating it as Control would make the in-page fallback answer
  // a chord the browser never bound.
  it('maps Command to the Meta key on macOS bindings', () => {
    expect(parseShortcut('Command+Shift+7')).toEqual({
      ...noModifiers,
      shiftKey: true,
      metaKey: true,
      code: 'Digit7',
    })
  })

  it('maps MacCtrl to Control and Search to Meta', () => {
    expect(parseShortcut('MacCtrl+K')).toMatchObject({
      ctrlKey: true,
      metaKey: false,
      code: 'KeyK',
    })
    expect(parseShortcut('Search+Up')).toMatchObject({
      metaKey: true,
      code: 'ArrowUp',
    })
  })

  it('parses glyph-only macOS bindings', () => {
    expect(parseShortcut('⌘⇧7')).toEqual({
      ...noModifiers,
      shiftKey: true,
      metaKey: true,
      code: 'Digit7',
    })
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseShortcut('  alt + shift + p  ')).toEqual({
      ...noModifiers,
      altKey: true,
      shiftKey: true,
      code: 'KeyP',
    })
  })

  it('resolves letters, digits, function keys, and named keys', () => {
    expect(parseShortcut('F5')).toMatchObject({ code: 'F5' })
    expect(parseShortcut('F12')).toMatchObject({ code: 'F12' })
    expect(parseShortcut('Alt+Comma')).toMatchObject({ code: 'Comma' })
    expect(parseShortcut('Alt+PageDown')).toMatchObject({ code: 'PageDown' })
  })

  // A `null` here means "match nothing". Falling back to the default binding
  // would answer keys the browser did not bind, which is the exact divergence
  // this module exists to remove.
  it('returns null for anything it cannot map to a keydown', () => {
    expect(parseShortcut('')).toBeNull()
    expect(parseShortcut('   ')).toBeNull()
    expect(parseShortcut('Ctrl')).toBeNull()
    expect(parseShortcut('MediaPlayPause')).toBeNull()
    expect(parseShortcut('Ctrl+A+B')).toBeNull()
    expect(parseShortcut('F13')).toBeNull()
  })
})

describe('resolveToggleShortcut', () => {
  it('keeps the default binding live when the command is unbound', () => {
    const fallback = parseShortcut(DEFAULT_TOGGLE_SHORTCUT)

    expect(resolveToggleShortcut(undefined)).toEqual(fallback)
    expect(resolveToggleShortcut('')).toEqual(fallback)
    expect(resolveToggleShortcut('   ')).toEqual(fallback)
    expect(resolveToggleShortcut(42)).toEqual(fallback)
  })

  it('uses the mirrored binding when the user rebound the command', () => {
    expect(resolveToggleShortcut('Alt+Shift+P')).toEqual({
      ...noModifiers,
      altKey: true,
      shiftKey: true,
      code: 'KeyP',
    })
  })

  it('matches nothing when the mirrored binding is unusable', () => {
    expect(resolveToggleShortcut('MediaStop')).toBeNull()
  })
})

describe('matchesShortcut', () => {
  const shortcut = parseShortcut('Ctrl+Shift+7')

  it('matches the exact modifier set and key code', () => {
    expect(
      matchesShortcut(
        keydown({ code: 'Digit7', ctrlKey: true, shiftKey: true }),
        shortcut,
      ),
    ).toBe(true)
  })

  it('rejects extra or missing modifiers', () => {
    expect(
      matchesShortcut(keydown({ code: 'Digit7', ctrlKey: true }), shortcut),
    ).toBe(false)
    expect(
      matchesShortcut(
        keydown({
          code: 'Digit7',
          ctrlKey: true,
          shiftKey: true,
          altKey: true,
        }),
        shortcut,
      ),
    ).toBe(false)
  })

  it('rejects a different key', () => {
    expect(
      matchesShortcut(
        keydown({ code: 'Digit8', ctrlKey: true, shiftKey: true }),
        shortcut,
      ),
    ).toBe(false)
  })

  it('never matches when there is no parsed shortcut', () => {
    expect(
      matchesShortcut(
        keydown({ code: 'Digit7', ctrlKey: true, shiftKey: true }),
        null,
      ),
    ).toBe(false)
  })
})
