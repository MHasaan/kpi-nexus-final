/**
 * Plan 4.5 (web): the new-rule form could not say who to notify except by
 * channel (which only administrators can see), had no description or quiet
 * period, and asked for "σ count" and "Window (min)". The API already took
 * people and roles on each step.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('alert rule: a fall over a day, a quiet period, and people to notify — all saved as chosen', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `arf-${stamp}`,
      slug: `arf-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@arf.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const me = (await (await admin.get('/auth/me')).json()) as { user: { id: string } };
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const manager = roles.find((r) => r.name === 'Manager')!;
  const invited = (await (await admin.post('/users', { data: { email: `mia-${stamp}@arf.test.local`, fullName: 'Mia Manager', roleId: manager.id } })).json()) as { inviteToken: string };
  expect((await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).ok()).toBe(true);
  const kpi = (await (await admin.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  await page.goto('/alerts/new');
  await page.getByTestId('rule-name-input').fill(`Sharp fall ${stamp}`);
  await page.getByTestId('rule-description-input').fill('Check the pipeline before the board meeting.');
  await page.getByTestId('rule-kpi-select').selectOption(kpi.id);
  await page.getByTestId('rule-type-select').selectOption('RATE_OF_CHANGE');
  await page.getByTestId('rule-direction-select').selectOption('fall');
  await page.getByTestId('rule-percent-input').fill('20');
  await page.getByTestId('rule-window-value').fill('1');
  await page.getByTestId('rule-window-unit').selectOption('days');
  await expect(page.getByTestId('rule-sentence')).toHaveText(`Alert when Revenue ${stamp} falls by 20% or more within 1 day.`);
  await page.getByTestId('rule-cooldown-value').fill('2');
  await page.getByTestId('rule-cooldown-unit').selectOption('hours');

  // A step with nobody on it is refused, in words.
  await page.getByTestId('escalation-add-level').click();
  await page.getByTestId('rule-submit').click();
  await expect(page.getByTestId('rule-error')).toHaveText('Step 1 notifies nobody. Choose who to notify, or remove the step.');

  // People and roles, with no channel at all.
  await page.getByTestId('escalation-0-role-Manager').check();
  await page.getByTestId(`escalation-0-user-${me.user.id}`).check();
  await expect(page.getByTestId('escalation-0-summary')).toHaveText('Straight away: everyone with the Manager role (1 person) and Ada Admin.');

  await page.getByTestId('rule-submit').click();
  await expect(page).toHaveURL(/\/alerts\/rules$/);
  await expect(page.getByTestId('alert-rules-table')).toContainText(`Sharp fall ${stamp}`);

  const rules = (await (await admin.get(`/alert-rules?kpiId=${kpi.id}`)).json()) as Array<{
    description: string | null;
    ruleType: string;
    config: unknown;
    escalationRule: { levels: unknown } | null;
  }>;
  expect(rules).toHaveLength(1);
  expect(rules[0]).toMatchObject({
    description: 'Check the pipeline before the board meeting.',
    ruleType: 'RATE_OF_CHANGE',
    config: { pctChange: -20, windowMinutes: 1440, cooldownMinutes: 120 },
    escalationRule: { levels: [{ delayMinutes: 0, channelIds: [], notifyRoleIds: [manager.id], notifyUserIds: [me.user.id] }] },
  });
});
