/**
 * Manual QA (2026-11-19, F-031): a line chart's y-axis wrote six-digit values in a space for five, so 240000
 * read "40000" and the labels were out of order; every point was labelled with its full date, one per point.
 * Axes now write short numbers (240k) in a space that fits them, and the dates thin out as needed. The
 * add-widget preview draws the same chart.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** "240k" → 240000, "1.25M" → 1250000. */
function compactToNumber(text: string): number {
  const m = /^(-?\d+(?:\.\d+)?)([kMB])?$/.exec(text.trim());
  if (!m) return Number.NaN;
  const scale = { k: 1e3, M: 1e6, B: 1e9 }[m[2] ?? ''] ?? 1;
  return Number(m[1]) * scale;
}

test('chart widgets: the y-axis reads 240k, not 40000, and the preview matches', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `axes-${stamp}`,
      slug: `axes-${stamp}`,
      adminFullName: 'Axel Admin',
      adminEmail: `admin-${stamp}@axes.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', targetValue: 250000 } })).json()) as { id: string };
  for (const [month, value] of [['08', 205000], ['09', 218000], ['10', 226000], ['11', 236500]] as const) {
    expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-28` } })).status()).toBe(201);
  }
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };

  await page.goto(`/dashboards/${dashboard.id}`);
  await page.getByTestId('dashboard-add-widget-toggle').click();
  await page.getByTestId('widget-type-line').click();
  await page.getByTestId('kpi-picker').getByText(`MRR ${stamp}`).click();

  // The preview draws the chart with short, whole labels.
  const previewTicks = page.getByTestId('widget-preview').locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value');
  // The preview is drawn inside a scrolled form, so count the ticks rather than ask whether one is on screen.
  await expect(previewTicks).not.toHaveCount(0);
  for (const text of await previewTicks.allTextContents()) {
    expect(text.trim(), `preview y label "${text}"`).toMatch(/^-?\d+(\.\d+)?[kMB]?$/);
  }

  await page.getByTestId('widget-editor-submit').click();
  await expect(page.getByTestId('widget-editor')).toBeHidden();

  const chart = page.locator('[data-testid^="widget-render-"]').first();
  const yTicks = chart.locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value');
  await expect(yTicks.first()).toBeVisible();
  const labels = (await yTicks.allTextContents()).map((t) => t.trim());
  for (const label of labels) expect(label, `y label "${label}"`).toMatch(/^-?\d+(\.\d+)?[kMB]?$/);
  const values = labels.map(compactToNumber);
  // The top of the axis covers the largest value, and the labels climb in order.
  expect(Math.max(...values)).toBeGreaterThanOrEqual(236500);
  expect(values).toEqual([...values].sort((a, b) => a - b));

  // The dates along the bottom are each shown once, at most one per point.
  const xLabels = (await chart.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').allTextContents()).map((t) => t.trim());
  expect(xLabels.length).toBeGreaterThan(0);
  expect(xLabels.length).toBeLessThanOrEqual(4);
  expect(new Set(xLabels).size).toBe(xLabels.length);
});
