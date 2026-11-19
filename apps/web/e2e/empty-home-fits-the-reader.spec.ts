/**
 * Flow walk: a Viewer whose home page had no KPIs to show was told "Create
 * your first KPI to start tracking what matters" — something they cannot do.
 * Someone who cannot make KPIs is now told what will appear, and where from.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('an empty home page says what fits the reader', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ehr-${stamp}`,
      slug: `ehr-${stamp}`,
      adminFullName: 'Erum Admin',
      adminEmail: `admin-${stamp}@ehr.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  // The administrator, who can make KPIs, is asked to.
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-empty')).toContainText('Create your first KPI');

  // A Viewer is told what will appear instead, and offered no button they cannot use.
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const invited = (await (await admin.post('/users', {
    data: { email: `vera-${stamp}@ehr.test.local`, fullName: 'Vera Viewer', roleId: roles.find((r) => r.name === 'Viewer')!.id },
  })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };

  const context = await browser.newContext();
  const view = await context.newPage();
  await view.goto('/');
  await view.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
      window.localStorage.setItem('kpi-nexus.tour-completed', '1');
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );
  await view.goto('/dashboard');
  const empty = view.getByTestId('dashboard-empty');
  await expect(empty).toContainText('No KPIs to show yet');
  await expect(empty).toContainText('KPIs your organisation shares with you will appear here');
  await expect(empty).not.toContainText('Create your first KPI');
  await expect(view.getByTestId('dashboard-new-kpi')).toHaveCount(0);
  await context.close();
});
