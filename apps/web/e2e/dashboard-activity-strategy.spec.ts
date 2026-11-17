/**
 * Plan 4.6: two widget kinds could be added to a dashboard and showed a
 * placeholder — "Activity feed — coming soon", and four fixed boxes of
 * textbook text for the strategy map. Both now show the organisation's own data.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('dashboard: the activity widget lists what happened, the strategy map counts KPIs by perspective and health', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `was-${stamp}`,
      slug: `was-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@was.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const month = new Date().toISOString().slice(0, 7);
  const kpi = async (name: string, quadrant: string | undefined, target: number | undefined, value: number | undefined) => {
    const res = await api.post('/kpis', {
      data: {
        name: `${name} ${stamp}`,
        scope: 'ORG_WIDE',
        type: 'NUMBER',
        direction: 'HIGHER_IS_BETTER',
        aggregationMethod: 'LAST',
        ...(quadrant ? { scorecardQuadrant: quadrant } : {}),
        ...(target !== undefined ? { targetValue: target } : {}),
      },
    });
    expect(res.status(), `${name} created`).toBe(201);
    const { id } = (await res.json()) as { id: string };
    if (value !== undefined) {
      expect((await api.post(`/kpis/${id}/data`, { data: { value, periodStart: `${month}-01`, periodEnd: `${month}-28` } })).status()).toBe(201);
    }
    return id;
  };
  await kpi('Revenue', 'FINANCIAL', 100, 120); // on track
  await kpi('Margin', 'FINANCIAL', 100, 10); // off track
  await kpi('NPS', 'CUSTOMER', 50, 60); // on track
  await kpi('Loose end', undefined, undefined, undefined); // no perspective

  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const add = async (widgetType: string, x: number) => {
    const res = await api.post(`/dashboards/${dashboard.id}/widgets`, { data: { widgetType, position: { x, y: 0, w: 6, h: 5 }, config: {} } });
    expect(res.status(), `${widgetType} widget created`).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const activityId = await add('activity', 0);
  const mapId = await add('strategy_map', 6);

  await page.goto(`/dashboards/${dashboard.id}`);

  const map = page.getByTestId(`widget-render-${mapId}`);
  await expect(map).not.toContainText('Revenue, profitability, cost efficiency'); // the old fixed text
  await expect(map.getByTestId('perspective-FINANCIAL')).toContainText('2 KPIs');
  await expect(map.getByTestId('perspective-FINANCIAL')).toContainText('1 off track · 1 on track');
  await expect(map.getByTestId('perspective-CUSTOMER')).toContainText('1 KPI');
  await expect(map.getByTestId('perspective-CUSTOMER')).toContainText('1 on track');
  await expect(map.getByTestId('perspective-INTERNAL_PROCESS')).toContainText('No KPIs yet');
  await expect(map.getByTestId('strategy-unassigned')).toContainText('1 KPI has no perspective');
  await expect(map.getByRole('link', { name: 'Open the scorecard' })).toHaveAttribute('href', '/kpis/scorecard');

  const activity = page.getByTestId(`widget-render-${activityId}`);
  await expect(activity).not.toContainText('coming soon');
  await expect(activity.getByTestId('activity-row').first()).toContainText('Ada Admin');
  await expect(activity).toContainText('created a KPI');
  await expect(activity.getByRole('link', { name: 'See all activity' })).toHaveAttribute('href', '/activity');
});
