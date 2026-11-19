/**
 * Flow walk (dashboards): an opened snapshot read "kpi_card — Latest value:
 * 35000", "line — Latest value: 5.1": the widget's stored kind, a raw number,
 * and nothing on which KPI the value was of. A snapshot now freezes each
 * KPI's name and unit with its value, and reads "Revenue — 35,000 USD".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a snapshot says which KPI each frozen value is of, even after the KPI is renamed', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `snw-${stamp}`,
      slug: `snw-${stamp}`,
      adminFullName: 'Nia Admin',
      adminEmail: `admin-${stamp}@snw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', unit: 'USD' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 35000, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  for (const [widgetType, position] of [['kpi_card', { x: 0, y: 0, w: 3, h: 2 }], ['line', { x: 3, y: 0, w: 6, h: 4 }]] as const) {
    expect((await api.post(`/dashboards/${dashboard.id}/widgets`, { data: { widgetType, config: { kpiId: kpi.id }, position } })).status()).toBe(201);
  }
  const snapshot = (await (await api.post(`/dashboards/${dashboard.id}/snapshots`, { data: { label: 'January close' } })).json()) as { id: string };
  // Renamed afterwards: the snapshot keeps the name it was taken with.
  expect((await api.patch(`/kpis/${kpi.id}`, { data: { name: `Net revenue ${stamp}` } })).ok()).toBe(true);

  await page.goto(`/dashboards/${dashboard.id}/snapshots`);
  await page.getByTestId(`snapshot-view-${snapshot.id}`).click();
  const held = page.getByTestId(`snapshot-payload-${snapshot.id}`);
  const rows = held.getByTestId('snapshot-widget');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(`Revenue ${stamp}`);
  await expect(rows.nth(0)).toContainText('35,000 USD');
  await expect(rows.nth(0)).toContainText('KPI card');
  await expect(rows.nth(1)).toContainText('Line chart');
  await expect(held).not.toContainText('Net revenue');
  for (const stored of ['kpi_card', 'Latest value: 35000', 'payload']) {
    await expect(held).not.toContainText(stored);
  }
});
