const LINKEDIN_HOST_SUFFIX = '.linkedin.com'

export const isLinkedInUrl = (value: string | undefined) => {
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
