/**
 * X-03 (plan 7.3): pages printed the API's own codes and ids — "ACTIVE",
 * "NUMBER", "HIGHER_IS_BETTER", "UPDATE kpi", a KPI's id where its name
 * belonged, the role's id on the profile.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('names and words, not codes and ids', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `lbl-${stamp}`,
      slug: `lbl-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@lbl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', frequency: 'MONTHLY' },
  })).json()) as { id: string };
  expect((await api.post('/alert-rules', { data: { kpiId: kpi.id, name: `Too high ${stamp}`, ruleType: 'STATIC_THRESHOLD', severity: 'HIGH', config: { operator: '>', value: 100 } } })).status()).toBe(201);
  const month = new Date().toISOString().slice(0, 7);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 150, periodStart: `${month}-01`, periodEnd: `${month}-28` } })).status()).toBe(201);
  let alertId = '';
  await expect
    .poll(async () => {
      const alerts = (await (await api.get(`/alerts?kpiId=${kpi.id}`)).json()) as Array<{ id: string }>;
      alertId = alerts[0]?.id ?? '';
      return alertId;
    }, { timeout: 20_000 })
    .not.toBe('');

  // The KPI's own page.
  await page.goto(`/kpis/${kpi.id}`);
  const header = page.locator('main');
  await expect(page.getByTestId('kpi-detail-name')).toHaveText(`Revenue ${stamp}`);
  for (const code of ['NUMBER', 'HIGHER_IS_BETTER', 'MONTHLY', 'ACTIVE']) await expect(header, `no raw ${code}`).not.toContainText(code);
  await expect(header).toContainText('Higher is better');
  await expect(header).toContainText('Monthly');

  // The alert: the KPI and the rule by name, the status in words.
  await page.goto(`/alerts/${alertId}`);
  await expect(page.getByTestId('alert-detail-kpi-link')).toHaveText(`Revenue ${stamp}`);
  await expect(page.locator('main')).toContainText(`Too high ${stamp}`);
  await expect(page.getByTestId('alert-detail-status')).toHaveText('Open');
  await expect(page.locator('main')).not.toContainText(kpi.id);
  await page.goto('/alerts');
  await expect(page.locator('main')).toContainText('Open');
  await expect(page.locator('main')).not.toContainText('OPEN');

  // The activity feed reads as sentences.
  await page.goto('/activity');
  await expect(page.getByTestId('activity-list')).toContainText('created the KPI “Revenue');
  await expect(page.getByTestId('activity-list')).not.toContainText('CREATE');

  // The profile names the role.
  await page.goto('/profile');
  await expect(page.getByTestId('profile-role')).toHaveText('Admin');
});
