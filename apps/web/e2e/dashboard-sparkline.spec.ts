/**
 * 1.5: the home dashboard drew its sparkline from two invented points — the
 * window's aggregate and the latest value — so every KPI showed the same
 * two-point shape, and a KPI with no data drew a flat line at zero.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('the home dashboard draws a KPI’s real recent periods', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `spark-${stamp}`,
      slug: `spark-${stamp}`,
      adminFullName: 'Spark Admin',
      adminEmail: `admin-${stamp}@spark.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });

  const kpi = (await (await api.post('/kpis', {
    data: {
      name: `Spark KPI ${stamp}`,
      scope: 'ORG_WIDE',
      type: 'NUMBER',
      direction: 'HIGHER_IS_BETTER',
      aggregationMethod: 'LAST',
      frequency: 'DAILY',
      status: 'ACTIVE',
    },
  })).json()) as { id: string };

  // Five days, a different value each day.
  for (const [value, back] of [[10, 5], [40, 4], [20, 3], [50, 2], [30, 1]] as const) {
    const start = new Date(Date.now() - back * 86_400_000);
    start.setUTCHours(0, 0, 0, 0);
    const res = await api.post(`/kpis/${kpi.id}/data`, {
      data: {
        value,
        periodStart: start.toISOString(),
        periodEnd: new Date(start.getTime() + 86_399_000).toISOString(),
      },
    });
    expect(res.status()).toBe(201);
  }

  // The summary carries the five values, oldest first.
  const summary = (await (await api.get('/kpis/dashboard-summary')).json()) as Array<{
    kpiId: string;
    spark: number[];
  }>;
  expect(summary.find((r) => r.kpiId === kpi.id)?.spark).toEqual([10, 40, 20, 50, 30]);

  await page.goto('/dashboard');
  const row = page.getByTestId(`dashboard-card-Spark KPI ${stamp}`);
  await expect(row).toBeVisible();
  // A real series draws a polyline with one point per period, not two.
  const points = await row.locator('svg polyline').first().getAttribute('points');
  expect(points, 'the sparkline is drawn from the KPI’s own series').toBeTruthy();
  expect(points!.trim().split(/\s+/), 'one point per period').toHaveLength(5);
});
