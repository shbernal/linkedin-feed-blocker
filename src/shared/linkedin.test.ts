import { describe, expect, it } from 'vitest'
import { isLinkedInUrl } from './linkedin'

describe('isLinkedInUrl', () => {
  it('accepts linkedin.com and its subdomains', () => {
    expect(isLinkedInUrl('https://www.linkedin.com/feed/')).toBe(true)
    expect(isLinkedInUrl('https://linkedin.com/')).toBe(true)
    expect(isLinkedInUrl('https://fr.linkedin.com/jobs/')).toBe(true)
  })

  it('rejects hosts that merely end in the same letters', () => {
    expect(isLinkedInUrl('https://notlinkedin.com/feed/')).toBe(false)
    expect(isLinkedInUrl('https://linkedin.com.evil.test/')).toBe(false)
  })

  it('rejects missing or unparseable values', () => {
    expect(isLinkedInUrl(undefined)).toBe(false)
    expect(isLinkedInUrl('')).toBe(false)
    expect(isLinkedInUrl('chrome://extensions')).toBe(false)
    expect(isLinkedInUrl('not a url')).toBe(false)
  })
})
