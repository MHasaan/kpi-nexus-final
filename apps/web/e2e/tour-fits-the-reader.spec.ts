/**
 * Flow walk (first use): the welcome tour was the same five slides for
 * everyone. A Viewer was told to "define metrics with formulas", and shown
 * slides about alerts and AI pages their menu does not have. The tour now
 * shows a person the slides for what they can open, in words that fit what
 * they can do there.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('the tour shows a Viewer only what a Viewer can open', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `tfr-${stamp}`,
      slug: `tfr-${stamp}`,
      adminFullName: 'Tahira Admin',
      adminEmail: `admin-${stamp}@tfr.test.local`,
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
    data: { email: `vera-${stamp}@tfr.test.local`, fullName: 'Vera Viewer', roleId: roles.find((r) => r.name === 'Viewer')!.id },
  })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };

  // The test set-up marks the tour as seen for every browser it opens: this one starts clean.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const view = await context.newPage();
  await view.goto('/');
  await view.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );
  await view.goto('/dashboard');
  const tour = view.getByTestId('onboarding-tour');
  await expect(tour).toBeVisible({ timeout: 15_000 });

  // Three slides, not five: welcome, KPIs, scorecard and tree.
  await expect(tour).toContainText('1 / 3');
  await view.getByTestId('tour-next').click();
  await expect(view.getByTestId('tour-title')).toHaveText('KPIs');
  await expect(tour).toContainText('Open a KPI');
  await expect(tour).not.toContainText('Define metrics');
  await expect(tour).not.toContainText('Record');
  await view.getByTestId('tour-next').click();
  await expect(view.getByTestId('tour-title')).toHaveText('Scorecard and tree');
  await expect(view.getByTestId('tour-done')).toBeVisible();
  await context.close();
});
