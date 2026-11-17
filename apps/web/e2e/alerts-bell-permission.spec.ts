/**
 * The top bar's alerts bell asked `GET /alerts/unread-count` for every
 * signed-in person, on every page and again every 30 seconds. For anyone
 * without ALERTS_VIEW each of those was refused.
 */
import { type Browser, type Page, expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

async function signInAs(browser: Browser, tokens: { accessToken: string; refreshToken: string }): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );
  return page;
}

test('the alerts bell is for people who can read alerts; nobody else is refused on every page', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `bell-${stamp}`,
      slug: `bell-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@bell.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });

  // Someone who can read alerts has the bell.
  await page.goto('/kpis');
  await expect(page.getByTestId('alerts-bell')).toBeVisible();

  // Someone who cannot: no bell, and nothing refused while they move around.
  const role = await admin.post('/roles', { data: { name: `No alerts ${stamp}`, permissions: ['KPI_VIEW'] } });
  expect(role.status()).toBe(201);
  const invited = (await (await admin.post('/users', {
    data: { email: `nel-${stamp}@bell.test.local`, fullName: 'Nel Noalerts', roleId: ((await role.json()) as { id: string }).id },
  })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const nel = await signInAs(browser, tokens);
  const refused: string[] = [];
  nel.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  for (const path of ['/kpis', '/my-kpis', '/tasks']) {
    await nel.goto(path);
    await expect(nel.getByTestId('mentions-bell'), `${path} has the top bar`).toBeVisible();
    await expect(nel.getByTestId('alerts-bell'), `${path} has no alerts bell`).toHaveCount(0);
  }
  expect(refused.filter((call) => call.includes('/alerts'))).toEqual([]);
  await nel.context().close();
});
