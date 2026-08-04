import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  deriveSettingsFromStorage,
  isAllPagesActive,
  isAnyPageActive,
  normalizeSettings,
  setAllPages,
  syncActiveWithPages,
  type ExtensionSettings,
} from './settings'

const allBlocked: ExtensionSettings = {
  active: true,
  feed: true,
  rightFeed: true,
  networkPuzzle: true,
  networkPremium: true,
  networkSuggestions: true,
}

const nothingBlocked: ExtensionSettings = {
  active: false,
  feed: false,
  rightFeed: false,
  networkPuzzle: false,
  networkPremium: false,
  networkSuggestions: false,
}

describe('defaults', () => {
  it('blocks every section out of the box', () => {
    expect(DEFAULT_SETTINGS).toEqual(allBlocked)
  })
})

describe('isAnyPageActive / isAllPagesActive', () => {
  it('ignores the derived active flag', () => {
    const oneSection = { ...nothingBlocked, active: true, feed: true }

    expect(isAnyPageActive(oneSection)).toBe(true)
    expect(isAllPagesActive(oneSection)).toBe(false)
  })

  it('reports all pages active only when every section is on', () => {
    expect(isAllPagesActive(allBlocked)).toBe(true)
    expect(isAnyPageActive({ ...allBlocked, active: false })).toBe(true)
    expect(isAnyPageActive(nothingBlocked)).toBe(false)
  })
})

describe('syncActiveWithPages', () => {
  it('derives active from the section flags rather than trusting it', () => {
    expect(syncActiveWithPages({ ...nothingBlocked, active: true })).toEqual(
      nothingBlocked,
    )
    expect(
      syncActiveWithPages({ ...nothingBlocked, networkPremium: true }),
    ).toEqual({
      ...nothingBlocked,
      active: true,
      networkPremium: true,
    })
  })
})

describe('setAllPages', () => {
  it('turns every section on and off together', () => {
    expect(setAllPages(nothingBlocked, true)).toEqual(allBlocked)
    expect(setAllPages(allBlocked, false)).toEqual(nothingBlocked)
  })
})

describe('normalizeSettings', () => {
  it('falls back to the defaults for a non-object value', () => {
    expect(normalizeSettings(undefined)).toEqual(allBlocked)
    expect(normalizeSettings('nope')).toEqual(allBlocked)
    expect(normalizeSettings(null)).toEqual(allBlocked)
  })

  it('honours an explicit fallback', () => {
    expect(normalizeSettings(undefined, nothingBlocked)).toEqual(nothingBlocked)
  })

  it('keeps recognised section flags and defaults the rest', () => {
    expect(normalizeSettings({ feed: false, networkPuzzle: false })).toEqual({
      ...allBlocked,
      feed: false,
      networkPuzzle: false,
    })
  })

  it('ignores non-boolean section values', () => {
    expect(normalizeSettings({ feed: 'no', rightFeed: false })).toEqual({
      ...allBlocked,
      rightFeed: false,
    })
  })

  // `feedPuzzle` was the original name for what is now `rightFeed`. Stored
  // settings written before the rename must keep the user's choice.
  it('migrates the legacy feedPuzzle key onto rightFeed', () => {
    expect(normalizeSettings({ feedPuzzle: false })).toEqual({
      ...allBlocked,
      rightFeed: false,
    })
  })

  it('prefers rightFeed over feedPuzzle when both are present', () => {
    expect(normalizeSettings({ rightFeed: true, feedPuzzle: false })).toEqual(
      allBlocked,
    )
  })

  // A settings object with no section keys at all predates per-section
  // toggles: the single `active` flag decided everything.
  it('expands a section-less object using its active flag', () => {
    expect(normalizeSettings({ active: false })).toEqual(nothingBlocked)
    expect(normalizeSettings({ active: true })).toEqual(allBlocked)
  })

  it('recomputes active from the sections it read', () => {
    expect(normalizeSettings({ ...allBlocked, active: false })).toEqual(
      allBlocked,
    )
    expect(
      normalizeSettings({
        active: true,
        feed: false,
        rightFeed: false,
        networkPuzzle: false,
        networkPremium: false,
        networkSuggestions: false,
      }),
    ).toEqual(nothingBlocked)
  })
})

describe('deriveSettingsFromStorage', () => {
  it('normalizes a stored settings object and ignores the legacy key', () => {
    expect(deriveSettingsFromStorage({ feed: false }, false)).toEqual({
      ...allBlocked,
      feed: false,
    })
  })

  // `extensionActive` is the pre-settings-object storage key. Only its
  // explicit `false` means "off"; a missing key is a fresh install.
  it('migrates the legacy extensionActive key', () => {
    expect(deriveSettingsFromStorage(undefined, false)).toEqual(nothingBlocked)
    expect(deriveSettingsFromStorage(undefined, true)).toEqual(allBlocked)
    expect(deriveSettingsFromStorage(undefined, undefined)).toEqual(allBlocked)
  })
})
