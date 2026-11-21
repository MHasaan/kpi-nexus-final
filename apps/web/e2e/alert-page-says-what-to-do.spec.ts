/**
 * Manual QA (2026-11-19, F-035): a rule's "What to do when it fires" was shown on the Rules list only. The
 * alert's own page, where the person handling it looks, did not have it. It does now.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("an alert's page says what to do, from its rule", async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `awtd-${stamp}`,
      slug: `awtd-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@awtd.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const kpi = (await (await api.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY' } })).json()) as { id: string };
  expect((await api.post('/alert-rules', {
    data: {
      kpiId: kpi.id,
      name: `MRR below 230k floor ${stamp}`,
      description: 'Check pipeline with Sales, then brief the CFO',
      ruleType: 'STATIC_THRESHOLD',
      severity: 'HIGH',
      config: { operator: '<', value: 230000 },
      escalationLevels: [{ delayMinutes: 0, channelIds: [], notifyRoleIds: [], notifyUserIds: [me.user.id] }],
    },
  })).status()).toBe(201);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 221000, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);
  let alertId = '';
  await expect.poll(async () => {
    const alerts = (await (await api.get('/alerts')).json()) as Array<{ id: string }> | { items: Array<{ id: string }> };
    const list = Array.isArray(alerts) ? alerts : alerts.items;
    alertId = list[0]?.id ?? '';
    return alertId;
  }).not.toBe('');

  await page.goto(`/alerts/${alertId}`);
  await expect(page.getByTestId('alert-what-to-do')).toContainText('Check pipeline with Sales, then brief the CFO');
});
