import type { ExtensionSettings, PageSection } from '../shared/settings'
import { getCurrentRouteSections } from './routes'
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

export const showSection = (section: PageSection) => {
  const hiddenAttr = HIDDEN_ATTR_BY_SECTION[section]

  document
    .querySelectorAll<HTMLElement>(`[${hiddenAttr}="true"]`)
    .forEach(element => {
      element.style.display = ''
      element.removeAttribute(hiddenAttr)
    })
}

export const applySectionBlocking = (section: PageSection) => {
  const targets = SECTION_TARGETS[section]
  if (targets.length === 0) {
    return
  }

  hideTargets(targets, HIDDEN_ATTR_BY_SECTION[section])
}

export const clearAllBlocking = () => {
  ALL_SECTIONS.forEach(showSection)
}

export const applySettings = (settings: ExtensionSettings) => {
  const routeSections = new Set(getCurrentRouteSections())

  ALL_SECTIONS.forEach(section => {
    if (!routeSections.has(section) || !settings[section]) {
      showSection(section)
      return
    }

    applySectionBlocking(section)
  })
}
