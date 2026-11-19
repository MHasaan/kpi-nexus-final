/**
 * Flow walk (KPI page): the Thresholds tab said "Current band: no_bands" —
 * the stored reason, not words.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the Thresholds tab says in words why a KPI is in no band', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `bsw-${stamp}`,
      slug: `bsw-${stamp}`,
      adminFullName: 'Bo Admin',
      adminEmail: `admin-${stamp}@bsw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}?tab=thresholds`);
  const status = page.getByTestId('band-status');
  await expect(status).toHaveText('Current band: No bands set');

  // With a band and a value inside it, the band is named.
  expect((await api.post(`/kpis/${kpi.id}/threshold-bands`, { data: { name: 'good', lower: 0, color: '#16a34a', order: 0, consecutivePointsRequired: 1 } })).status()).toBe(201);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 42, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);
  await page.reload();
  await expect(status).toHaveText('Current band: good');
});
