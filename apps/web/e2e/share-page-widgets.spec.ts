/**
 * Plan 4.6: the public share page drew every widget as the same card — a
 * label, one number, and for charts a single bar — in a two-column list,
 * whatever the board looked like. It now uses the dashboard's own widgets on
 * the author's grid, from data the link is allowed to carry.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('shared dashboard: real widgets on the author\'s grid; nothing per-person, no activity, no signed-in calls', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `spw-${stamp}`,
      slug: `spw-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@spw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const created = async (res: Awaited<ReturnType<typeof api.post>>, what: string) => {
    expect(res.status(), what).toBe(201);
    return (await res.json()) as { id: string; token?: string };
  };

  const revenue = await created(
    await api.post('/kpis', {
      data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', targetValue: 100, scorecardQuadrant: 'FINANCIAL' },
    }),
    'revenue KPI',
  );
  const year = new Date().getUTCFullYear() - 1;
  for (const [month, value] of [['01', 80], ['02', 90], ['03', 120]] as const) {
    await created(await api.post(`/kpis/${revenue.id}/data`, { data: { value, periodStart: `${year}-${month}-01`, periodEnd: `${year}-${month}-28` } }), `value ${value}`);
  }
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const calls = await created(
    await api.post('/kpis', { data: { name: `Calls ${stamp}`, scope: 'PER_USER', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', userIds: [me.user.id] } }),
    'per-person KPI',
  );

  const dashboard = await created(await api.post('/dashboards', { data: { name: `Board ${stamp}` } }), 'dashboard');
  const add = async (widgetType: string, position: { x: number; y: number; w: number; h: number }, config: Record<string, unknown> = {}) =>
    (await created(await api.post(`/dashboards/${dashboard.id}/widgets`, { data: { widgetType, position, config } }), `${widgetType} widget`)).id;
  const line = await add('line', { x: 0, y: 0, w: 8, h: 3 }, { kpiId: revenue.id });
  const card = await add('kpi_card', { x: 8, y: 0, w: 4, h: 3 }, { kpiId: revenue.id });
  const list = await add('list', { x: 0, y: 3, w: 6, h: 4 });
  const map = await add('strategy_map', { x: 6, y: 3, w: 6, h: 4 });
  const activity = await add('activity', { x: 0, y: 7, w: 6, h: 3 });
  const perPerson = await add('line', { x: 6, y: 7, w: 6, h: 3 }, { kpiId: calls.id });
  const link = await created(await api.post(`/dashboards/${dashboard.id}/share`, { data: {} }), 'share link');

  // A reader with no account, on a desktop-width screen.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const reader = await context.newPage();
  const apiCalls: string[] = [];
  reader.on('request', (r) => {
    if (r.url().startsWith(API_URL)) apiCalls.push(new URL(r.url()).pathname);
  });
  await reader.goto(`/share/${link.token}`);
  await expect(reader.getByTestId('public-dashboard-viewer')).toBeVisible();

  // A chart with one label per period, not one bar.
  const chart = reader.getByTestId(`widget-render-${line}`);
  await expect(chart).toContainText(`Revenue ${stamp}`);
  await expect.poll(async () => new Set((await chart.innerText()).match(/\d{1,2}\/\d{1,2}\/\d{4}/g) ?? []).size).toBe(3);

  // The card: newest value, target, by the KPI's name.
  const kpiCard = reader.getByTestId(`widget-render-${card}`);
  await expect(kpiCard).toContainText(`Revenue ${stamp}`);
  await expect(kpiCard).toContainText('120');
  await expect(kpiCard).toContainText('Target: 100');

  await expect(reader.getByTestId(`widget-render-${list}`)).toContainText(`Revenue ${stamp}`);
  const strategy = reader.getByTestId(`widget-render-${map}`);
  await expect(strategy.getByTestId('perspective-FINANCIAL')).toContainText('1 KPI');
  await expect(strategy.getByRole('link')).toHaveCount(0); // nowhere for a reader with no account to go

  // What a shared link never shows, said plainly.
  await expect(reader.getByTestId(`widget-render-${activity}`)).toContainText('not shown on a shared link');
  await expect(reader.getByTestId(`widget-render-${perPerson}`)).toContainText('per team or per person');
  await expect(reader.getByTestId('share-widgets')).not.toContainText('Ada Admin');

  // The author's layout: chart and card side by side, the chart twice as wide.
  const chartBox = (await reader.getByTestId(`share-widget-${line}`).boundingBox())!;
  const cardBox = (await reader.getByTestId(`share-widget-${card}`).boundingBox())!;
  const listBox = (await reader.getByTestId(`share-widget-${list}`).boundingBox())!;
  expect(Math.abs(chartBox.y - cardBox.y)).toBeLessThan(2);
  expect(cardBox.x).toBeGreaterThan(chartBox.x + chartBox.width - 1);
  expect(chartBox.width / cardBox.width).toBeGreaterThan(1.8);
  expect(listBox.y).toBeGreaterThan(chartBox.y + chartBox.height - 1);

  // The page asked the API for the shared dashboard and nothing else.
  expect([...new Set(apiCalls)]).toEqual([`/public/dashboards/${link.token}`]);

  // On a phone the widgets stack, full width, with no sideways scroll.
  await reader.setViewportSize({ width: 375, height: 812 });
  const phoneChart = (await reader.getByTestId(`share-widget-${line}`).boundingBox())!;
  const phoneCard = (await reader.getByTestId(`share-widget-${card}`).boundingBox())!;
  expect(phoneCard.y).toBeGreaterThan(phoneChart.y + phoneChart.height - 1);
  expect(await reader.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});
