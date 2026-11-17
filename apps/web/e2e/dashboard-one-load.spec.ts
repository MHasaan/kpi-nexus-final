/**
 * UI-001 remainder / X-08 remainder: a dashboard loads the KPI list and the
 * summary ONCE for the whole board, and the KPI card colours its value by the
 * server's direction-aware status instead of comparing it with a threshold.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('a dashboard loads its KPI list once, and a healthy lower-is-better KPI is not red', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `oneload-${stamp}`,
      slug: `oneload-${stamp}`,
      adminFullName: 'One Load Admin',
      adminEmail: `admin-${stamp}@oneload.test.local`,
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

  // Churn at 3.5% against a 4% ceiling, with a critical threshold above it:
  // comparing `value <= criticalThreshold` painted this red.
  const kpi = (await (await api.post('/kpis', {
    data: {
      name: `Churn ${stamp}`,
      scope: 'ORG_WIDE',
      type: 'NUMBER',
      direction: 'LOWER_IS_BETTER',
      aggregationMethod: 'LAST',
      frequency: 'MONTHLY',
      targetValue: 4,
      warningThreshold: 6,
      criticalThreshold: 8,
    },
  })).json()) as { id: string };
  const now = new Date();
  await api.post(`/kpis/${kpi.id}/data`, {
    data: {
      value: 3.5,
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      periodEnd: now.toISOString(),
    },
  });

  const dashboard = (await (await api.post('/dashboards', { data: { name: `One Load ${stamp}` } })).json()) as {
    id: string;
  };
  const cardIds: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const res = await api.post(`/dashboards/${dashboard.id}/widgets`, {
      data: {
        widgetType: 'kpi_card',
        title: `card ${i}`,
        config: { kpiId: kpi.id },
        position: { x: (i * 4) % 12, y: 0, w: 4, h: 3 },
      },
    });
    expect(res.status()).toBe(201);
    cardIds.push(((await res.json()) as { id: string }).id);
  }

  // Count the KPI-catalogue reads this page makes against the API. Each widget
  // used to make one. (The web app's own /kpis route is prefetched by the
  // sidebar link; that is a page prefetch, not a data read.)
  const apiOrigin = new URL(API_URL).origin;
  let kpiListCalls = 0;
  page.on('request', (req) => {
    if (req.method() !== 'GET') return;
    const url = new URL(req.url());
    if (url.origin === apiOrigin && url.pathname === '/kpis') kpiListCalls += 1;
  });

  await page.goto(`/dashboards/${dashboard.id}`);
  const firstCard = page.getByTestId(`widget-render-${cardIds[0]}`);
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText('3.5');
  // Let any straggling per-widget request arrive before counting.
  await page.waitForTimeout(1500);
  expect(kpiListCalls, 'the KPI list is fetched once for the whole board').toBeLessThanOrEqual(1);

  // On track for a lower-is-better KPI: green, not the red the old rule gave.
  const value = firstCard.locator('p', { hasText: '3.5' }).first();
  await expect(value).toHaveClass(/text-status-success/);
  await expect(value).not.toHaveClass(/text-status-critical/);
});
