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

/**
 * The top bar LinkedIn serves on `/feed/` and most routes now: every class is
 * generated, so the only stable names in it are the icons' `svg` ids. The dot
 * is the empty `span` after the icon, captured here from a Home item that had
 * one. Notifications is shown without a badge, which is how an item with
 * nothing pending renders.
 */
export const TOP_BAR_BODY = `
<header>
  <div data-testid="primary-nav">
    <nav>
      <ul>
        <li>
          <button aria-label="Home, 1 new notification">
            <span>
              <svg id="home-medium" viewBox="0 0 24 24" width="24" height="24">
                <path d="M23 9v2h-2v7a3 3 0 0 1-3 3h-4v-6h-4v6H6a3 3 0 0 1-3-3v-7H1V9l11-7z"></path>
              </svg>
              <span id="top-bar-home-badge" data-color-scheme="light"></span>
            </span>
            <span><span>Home</span></span>
          </button>
        </li>
        <li>
          <a href="https://www.linkedin.com/messaging/" aria-label="Messaging, 0 new notifications">
            <span>
              <svg id="messages-medium" viewBox="0 0 24 24" width="24" height="24">
                <path d="M16 4H8a7 7 0 0 0 0 14h4v4l8.16-5.39A6.78 6.78 0 0 0 23 11a7 7 0 0 0-7-7"></path>
              </svg>
              <span id="top-bar-messaging-badge" data-color-scheme="light"></span>
            </span>
            <span><span>Messaging</span></span>
          </a>
        </li>
        <li>
          <a href="https://www.linkedin.com/notifications/" aria-label="Notifications, 0 new notifications">
            <span>
              <svg id="bell-fill-medium" viewBox="0 0 24 24" width="24" height="24">
                <path d="M22 19h-8.28a2 2 0 1 1-3.44 0H2v-1a4.52 4.52 0 0 1 1.17-2.83l1-1.17h15.7l1 1.17A4.42 4.42 0 0 1 22 18z"></path>
              </svg>
            </span>
            <span><span>Notifications</span></span>
          </a>
        </li>
      </ul>
    </nav>
    <div>
      <!-- React nests a second anchor with the same href inside this one, which
           the HTML parser cannot reproduce. Both carry the destination the
           selector reads, so the fixture keeps the outer one. -->
      <a
        id="top-bar-premium"
        tabindex="0"
        href="https://www.linkedin.com/premium/products/?upsellOrderOrigin=Tracking&upsellSlotId=NAV_SPOTLIGHT"
        >Claim 1 free month of Premium Page</a
      >
    </div>
  </div>
</header>
`

/**
 * The older Ember top bar, still served on `/notifications/` and elsewhere.
 * Here the badge is a sibling of the icon inside the link, and the link's
 * destination is what names the item.
 */
export const CLASSIC_TOP_BAR_BODY = `
<header id="global-nav" class="global-nav">
  <nav class="global-nav__nav" aria-label="Primary Navigation">
    <ul class="global-nav__primary-items">
      <li class="global-nav__primary-item">
        <a class="global-nav__primary-link" href="https://www.linkedin.com/feed/?nis=true&">
          <div class="global-nav__primary-link-notif artdeco-notification-badge">
            <span id="classic-top-bar-home-badge" class="notification-badge notification-badge--show">
              <span aria-hidden="true" class="notification-badge__no-count"></span>
              <span class="a11y-text">new feed updates notifications</span>
            </span>
            <div class="ivm-image-view-model global-nav__icon-ivm">
              <div class="ivm-view-attr__img-wrapper">
                <li-icon aria-hidden="true" type="home" size="large"></li-icon>
              </div>
            </div>
          </div>
          <span class="global-nav__primary-link-text">Home</span>
        </a>
      </li>
      <li class="global-nav__primary-item">
        <a class="global-nav__primary-link" href="https://www.linkedin.com/notifications/?filter=all&refresh=true">
          <div class="ivm-image-view-model global-nav__icon-ivm">
            <div class="ivm-view-attr__img-wrapper">
              <li-icon aria-hidden="true" type="bell-active" active="true" size="large"></li-icon>
            </div>
          </div>
          <span class="global-nav__primary-link-text" title="Notifications">Notifications</span>
        </a>
      </li>
    </ul>
  </nav>
  <div id="classic-top-bar-premium" class="premium-upsell-link">
    <a
      href="http://www.linkedin.com/premium/products/?upsellOrderOrigin=Tracking&upsellSlotId=NAV_SPOTLIGHT"
      class="link-without-visited-state global-nav__primary-link global-nav__primary-link--premium-upsell premium-upsell-link--truncate"
      data-view-name="premium-upsell-link"
    >
      <span class="global-nav__primary-link--two-line">
        <span class="global-nav__primary-link--no-icon">Claim 1 free month of Premium Page</span>
      </span>
    </a>
  </div>
</header>
`

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
 * `/jobs/view/<id>/`: a single job posting. The rail markup is the real
 * `aside` with LinkedIn's classes, avatars and tracking tokens removed.
 */
export const JOB_VIEW_BODY = `
<main id="job-details">
  <h1>Forward Deployed Engineer (AI Solutions)</h1>
  <p>Paris, Île-de-France, France</p>
</main>
<aside id="job-sidebar" aria-label="Aside">
  <div>
    <div>
      <section componentkey="auto-component-0b34672f-9a04-49bb-b91a-ff7f8d7e8642">
        <div>
          <div data-display-contents="true">
            <div componentkey="auto-component-5b4e0766-fc00-4e3a-acbb-190b6bd46505">
              <div>
                <p>Job search smarter with Premium</p>
                <p>Premium members are up to 2.6x more likely to get hired.</p>
                <a
                  aria-disabled="false"
                  href="https://www.linkedin.com/premium/redeem/?upsellOrderOrigin=Tracking%3Av1%3Ajob_right_rail_upsell_winback%3AJob+Seeker%3AIn-Product"
                >
                  <span><span>Get 50% Off Sales Nav</span></span>
                </a>
                <p>Cancel anytime. No hidden fees.</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss Job search smarter with Premium"
              ></button>
            </div>
          </div>
        </div>
      </section>
      <div>
        <p>Looking for talent?</p>
        <a
          aria-disabled="false"
          href="https://www.linkedin.com/talent/job-posting-redirect/?trk=flagship3_job_detail"
          target="_blank"
        >
          <span><span>Post a job</span></span>
        </a>
      </div>
    </div>
  </div>
</aside>
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

// The top bar is on every page, so every fixture route carries one. `/jobs`
// carries the older bar: it is the route with no page sections, so it is where
// a top bar that only works on a claimed route would show up.
const getFixtureTopBar = (pathname: string) => {
  return pathname.startsWith('/jobs') && !pathname.startsWith('/jobs/view/')
    ? CLASSIC_TOP_BAR_BODY
    : TOP_BAR_BODY
}

const getFixturePageBody = (pathname: string) => {
  if (pathname.startsWith('/mynetwork/grow')) {
    return NETWORK_GROW_BODY
  }

  if (pathname.startsWith('/jobs/view/')) {
    return JOB_VIEW_BODY
  }

  if (pathname.startsWith('/jobs')) {
    return JOBS_BODY
  }

  return FEED_BODY
}

export const getFixtureBody = (pathname: string) => {
  return `${getFixtureTopBar(pathname)}${getFixturePageBody(pathname)}`
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

  /* The real dot is a 16px box painted by a generated class. Giving the
     fixture's one a size is what makes "is it visible" a question with an
     answer, for an element whose markup is empty. */
  header span[data-color-scheme] {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 8px;
    background: #cb112d;
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
