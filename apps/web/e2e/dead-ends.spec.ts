/**
 * Plan 5.4: "no access", "not found" and the error page offered only "Back to
 * Dashboard" — for someone the dashboard is closed to, a loop — and no way to
 * sign out of the wrong account. And when the permissions request failed, a
 * signed-in person was told they had no access.
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

test('dead ends offer the first page you may open and Sign out; a failed access check offers a retry', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `dead-${stamp}`,
      slug: `dead-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@dead.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });

  // The administrator on a page that does not exist: a way on, and Sign out.
  await page.goto('/no-such-page');
  await expect(page.getByTestId('dead-end-go')).toHaveText('Go to Dashboard');
  await expect(page.getByTestId('dead-end-sign-out')).toBeVisible();

  // Someone whose role closes the dashboard to them.
  const role = await admin.post('/roles', { data: { name: `No dashboard ${stamp}`, permissions: ['KPI_VIEW'] } });
  expect(role.status()).toBe(201);
  const roleId = ((await role.json()) as { id: string }).id;
  expect((await admin.patch(`/roles/${roleId}`, { data: { pageAccess: { deny: ['/dashboard'] } } })).ok()).toBe(true);
  const invited = (await (await admin.post('/users', { data: { email: `nd-${stamp}@dead.test.local`, fullName: 'Nia Nodash', roleId } })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const nia = await signInAs(browser, tokens);
  await nia.goto('/login'); // any page: primes the cached permissions and access profile the way a sign-in does
  await nia.evaluate(async (api) => {
    const res = await fetch(`${api}/auth/me`, { headers: { authorization: `Bearer ${window.localStorage.getItem('kpi-nexus.access-token')}` } });
    const body = (await res.json()) as { user: { permissions: string[] }; accessProfile?: unknown };
    window.localStorage.setItem('kpi-nexus.permissions', JSON.stringify(body.user.permissions));
    if (body.accessProfile) window.localStorage.setItem('kpi-nexus.access-profile', JSON.stringify(body.accessProfile));
  }, API_URL);

  // The dashboard is closed to her: "no access" offers a page she can open, not the dashboard again.
  await nia.goto('/dashboard');
  await expect(nia).toHaveURL(/\/unauthorized$/);
  const go = nia.getByTestId('dead-end-go');
  await expect(go).toHaveText('Go to My KPIs');
  await go.click();
  await expect(nia).toHaveURL(/\/my-kpis$/);

  // Sign out from a dead end leads to sign-in, and the session is gone.
  await nia.goto('/unauthorized');
  await nia.getByTestId('dead-end-sign-out').click();
  await expect(nia).toHaveURL(/\/login/);
  expect(await nia.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'))).toBeNull();
  await nia.goto('/unauthorized');
  await expect(nia.getByTestId('dead-end-sign-in')).toBeVisible();
  await nia.context().close();

  // The permissions request fails (server error): not "no access" — a retry, which then works.
  await page.evaluate(() => window.localStorage.removeItem('kpi-nexus.permissions'));
  await page.route('**/auth/me', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }));
  await page.goto('/roles');
  await expect(page.getByTestId('access-check-failed')).toBeVisible();
  await expect(page).toHaveURL(/\/roles$/);
  await page.unroute('**/auth/me');
  await page.getByTestId('access-check-retry').click();
  await expect(page.getByTestId('access-check-failed')).toHaveCount(0);
  await expect(page.getByTestId('role-row-Admin')).toBeVisible();
});
