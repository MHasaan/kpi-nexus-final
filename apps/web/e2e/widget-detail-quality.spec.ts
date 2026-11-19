/**
 * Flow walk (dashboards): a widget's detail page counted values marked "GOOD"
 * as good — but a value's quality is HIGH, MEDIUM or LOW. So it always read
 * "0% · 0/5 good · Needs attention", and choosing "Good" in its quality
 * filter hid every value.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a widget’s detail page counts quality as the values carry it, and its filter keeps what it names', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `wdq-${stamp}`,
      slug: `wdq-${stamp}`,
      adminFullName: 'Quin Admin',
      adminEmail: `admin-${stamp}@wdq.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  // Three values recorded this month, as a person records them: each is of high quality.
  const now = new Date();
  const month = (back: number) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
  };
  for (const [back, value] of [[3, 2.1], [2, 2.6], [1, 3.4]] as const) {
    expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value, ...month(back) } })).status()).toBe(201);
  }
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const widget = (await (await api.post(`/dashboards/${dashboard.id}/widgets`, {
    data: { widgetType: 'line', config: { kpiId: kpi.id }, position: { x: 0, y: 0, w: 6, h: 4 } },
  })).json()) as { id: string };

  await page.goto(`/dashboards/${dashboard.id}/widgets/${widget.id}`);
  const summary = page.getByTestId('drilldown-quality-summary');
  await expect(summary).toContainText('3/3 high quality');
  await expect(summary).toContainText('100%');
  await expect(summary).toContainText('Healthy');
  await expect(summary).not.toContainText('Needs attention');

  // The filter offers the qualities a value can have, and keeps the ones it names.
  const filter = page.getByTestId('drilldown-quality');
  expect((await filter.locator('option').allTextContents()).map((t) => t.trim())).toEqual(['All', 'High', 'Medium', 'Low']);
  const rows = page.getByTestId('drilldown-rows').getByRole('row');
  await expect(rows).toHaveCount(3);
  await filter.selectOption({ label: 'High' });
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('High');
  await expect(page.getByTestId('drilldown-rows')).not.toContainText('HIGH');
  await filter.selectOption({ label: 'Low' });
  await expect(rows).toHaveCount(0);
});
