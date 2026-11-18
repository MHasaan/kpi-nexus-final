/**
 * QA-H3: a KPI graded by its own warning / critical thresholds — which is what
 * the KPI form writes — read "At risk" on the home page and "No bands set" on
 * its own page. Both now use one rule.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI health: the KPI page says what the home page says', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `hlt-${stamp}`,
      slug: `hlt-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@hlt.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE', unit: '%', direction: 'HIGHER_IS_BETTER', targetValue: 100, warningThreshold: 80, criticalThreshold: 50 },
  })).json()) as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 72, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);

  // The two answers the API gives, from one rule.
  const summary = (await (await api.get('/kpis/dashboard-summary')).json()) as Array<{ kpiId: string; status: string }>;
  expect(summary.find((r) => r.kpiId === kpi.id)?.status).toBe('AT_RISK');
  expect(await (await api.get(`/kpis/${kpi.id}/threshold-bands/status`)).json()).toMatchObject({ band: null, health: 'AT_RISK' });

  // The KPI's own page.
  await page.goto(`/kpis/${kpi.id}`);
  await expect(page.getByTestId('overview-health')).toHaveText('At risk');
  await expect(page.getByTestId('overview-health-basis')).toHaveText('From its warning and critical thresholds');
});
