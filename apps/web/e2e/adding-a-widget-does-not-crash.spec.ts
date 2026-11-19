/**
 * Flow walk (dashboards): adding a widget to a dashboard that already had one
 * crashed the page ("Something went wrong") and left the new widget saved one
 * cell wide and one cell tall. The grid had no place for the new widget for an
 * instant, the grid library invented a 1×1 one, the page saved it, and a chart
 * squeezed into it never stopped redrawing.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface Widget {
  id: string;
  widgetType: string;
  position: { x: number; y: number; w: number; h: number };
}

test('a second and a third widget can be added: the page stays up and each keeps its proper size', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `awc-${stamp}`,
      slug: `awc-${stamp}`,
      adminFullName: 'Wim Admin',
      adminEmail: `admin-${stamp}@awc.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', targetValue: 50000 } })).json()) as { id: string };
  for (const [month, value] of [['01', 41000], ['02', 43000], ['03', 39000]] as const) {
    expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-28` } })).status()).toBe(201);
  }
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const widgets = async () => ((await (await api.get(`/dashboards/${dashboard.id}`)).json()) as { widgets: Widget[] }).widgets;

  await page.goto(`/dashboards/${dashboard.id}`);
  const add = async (type: string) => {
    await page.getByTestId('dashboard-add-widget-toggle').click();
    await page.getByTestId(`widget-type-${type}`).click();
    await page.getByTestId('kpi-picker').getByText(`Revenue ${stamp}`).click();
    await page.getByTestId('widget-editor-submit').click();
    await expect(page.getByTestId('widget-editor')).toBeHidden();
  };

  await add('kpi_card');
  await expect(page.locator('[data-testid^="widget-card-"]')).toHaveCount(1);
  // The second one is where it used to crash.
  await add('line');
  await expect(page.locator('[data-testid^="widget-card-"]')).toHaveCount(2);
  await add('gauge');
  await expect(page.locator('[data-testid^="widget-card-"]')).toHaveCount(3);

  // Still the dashboard, not the error page — also a moment later, once any layout save has gone.
  await page.waitForTimeout(1200);
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-detail-heading')).toHaveText(`Board ${stamp}`);

  // Each widget is saved at the size its kind is given, not at one cell by one.
  const saved = await widgets();
  // And beside the one before it while there is room, not each at the left edge of a row of its own.
  expect(saved.map((w) => [w.position.x, w.position.y])).toEqual([
    [0, 0],
    [3, 0],
    [expect.any(Number), expect.any(Number)],
  ]);
  expect(saved.map((w) => [w.widgetType, w.position.w, w.position.h])).toEqual([
    ['kpi_card', 3, 2],
    ['line', 6, 4],
    ['gauge', expect.any(Number), expect.any(Number)],
  ]);
  for (const w of saved) {
    expect(w.position.w, w.widgetType).toBeGreaterThanOrEqual(2);
    expect(w.position.h, w.widgetType).toBeGreaterThanOrEqual(2);
  }

  // And it is still so after a reload.
  await page.reload();
  await expect(page.locator('[data-testid^="widget-card-"]')).toHaveCount(3);
  const line = page.getByTestId(`widget-card-${saved[1]!.id}`);
  expect((await line.boundingBox())!.width).toBeGreaterThan(300);
});

test('a widget saved too small by the old fault is shown at a usable size', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `aws-${stamp}`,
      slug: `aws-${stamp}`,
      adminFullName: 'Wim Admin',
      adminEmail: `admin-${stamp}@aws.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  // With values, so the chart really draws: an empty chart in a tiny box did not bring the page down.
  for (const [month, value] of [['01', 2.1], ['02', 2.6], ['03', 3.4], ['04', 4.2], ['05', 5.1]] as const) {
    expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-28` } })).status()).toBe(201);
  }
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const made = await api.post(`/dashboards/${dashboard.id}/widgets`, {
    data: { widgetType: 'line', config: { kpiId: kpi.id }, position: { x: 0, y: 0, w: 1, h: 1 } },
  });
  expect(made.status()).toBe(201);
  const widget = (await made.json()) as { id: string };

  await page.goto(`/dashboards/${dashboard.id}`);
  const card = page.getByTestId(`widget-card-${widget.id}`);
  await expect(card).toBeVisible();

  // Adding another widget beside it is what brought the page down every time.
  await page.getByTestId('dashboard-add-widget-toggle').click();
  await page.getByTestId('widget-type-kpi_card').click();
  await page.getByTestId('kpi-picker').getByText(`Revenue ${stamp}`).click();
  await page.getByTestId('widget-editor-submit').click();
  await page.waitForTimeout(1500);
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.locator('[data-testid^="widget-card-"]')).toHaveCount(2);

  // Two cells wide and tall at least: about a sixth of the board, not a twelfth.
  expect((await card.boundingBox())!.width).toBeGreaterThan(120);
  expect((await card.boundingBox())!.height).toBeGreaterThan(150);
});
