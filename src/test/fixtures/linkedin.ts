// LinkedIn-shaped markup shared by the jsdom unit tests and the Playwright
// fixture routes, so both layers exercise the same DOM.
//
// A fixture is only worth what it resembles. Every attribute the selectors in
// `src/content/selectors.ts` key on is copied from real LinkedIn pages, not
// written to fit
// the selector. Ids and comments are the only additions; they exist so tests
// have something stable to assert on and nothing targets them. When a selector
// changes, re-copy the real element rather than adjusting the markup here
// until it matches.

// A 1x1 transparent GIF, so the fixture never reaches the network for an image.
const TRANSPARENT_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** `/feed/`: the main feed column plus the right rail. */
export const FEED_BODY = `
<div class="scaffold-layout__inner">
  <main class="scaffold-layout__main" aria-label="Main Feed">
    <div
      id="main-feed"
      data-testid="mainFeed"
      data-component-type="LazyColumn"
      role="list"
      componentkey="container-update-list_mainFeed-lazy-container"
    >
      <div role="listitem">Someone you barely know is hiring.</div>
      <div role="listitem">Someone else agrees.</div>
    </div>
  </main>
  <aside class="scaffold-layout__aside" aria-label="LinkedIn News">
    <!-- The games promo sits three levels above its link; the right-rail
         selector walks that exact chain. -->
    <div id="right-rail-games">
      <div>
        <div>
          <a href="/games/">Today's puzzles</a>
        </div>
      </div>
    </div>
    <div id="right-rail-discover">
      <div>
        <a href="/mynetwork/discover-hub/">Discover more</a>
      </div>
    </div>
    <div id="right-rail-ad">
      <img
        id="right-rail-ad-image"
        alt="Advertise on LinkedIn"
        src="${TRANSPARENT_GIF}"
      />
    </div>
    <iframe
      id="right-rail-ad-frame"
      componentkey="MainFeedDesktopNav_feed_ad"
      title="Advertisement"
    ></iframe>
  </aside>
</div>
`

/**
 * `/mynetwork/grow/`: the invitation preview with sections on both sides of
 * it. The section before the preview is what proves the suggestion rule is an
 * ordering check and not "every auto-component section".
 */
export const NETWORK_GROW_BODY = `
<main class="scaffold-layout__main">
  <section aria-label="Primary content">
    <section id="network-before-invitations" componentkey="auto-component-0">
      <h2>Grow your network</h2>
      <p>Find people you know.</p>
    </section>
    <section id="network-invitations" componentkey="pending-invitations-preview">
      <h2>Invitations</h2>
      <div role="listitem">
        <span>Ada Lovelace</span>
        <button type="button">Accept</button>
      </div>
    </section>
    <section id="network-puzzle" componentkey="auto-component-1">
      <h2>Games</h2>
      <p>A new daily puzzle from LinkedIn. Your move.</p>
      <a href="/games/queens/">Solve now</a>
    </section>
    <section id="network-premium" componentkey="auto-component-2">
      <h2>Try Premium</h2>
      <p>Premium members get more profile views.</p>
      <a href="/premium/products/">Try Premium for free</a>
    </section>
    <section id="network-people" componentkey="auto-component-3">
      <h2>People you may know</h2>
      <div role="listitem"><span>Grace Hopper</span></div>
    </section>
    <section id="network-pages" componentkey="auto-component-4">
      <h2>Pages you may be interested in</h2>
      <div role="listitem"><span>A company</span></div>
    </section>
  </section>
</main>
`

/**
 * `/jobs/`: an unsupported route. It deliberately carries right-rail markup the
 * feed selectors would match, so a route-gating regression fails here instead
 * of on a real page.
 */
export const JOBS_BODY = `
<div class="scaffold-layout__inner">
  <main class="scaffold-layout__main">
    <h1>Jobs</h1>
    <div role="list"><div role="listitem">A job</div></div>
  </main>
  <aside class="scaffold-layout__aside">
    <div id="right-rail-games">
      <div>
        <div>
          <a href="/games/">Today's puzzles</a>
        </div>
      </div>
    </div>
    <div id="right-rail-ad">
      <img
        id="right-rail-ad-image"
        alt="Advertise on LinkedIn"
        src="${TRANSPARENT_GIF}"
      />
    </div>
  </aside>
</div>
`

export const getFixtureBody = (pathname: string) => {
  if (pathname.startsWith('/mynetwork/grow')) {
    return NETWORK_GROW_BODY
  }

  if (pathname.startsWith('/jobs')) {
    return JOBS_BODY
  }

  return FEED_BODY
}

const PAGE_STYLES = `
  body {
    margin: 0;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }

  .scaffold-layout__inner {
    display: flex;
    gap: 24px;
    padding: 24px;
  }

  main,
  aside,
  section {
    min-height: 120px;
  }
`

// A test probe rather than page markup. It runs while the document is parsing,
// which is before the content script's `document_end` entry and therefore
// before any of the extension's JavaScript. Reading computed styles here is
// the only way to prove the document_start stylesheet hid something ahead of
// the first paint rather than shortly after it. Nothing in `src/` sees it.
const PARSE_TIME_PROBE = `
  window.__ltfbParseTime = Object.fromEntries(
    ['#main-feed', '#right-rail-ad-image'].map(selector => {
      const element = document.querySelector(selector)
      if (!element) {
        return [selector, null]
      }
      const styles = getComputedStyle(element)
      return [
        selector,
        {
          visibility: styles.visibility,
          contentVisibility: styles.contentVisibility,
          height: Math.round(element.getBoundingClientRect().height),
        },
      ]
    }),
  )
`

export const renderFixturePage = (pathname: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>LinkedIn Fixture ${pathname}</title>
    <style>${PAGE_STYLES}</style>
  </head>
  <body>
    ${getFixtureBody(pathname)}
    <script>${PARSE_TIME_PROBE}</script>
  </body>
</html>`
