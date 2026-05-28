export const SETTINGS_STORAGE_KEY = 'extensionSettings'
export const LEGACY_ACTIVE_STORAGE_KEY = 'extensionActive'

export type ExtensionSettings = {
  active: boolean
  feed: boolean
  rightFeed: boolean
  networkPuzzle: boolean
  networkPeople: boolean
  networkLeftAd: boolean
}

export type PageSection =
  | 'feed'
  | 'rightFeed'
  | 'networkPuzzle'
  | 'networkPeople'
  | 'networkLeftAd'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  active: true,
  feed: true,
  rightFeed: true,
  networkPuzzle: true,
  networkPeople: true,
  networkLeftAd: true,
}

const PAGE_SECTIONS: PageSection[] = [
  'feed',
  'rightFeed',
  'networkPuzzle',
  'networkPeople',
  'networkLeftAd',
]

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readBoolean = (value: unknown, fallback: boolean) => {
  return typeof value === 'boolean' ? value : fallback
}

const hasPageSectionSettings = (value: Record<string, unknown>) => {
  return (
    PAGE_SECTIONS.some(section => typeof value[section] === 'boolean') ||
    typeof value.feedPuzzle === 'boolean'
  )
}

export const isAnyPageActive = (settings: ExtensionSettings) => {
  return PAGE_SECTIONS.some(section => settings[section])
}

export const isAllPagesActive = (settings: ExtensionSettings) => {
  return PAGE_SECTIONS.every(section => settings[section])
}

export const syncActiveWithPages = (
  settings: ExtensionSettings,
): ExtensionSettings => {
  return {
    ...settings,
    active: isAnyPageActive(settings),
  }
}

export const setAllPages = (
  settings: ExtensionSettings,
  enabled: boolean,
): ExtensionSettings => {
  return syncActiveWithPages({
    ...settings,
    feed: enabled,
    rightFeed: enabled,
    networkPuzzle: enabled,
    networkPeople: enabled,
  })
}

export const normalizeSettings = (
  value: unknown,
  fallback: ExtensionSettings = DEFAULT_SETTINGS,
): ExtensionSettings => {
  if (!isRecord(value)) {
    return syncActiveWithPages({ ...fallback })
  }

  const legacyActive = readBoolean(value.active, fallback.active)

  if (!hasPageSectionSettings(value)) {
    return syncActiveWithPages({
      ...fallback,
    active: legacyActive,
    feed: legacyActive ? fallback.feed : false,
    rightFeed: legacyActive ? fallback.rightFeed : false,
    networkPuzzle: legacyActive ? fallback.networkPuzzle : false,
    networkPeople: legacyActive ? fallback.networkPeople : false,
    networkLeftAd: legacyActive ? fallback.networkLeftAd : false,
  })
}

  return syncActiveWithPages({
    active: legacyActive,
    feed: readBoolean(value.feed, fallback.feed),
    rightFeed: readBoolean(
      value.rightFeed,
      readBoolean(value.feedPuzzle, fallback.rightFeed),
    ),
    networkPuzzle: readBoolean(value.networkPuzzle, fallback.networkPuzzle),
    networkPeople: readBoolean(value.networkPeople, fallback.networkPeople),
    networkLeftAd: readBoolean(
      value.networkLeftAd,
      readBoolean(value.networkPeople, fallback.networkLeftAd),
    ),
  })
}

export const deriveSettingsFromStorage = (
  settingsValue: unknown,
  legacyActiveValue: unknown,
): ExtensionSettings => {
  if (isRecord(settingsValue)) {
    return normalizeSettings(settingsValue)
  }

  const active = legacyActiveValue !== false
  return setAllPages(DEFAULT_SETTINGS, active)
}
