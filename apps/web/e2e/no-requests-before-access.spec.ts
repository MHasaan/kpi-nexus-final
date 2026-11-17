/**
 * A guard around a page's markup hid the page from someone without access, but
 * the page's own load ran anyway — so the API was asked, and refused, before
 * the person was sent to "not allowed". Each page now waits until the person
 * is known to be allowed. Found by the page crawl (403s as a contributor).
 */
import { expect, request, test, type Browser } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.WEB_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery-staple';

async function signInAs(browser: Browser, tokens: { accessToken: string; refreshToken: string }) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: WEB_URL, localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const page = await context.newPage();
  await page.goto(`${WEB_URL}/`);
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );
  return { context, page };
}

test('a page someone may not open asks the API for nothing', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let admin: { accessToken: string };
  try {
    admin = await registerOrgViaApi(page, {
      orgName: `nra-${stamp}`,
      slug: `nra-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@nra.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${admin.accessToken}` } });
  const role = (await (await api.post('/roles', { data: { name: `Viewer ${stamp}`, permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'] } })).json()) as { id: string };
  const email = `viewer-${stamp}@nra.test.local`;
  const invited = (await (await api.post('/users', { data: { email, fullName: 'Vic Viewer', roleId: role.id } })).json()) as { inviteToken: string };
  const anon = await request.newContext({ baseURL: API_URL });
  const accepted = await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } });
  expect(accepted.ok()).toBeTruthy();
  const tokens = (await accepted.json()) as { accessToken: string; refreshToken: string };
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };

  const viewer = await signInAs(browser, tokens);
  const refused: string[] = [];
  viewer.page.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  const routes = [
    '/billing',
    `/dashboards/${dashboard.id}/share`,
    '/insights',
    '/recommendations',
    '/settings/access',
    '/settings/ai',
    '/settings/api-keys',
    '/settings/custom-domain',
    '/settings/webhooks',
    '/users',
    `/users/${me.user.id}`,
  ];
  for (const route of routes) {
    await viewer.page.goto(`${WEB_URL}${route}`);
    await viewer.page.waitForURL('**/unauthorized');
    await viewer.page.waitForLoadState('networkidle');
  }
  expect(refused).toEqual([]);
  await viewer.context.close();
});
