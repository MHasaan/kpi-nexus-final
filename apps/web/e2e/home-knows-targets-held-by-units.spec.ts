/**
 * Manual QA (2026-11-19, F-003): a new organisation whose KPIs had targets but no values yet was told "No
 * targets set — set targets on your KPIs" on the home page. For a KPI held by several units or people the
 * summary gives no single target, only how many holders have one; the card did not count those. It does now.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('home: KPIs held by units with targets but no values yet read "No values yet", not "No targets set"', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `hold-${stamp}`,
      slug: `hold-${stamp}`,
      adminFullName: 'Hal Admin',
      adminEmail: `admin-${stamp}@hold.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const unit = async (name: string) => ((await (await api.post('/org-units', { data: { name: `${name} ${stamp}` } })).json()) as { id: string }).id;
  const units = [await unit('Cutting'), await unit('Stitching')];
  expect((await api.post('/kpis', { data: { name: `Deployments ${stamp}`, scope: 'PER_UNIT', orgUnitIds: units, targetValue: 20 } })).status()).toBe(201);

  await page.goto('/dashboard');
  const card = page.getByTestId('dashboard-attainment-bar');
  await expect(card).toContainText('No values yet');
  await expect(card).not.toContainText('No targets set');
});
