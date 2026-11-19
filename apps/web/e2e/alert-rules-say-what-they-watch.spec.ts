/**
 * Flow walk (alert rules): the list of rules gave each one's type — "Threshold"
 * — and not what it watches for, so two rules on one KPI could be told apart
 * only by what their author happened to name them.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the list of alert rules says what each rule watches for', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `arw-${stamp}`,
      slug: `arw-${stamp}`,
      adminFullName: 'Ana Admin',
      adminEmail: `admin-${stamp}@arw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const rule = async (name: string, ruleType: string, config: Record<string, unknown>) => {
    const res = await api.post('/alert-rules', { data: { kpiId: kpi.id, name, ruleType, severity: 'MEDIUM', config } });
    expect(res.status(), name).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const floor = await rule(`Floor ${stamp}`, 'STATIC_THRESHOLD', { operator: '<', value: 50000 });
  const drop = await rule(`Drop ${stamp}`, 'RATE_OF_CHANGE', { pctChange: -20, windowMinutes: 1440 });
  const quiet = await rule(`Quiet ${stamp}`, 'NO_DATA', { maxStaleMinutes: 2880 });

  await page.goto('/alerts/rules');
  await expect(page.getByTestId(`alert-rule-row-${floor}`)).toContainText('When the value is below 50,000');
  await expect(page.getByTestId(`alert-rule-row-${drop}`)).toContainText('When it falls by 20% or more within 1 day');
  await expect(page.getByTestId(`alert-rule-row-${quiet}`)).toContainText('When no value has been recorded in 2 days');
  // The kind of rule is named as the form names it.
  await expect(page.getByTestId(`alert-rule-row-${floor}`)).toContainText('Crosses a fixed value');
  await expect(page.getByRole('main')).not.toContainText('Anomaly (σ)');
});
