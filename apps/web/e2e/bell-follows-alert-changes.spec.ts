/**
 * Flow walk (alerts): after the only open alert was resolved, the bell in the
 * top bar went on showing "1" — it counted again only every thirty seconds.
 * It now counts again as soon as an alert is acknowledged or resolved.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the bell stops counting an alert as soon as it is resolved', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `bfa-${stamp}`,
      slug: `bfa-${stamp}`,
      adminFullName: 'Bea Admin',
      adminEmail: `admin-${stamp}@bfa.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Errors ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await api.post('/alert-rules', { data: { kpiId: kpi.id, name: `Any ${stamp}`, ruleType: 'STATIC_THRESHOLD', severity: 'HIGH', config: { operator: '>', value: 0 } } })).status()).toBe(201);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 7, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);

  await page.goto('/alerts');
  const count = page.getByTestId('alerts-bell-count');
  await expect(count).toHaveText('1');
  await page.locator('[data-testid^="alert-resolve-"]').first().click();
  // Well inside the thirty seconds the bell used to wait before counting again.
  await expect(count).toHaveCount(0, { timeout: 5_000 });
});
