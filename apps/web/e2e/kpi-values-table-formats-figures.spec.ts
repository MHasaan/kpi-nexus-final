/**
 * Flow walk (first use): on a KPI's Data tab a recorded 42000 read "42000",
 * while the Overview beside it read "42,000". The table, and a value's
 * correction history, now write figures the way the rest of the product does.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("a KPI's recorded values are written the way the organisation writes numbers", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kvt-${stamp}`,
      slug: `kvt-${stamp}`,
      adminFullName: 'Vera Admin',
      adminEmail: `admin-${stamp}@kvt.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Sales ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const point = (await (await api.post(`/kpis/${kpi.id}/data`, { data: { value: 42000, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).json()) as { id: string };
  expect((await api.patch(`/kpis/${kpi.id}/data/${point.id}`, { data: { value: 43500, reason: 'Late invoice counted' } })).status()).toBe(200);

  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(page.getByTestId('data-point-value').first()).toHaveText('43,500');
  await page.getByTestId('data-point-history').first().click();
  await expect(page.getByTestId('data-point-history-list')).toContainText('42,000 → 43,500');
});
