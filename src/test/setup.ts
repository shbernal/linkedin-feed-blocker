import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { READY_ATTR } from '../content/blockingStyles'
import { installChromeMock } from './chrome'

beforeEach(() => {
  installChromeMock()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  // Lives on `<html>`, which `document.body.innerHTML` does not touch, so a
  // test that let the content script start would otherwise leave the gate
  // marked for the next one.
  document.documentElement.removeAttribute(READY_ATTR)
  window.history.replaceState({}, '', '/feed/')
  vi.useRealTimers()
  vi.restoreAllMocks()
})
