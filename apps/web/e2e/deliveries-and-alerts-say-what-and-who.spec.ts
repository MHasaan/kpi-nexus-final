/**
 * Manual QA (2026-11-20, F-036 and F-070): after Acknowledge an alert's page showed only the time, not who; and
 * the failed-deliveries page showed a truncated delivery id instead of which alert or channel failed. Both now
 * name things.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("an alert's page says who acknowledged it", async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `who-${stamp}`,
      slug: `who-${stamp}`,
      adminFullName: 'Marcus Lee',
      adminEmail: `admin-${stamp}@who.test.local`,
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
      name: `MRR floor ${stamp}`,
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
  await page.getByTestId('alert-detail-ack').click();
  await expect(page.getByTestId('alert-acknowledged')).toContainText('by Marcus Lee');
});

test('the failed-deliveries page says which alert and channel failed', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `dlq-${stamp}`,
      slug: `dlq-${stamp}`,
      adminFullName: 'Dee Admin',
      adminEmail: `admin-${stamp}@dlq.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  // The API's answer, as it is once a webhook has failed: the names come with the row.
  await page.route('**/notification-deliveries?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'cmwnyb12f0abcdef', organizationId: 'org', alertId: 'alert_1', channelId: 'c1', targetUserId: null, kind: null, held: null,
          status: 'FAILED', attempts: 2, error: 'Delivery network error: fetch failed', sentAt: null, createdAt: '2026-11-20T09:00:00.000Z',
          channelName: 'QA broken webhook', kpiName: 'Net Promoter Score', alertMessage: 'NPS fell to 5, below the floor of 10',
        },
      ]),
    }),
  );
  await page.goto('/settings/notifications/dlq');
  const row = page.getByTestId('dlq-row-cmwnyb12f0abcdef');
  await expect(row).toContainText('Net Promoter Score');
  await expect(row).toContainText('NPS fell to 5');
  await expect(row).toContainText('QA broken webhook');
  await expect(row).not.toContainText('cmwnyb12f0');
});
