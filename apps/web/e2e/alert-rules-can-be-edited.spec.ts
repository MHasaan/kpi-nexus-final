/**
 * Manual QA (2026-11-20, F-069): Edit on an alert rule offered only its name, severity and description; the
 * threshold, quiet period, people and channels could not be changed without deleting the rule and making it
 * again. Edit now opens the rule in the same form that made it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('an alert rule opens in the form it was made with, and its condition can be changed', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `are-${stamp}`,
      slug: `are-${stamp}`,
      adminFullName: 'Ari Admin',
      adminEmail: `admin-${stamp}@are.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY' } })).json()) as { id: string };
  const name = `MRR below 230k floor ${stamp}`;
  const rule = (await (await api.post('/alert-rules', {
    data: { kpiId: kpi.id, name, ruleType: 'STATIC_THRESHOLD', severity: 'MEDIUM', config: { operator: '<', value: 230000, cooldownMinutes: 120 } },
  })).json()) as { id: string };

  await page.goto('/alerts/rules');
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/alerts/new\\?edit=${rule.id}`));
  await expect(page.getByTestId('new-rule-heading')).toHaveText('Edit alert rule');
  await expect(page.getByTestId('rule-name-input')).toHaveValue(name);
  await expect(page.getByTestId('rule-threshold-input')).toHaveValue('230000');
  await expect(page.getByTestId('rule-operator-select')).toHaveValue('<');

  await page.getByTestId('rule-threshold-input').fill('250000');
  await page.getByTestId('rule-severity-select').selectOption('HIGH');
  await page.getByTestId('rule-submit').click();
  await expect(page).toHaveURL(/\/alerts\/rules$/);

  const saved = (await (await api.get(`/alert-rules/${rule.id}`)).json()) as { name: string; severity: string; config: { operator: string; value: number; cooldownMinutes?: number } };
  expect(saved).toMatchObject({ name, severity: 'HIGH', config: { operator: '<', value: 250000, cooldownMinutes: 120 } });
});
