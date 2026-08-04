import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { installChromeMock } from './chrome'

beforeEach(() => {
  installChromeMock()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/feed/')
  vi.useRealTimers()
  vi.restoreAllMocks()
})
