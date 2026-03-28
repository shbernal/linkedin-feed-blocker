const TOGGLE_CURRENT_PAGE_COMMAND = 'toggle-current-page-block'
const LINKEDIN_HOST_SUFFIX = '.linkedin.com'

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

const isLinkedInUrl = (value: string | undefined) => {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return (
      url.hostname === 'linkedin.com' ||
      url.hostname.endsWith(LINKEDIN_HOST_SUFFIX)
    )
  } catch {
    return false
  }
}

chrome.commands.onCommand.addListener(async command => {
  if (command !== TOGGLE_CURRENT_PAGE_COMMAND) {
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined || !isLinkedInUrl(tab.url)) {
    return
  }

  const message: ToggleCurrentPageBlockMessage = {
    action: 'toggleCurrentPageBlock',
  }

  chrome.tabs.sendMessage(tab.id, message, () => {
    void chrome.runtime.lastError
  })
})
