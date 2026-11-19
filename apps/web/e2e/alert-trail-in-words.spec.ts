/**
 * Flow walk (alerts): an alert's page said who would be told as "Level 1 ·
 * after 0m · 0 channels · 0 roles · 1 users", and what was sent as "In-app"
 * twice — one of the two was an email to a person. It now names the people and
 * says how each notification went.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('an alert says who is told, when, and how each notification went', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `atw-${stamp}`,
      slug: `atw-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@atw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const roles = (await (await api.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const manager = roles.find((r) => r.name === 'Manager')!.id;
  const kpi = (await (await api.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await api.post('/alert-rules', {
    data: {
      kpiId: kpi.id,
      name: `Too high ${stamp}`,
      ruleType: 'STATIC_THRESHOLD',
      severity: 'MEDIUM',
      config: { operator: '>', value: 4 },
      escalationLevels: [
        { delayMinutes: 0, channelIds: [], notifyRoleIds: [], notifyUserIds: [me.user.id] },
        { delayMinutes: 30, channelIds: [], notifyRoleIds: [manager], notifyUserIds: [] },
      ],
    },
  })).status()).toBe(201);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 5.1, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);
  let alertId = '';
  await expect.poll(async () => {
    const alerts = (await (await api.get('/alerts')).json()) as Array<{ id: string }> | { items: Array<{ id: string }> };
    const list = Array.isArray(alerts) ? alerts : alerts.items;
    alertId = list[0]?.id ?? '';
    return alertId;
  }).not.toBe('');

  await page.goto(`/alerts/${alertId}`);
  const steps = page.getByTestId('escalation-levels');
  await expect(steps).toContainText('Straight away: Ada Admin.');
  await expect(steps).toContainText('After 30 minutes, if nobody has acknowledged it: everyone with the Manager role');
  for (const old of ['1 users', '0 channels', '0 roles', 'Level 1']) await expect(steps).not.toContainText(old);

  // What was sent: the alert in the app, and an email to Ada — named for what they are.
  await expect(async () => {
    await page.reload();
    const sent = page.getByTestId('escalation-deliveries');
    await expect(sent).toContainText('Shown in the app', { timeout: 3_000 });
    await expect(sent).toContainText('Email to Ada Admin', { timeout: 3_000 });
    await expect(sent).not.toContainText('In-app');
  }).toPass({ timeout: 30_000 });
});
