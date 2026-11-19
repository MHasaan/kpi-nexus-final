/**
 * Flow walk (a member's home page): the home page said "Pending approvals 1"
 * to everyone, whoever the request was waiting for — the Approvals page then
 * told most of them "0 waiting for you". The tile now counts what waits for
 * the reader; a request waiting for someone else is said to be in progress.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('the home page counts the approvals waiting for you, not everyone’s', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `haw-${stamp}`,
      slug: `haw-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@haw.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const invited = (await (await admin.post('/users', {
    data: { email: `eve-${stamp}@haw.test.local`, fullName: 'Eve Editor', roleId: roles.find((r) => r.name === 'Manager')!.id },
  })).json()) as { inviteToken: string };
  const eve = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const editor = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${eve.accessToken}` } });
  const kpi = (await (await admin.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE', targetValue: 3 } })).json()) as { id: string };

  // A new target needs an administrator's approval; the manager asks for one.
  await page.goto('/approvals');
  await page.getByTestId('workflow-KPI_TARGET-role-Admin').check();
  await page.getByTestId('workflow-active-KPI_TARGET').check();
  await expect(page.getByTestId('workflow-KPI_TARGET')).toContainText('On');
  expect((await editor.post(`/kpis/${kpi.id}/targets`, { data: { type: 'STATIC', value: 2.5 } })).status()).toBe(202);

  // The administrator, who can decide it: one is waiting for them.
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-approvals')).toHaveText(/Waiting for your approval\s*1/);
  await expect(page.getByTestId('stat-approvals-for-you')).toContainText('1');

  // The manager, who asked: nothing waits for her; her request is in progress.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const hers = await context.newPage();
  await hers.goto('/');
  await hers.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [eve.accessToken, eve.refreshToken] as const,
  );
  await hers.goto('/dashboard');
  await expect(hers.getByTestId('dashboard-approvals')).toHaveText(/Approvals in progress\s*1/);
  await expect(hers.getByTestId('stat-approvals-for-you')).toHaveCount(0);
  await expect(hers.getByRole('main')).not.toContainText('Pending approvals');
  await context.close();
});
