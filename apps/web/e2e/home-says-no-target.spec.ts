/**
 * Flow walk (the invited person): on the home page a KPI with a value and no
 * target read "12,500 · No data", and was counted under "No data" in KPI
 * health. It has data; what it lacks is a target. The page now says so.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the home page calls a KPI with values and no target "No target", not "No data"', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `hnt-${stamp}`,
      slug: `hnt-${stamp}`,
      adminFullName: 'Hira Admin',
      adminEmail: `admin-${stamp}@hnt.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const today = new Date().toISOString().slice(0, 10);
  const measured = `Orders ${stamp}`;
  const empty = `Returns ${stamp}`;
  const kpi = (await (await api.post('/kpis', { data: { name: measured, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 480, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);
  expect((await api.post('/kpis', { data: { name: empty, scope: 'ORG_WIDE', targetValue: 10 } })).status()).toBe(201);

  await page.goto('/dashboard');
  // A value, no target.
  const row = page.getByTestId(`dashboard-card-${measured}`);
  await expect(row).toContainText('480');
  await expect(row).toContainText('No target');
  await expect(row).not.toContainText('No data');
  // A target, no value: that one is "No data".
  await expect(page.getByTestId(`dashboard-card-${empty}`)).toContainText('No data');

  // KPI health counts them apart.
  const health = page.getByTestId('kpi-health-legend');
  await expect(health.getByTestId('kpi-health-No data')).toHaveText('1');
  await expect(health.getByTestId('kpi-health-No target')).toHaveText('1');
});
