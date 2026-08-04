import type { BrowserContext, Route } from '@playwright/test'
import { renderFixturePage } from '../../src/test/fixtures/linkedin'

// Serving the fixtures from real LinkedIn URLs is the point: the content
// script still sees `https://www.linkedin.com/...`, so the manifest match
// pattern and the route table are exercised without an account or a network.
const fulfillLinkedInRoute = async (route: Route) => {
  const { pathname } = new URL(route.request().url())

  await route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: renderFixturePage(pathname),
  })
}

export const installLinkedInFixtureRoutes = async (context: BrowserContext) => {
  await context.route('https://www.linkedin.com/**', fulfillLinkedInRoute)
}
