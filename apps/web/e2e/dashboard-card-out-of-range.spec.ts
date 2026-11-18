/**
 * Flow walk, 2026-11-18. A dashboard card said "No data" for a KPI that has
 * a value — one whose period is outside the board's date range. A reader took
 * it to mean nothing was ever recorded. The card now says the range holds no
 * value, and the target is written the organisation's way.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('dashboard card: a KPI whose values are outside the range says so; the target is formatted', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `dco-${stamp}`,
      slug: `dco-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@dco.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', unit: 'USD', targetValue: 50000 } })).json()) as { id: string };
  // One value, for a period that ended more than a year ago.
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 41000, periodStart: '2024-01-01', periodEnd: '2024-01-31' } })).status()).toBe(201);
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const widget = (await (await api.post(`/dashboards/${dashboard.id}/widgets`, {
    data: { type: 'kpi_card', title: 'Revenue', config: { kpiId: kpi.id }, position: { x: 0, y: 0, w: 4, h: 3 } },
  })).json()) as { id: string };

  await page.goto(`/dashboards/${dashboard.id}`);
  const card = page.getByTestId(`widget-render-${widget.id}`);
  await expect(card).toContainText('No values in this date range');
  await expect(card).not.toContainText('No data');
  await expect(card).toContainText('Target: 50,000 USD');
});
