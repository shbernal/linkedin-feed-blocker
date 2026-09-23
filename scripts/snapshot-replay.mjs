// Serves the LinkedIn pages pnpm media:snapshot saved, and blurs everyone in
// them. Shared by the README demo capture and the store screenshot capture,
// because both publish their output: a blur selector that stops matching in one
// of them leaks a real name into an image on a store listing or a README, and a
// selector list maintained twice is a list that drifts.
import fs from 'node:fs'
import path from 'node:path'

export const FEED_URL = 'https://www.linkedin.com/feed/'
export const NETWORK_URL = 'https://www.linkedin.com/mynetwork/grow/'

export const defaultSnapshotDir = '.e2e/media-snapshot'

/**
 * Everything that identifies a person: the signed-in member's own card and
 * avatar, the authors and bodies of posts, and the people on My Network. These
 * images are published, and none of those people agreed to be in them.
 *
 * It also covers the member's own private analytics. Connection, group and page
 * counts are left legible: those are on the profile for anyone who visits it,
 * where profile views and post impressions are visible only to the account.
 */
export const BLUR_SELECTORS = [
  'header img',
  '#workspace img:not(#feedRightNavGamesComponentRef img)',
  // The member's own card and company page on the Home sidebar.
  'aside[aria-label="Sidebar"] a[href*="/in/"]',
  'aside[aria-label="Sidebar"] a[href*="/admin/"]',
  // The member's own analytics on the Home sidebar. Matched on destination
  // rather than on the surrounding classes, which are all generated.
  'a[href*="/me/profile-views/"]',
  'a[href*="/analytics/creator/content/"]',
  // Posts, and the composer with the member's avatar.
  '[data-testid="mainFeed"] [role="listitem"]',
  // "Add to your feed" people and companies.
  'aside[aria-label="Aside"] a[href*="/in/"]',
  'aside[aria-label="Aside"] a[href*="/company/"]',
  // My Network: invitations, the puzzle card that greets the member by name,
  // and "People who viewed your profile".
  '[componentkey^="urn:li:invitation:"]',
  'section[aria-label="Primary content"] a[href*="/games/"]',
  '[data-testid="carousel"]',
]

/**
 * Resolves the snapshot directory and fails if anything it needs is missing,
 * rather than letting a capture run against a half-saved snapshot and produce
 * images nobody looks at closely.
 */
export const resolveSnapshot = snapshotDirOverride => {
  const snapshotDir = path.resolve(
    process.cwd(),
    snapshotDirOverride ?? process.env.MEDIA_SNAPSHOT_DIR ?? defaultSnapshotDir,
  )

  const pages = {
    [FEED_URL]: path.join(snapshotDir, 'feed.html'),
    [NETWORK_URL]: path.join(snapshotDir, 'network.html'),
  }
  const harPath = path.join(snapshotDir, 'assets.har.zip')

  for (const file of [...Object.values(pages), harPath]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing ${file}. Run pnpm media:snapshot first.`)
    }
  }

  return { snapshotDir, pages, harPath }
}

/**
 * Runs in the page before the content script, and blurs personal content. It is
 * registered as its own init script so a caller that wants nothing else, such
 * as the store capture, does not also get the demo's cursor and caption.
 */
export const blurInit = blurSelectors => {
  const install = () => {
    if (document.getElementById('blur-style')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'blur-style'
    style.textContent = `
      ${blurSelectors.join(',\n')} { filter: blur(9px) !important; }
    `
    document.documentElement.appendChild(style)
  }

  if (document.documentElement) {
    install()
  }
  document.addEventListener('DOMContentLoaded', install)
}

/**
 * The last route registered is consulted first. A saved page answers its own
 * URL, the HAR answers what the visit fetched, and anything else is refused, so
 * a capture cannot reach LinkedIn even if a selector change sends it looking.
 */
export const installSnapshotRoutes = async (context, { pages, harPath }) => {
  await context.route(/^https?:/, route => route.abort())
  await context.routeFromHAR(harPath, { url: /^https?:/, notFound: 'fallback' })
  await context.route(/^https:\/\/www\.linkedin\.com\//, route => {
    const file = pages[route.request().url()]
    if (!file) {
      return route.fallback()
    }

    // pnpm media:snapshot drops the CSP meta tag; an older snapshot may have
    // it. The nav bar links to /mynetwork, which live LinkedIn redirects to
    // Grow. Linking to Grow directly keeps the redirect out of the HAR, which
    // may hold a stale answer for it.
    const body = fs
      .readFileSync(file, 'utf8')
      .replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi, '')
      .replaceAll(
        'href="https://www.linkedin.com/mynetwork"',
        `href="${NETWORK_URL}"`,
      )

    return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body,
    })
  })

  await context.addInitScript(blurInit, BLUR_SELECTORS)
}
