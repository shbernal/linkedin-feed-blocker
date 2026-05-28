import { useEffect, useState } from 'react'
import './App.css'
import {
  DEFAULT_SETTINGS,
  deriveSettingsFromStorage,
  isAllPagesActive,
  LEGACY_ACTIVE_STORAGE_KEY,
  type PageSection,
  setAllPages,
  syncActiveWithPages,
  type ExtensionSettings,
  SETTINGS_STORAGE_KEY,
} from '../shared/settings'

type UpdateSettingsMessage = {
  action: 'updateSettings'
  settings: ExtensionSettings
}

function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    chrome.storage.local.get(
      [SETTINGS_STORAGE_KEY, LEGACY_ACTIVE_STORAGE_KEY],
      result => {
        const initialSettings = deriveSettingsFromStorage(
          result[SETTINGS_STORAGE_KEY],
          result[LEGACY_ACTIVE_STORAGE_KEY],
        )
        setSettings(initialSettings)
        chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: initialSettings })
      },
    )

    const handleStorageChange: Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
        return
      }

      setSettings(currentSettings =>
        deriveSettingsFromStorage(
          changes[SETTINGS_STORAGE_KEY].newValue,
          currentSettings.active,
        ),
      )
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const persistAndNotify = async (nextSettings: ExtensionSettings) => {
    const syncedSettings = syncActiveWithPages(nextSettings)

    setSettings(syncedSettings)
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: syncedSettings })

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (tab?.id !== undefined) {
        const message: UpdateSettingsMessage = {
          action: 'updateSettings',
          settings: syncedSettings,
        }
        chrome.tabs.sendMessage(tab.id, message, () => {
          // Ignore expected errors (e.g., active tab has no injected content script).
          void chrome.runtime.lastError
        })
      }
    } catch (error) {
      console.debug('Could not send message to content script:', error)
    }
  }

  const toggleAllPages = () => {
    void persistAndNotify(setAllPages(settings, !isAllPagesActive(settings)))
  }

  const toggleSection = (section: PageSection) => {
    void persistAndNotify(
      syncActiveWithPages({
        ...settings,
        [section]: !settings[section],
      }),
    )
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h2>LinkedIn Feed Blocker</h2>
      </div>

      <div className="popup-content">
        <div className="switch-list">
          <label className="switch-row">
            <span className="switch-label switch-label-master">
              Block all sections
            </span>
            <span className="switch">
              <input
                type="checkbox"
                checked={isAllPagesActive(settings)}
                onChange={toggleAllPages}
              />
              <span className="slider"></span>
            </span>
          </label>

          <div className="section-group">
            <h3 className="section-title">Home</h3>

            <label className="switch-row switch-row-child">
              <span className="switch-label">Block feed</span>
              <span className="switch switch-small">
                <input
                  type="checkbox"
                  checked={settings.feed}
                  onChange={() => toggleSection('feed')}
                />
                <span className="slider"></span>
              </span>
            </label>

            <label className="switch-row switch-row-child">
              <span className="switch-label">Block right feed</span>
              <span className="switch switch-small">
                <input
                  type="checkbox"
                  checked={settings.rightFeed}
                  onChange={() => toggleSection('rightFeed')}
                />
                <span className="slider"></span>
              </span>
            </label>
          </div>

          <div className="section-group">
            <h3 className="section-title">My Network</h3>

            <label className="switch-row switch-row-child">
              <span className="switch-label">Block puzzle</span>
              <span className="switch switch-small">
                <input
                  type="checkbox"
                  checked={settings.networkPuzzle}
                  onChange={() => toggleSection('networkPuzzle')}
                />
                <span className="slider"></span>
              </span>
            </label>

            <label className="switch-row switch-row-child">
              <span className="switch-label">Block people sections</span>
              <span className="switch switch-small">
                <input
                  type="checkbox"
                  checked={settings.networkPeople}
                  onChange={() => toggleSection('networkPeople')}
                />
                <span className="slider"></span>
              </span>
            </label>

            <label className="switch-row switch-row-child">
              <span className="switch-label">Block Suggestions for you</span>
              <span className="switch switch-small">
                <input
                  type="checkbox"
                  checked={settings.networkSuggestions}
                  onChange={() => toggleSection('networkSuggestions')}
                />
                <span className="slider"></span>
              </span>
            </label>

            <label className="switch-row switch-row-child">
              <span className="switch-label">Block left ad</span>
              <span className="switch switch-small">
                <input
                  type="checkbox"
                  checked={settings.networkLeftAd}
                  onChange={() => toggleSection('networkLeftAd')}
                />
                <span className="slider"></span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
