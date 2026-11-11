import type { ExtensionSettings, PageSection } from '../shared/settings'
import { getCurrentActiveSections } from './routes'
import {
  ALL_SECTIONS,
  HIDDEN_ATTR_BY_SECTION,
  SECTION_TARGETS,
  type SectionTarget,
} from './selectors'

// Hiding is tracked with a per-section managed attribute so restore only ever
// touches elements this extension hid. An element LinkedIn itself set to
// `display: none` is skipped rather than adopted, which keeps the toggle from
// revealing things the page meant to keep hidden.
const hideElement = (element: HTMLElement, hiddenAttr: string) => {
  if (element.getAttribute(hiddenAttr) === 'true') {
    return
  }

  if (element.style.display === 'none') {
    return
  }

  element.style.display = 'none'
  element.setAttribute(hiddenAttr, 'true')
}

const hideTargets = (targets: readonly SectionTarget[], hiddenAttr: string) => {
  targets.forEach(target => {
    const selector = typeof target === 'string' ? target : target.selector

    document.querySelectorAll<HTMLElement>(selector).forEach(element => {
      if (typeof target !== 'string' && target.matches?.(element) === false) {
        return
      }

      hideElement(element, hiddenAttr)
    })
  })
}

const showSection = (section: PageSection) => {
  const hiddenAttr = HIDDEN_ATTR_BY_SECTION[section]

  document
    .querySelectorAll<HTMLElement>(`[${hiddenAttr}="true"]`)
    .forEach(element => {
      element.style.display = ''
      element.removeAttribute(hiddenAttr)
    })
}

const applySectionBlocking = (section: PageSection) => {
  hideTargets(SECTION_TARGETS[section], HIDDEN_ATTR_BY_SECTION[section])
}

export const clearAllBlocking = () => {
  ALL_SECTIONS.forEach(showSection)
}

export const applySettings = (settings: ExtensionSettings) => {
  const activeSections = new Set(getCurrentActiveSections())

  ALL_SECTIONS.forEach(section => {
    if (!activeSections.has(section) || !settings[section]) {
      showSection(section)
      return
    }

    applySectionBlocking(section)
  })
}
