/**
 * An approver was shown a request as it is stored — `dto: {"type":"STATIC",
 * "value":2.5}`, `kind: create`, `kpiId: cmw…` for a new target — and a change
 * to a KPI listed every field the KPI has (its id, its dates) as changed to
 * nothing. The request now reads as the change it asks for.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('approvals: a request reads as the change it asks for, not as stored data', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `acw-${stamp}`,
      slug: `acw-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@acw.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const invited = (await (await admin.post('/users', {
    data: { email: `eve-${stamp}@acw.test.local`, fullName: 'Eve Editor', roleId: roles.find((r) => r.name === 'Manager')!.id },
  })).json()) as { inviteToken: string };
  const eve = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string };
  const editor = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${eve.accessToken}` } });

  const kpi = (await (await admin.post('/kpis', {
    data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE', type: 'PERCENTAGE', direction: 'LOWER_IS_BETTER', frequency: 'MONTHLY', targetValue: 3 },
  })).json()) as { id: string };

  // Both kinds of change need an administrator's approval.
  await page.goto('/approvals');
  for (const kind of ['KPI_DEFINITION', 'KPI_TARGET']) {
    await page.getByTestId(`workflow-${kind}-role-Admin`).check();
    await page.getByTestId(`workflow-active-${kind}`).check();
    await expect(page.getByTestId(`workflow-${kind}`)).toContainText('On');
  }

  // The editor asks for a new name and frequency, and for a new target.
  expect((await editor.patch(`/kpis/${kpi.id}`, { data: { name: `Churn rate ${stamp}`, frequency: 'WEEKLY' } })).status()).toBe(202);
  expect((await editor.post(`/kpis/${kpi.id}/targets`, { data: { type: 'STATIC', value: 2.5 } })).status()).toBe(202);

  await page.reload();
  const requests = page.getByTestId('pending-requests').locator('[data-testid^="request-"]');
  await expect(requests).toHaveCount(2);

  // The KPI change: the two fields that change, from and to, and nothing else the KPI has.
  const kpiChange = requests.filter({ hasText: 'KPI change' }).locator('[data-testid^="approval-diff-"]');
  await expect(kpiChange).toContainText('What would change');
  await expect(kpiChange).toContainText(`Name`);
  await expect(kpiChange).toContainText(`Churn rate ${stamp}`);
  await expect(kpiChange).toContainText('Frequency');
  await expect(kpiChange).toContainText('Monthly');
  await expect(kpiChange).toContainText('Weekly');
  for (const stored of ['organizationId', 'createdAt', 'WEEKLY', kpi.id]) {
    await expect(kpiChange).not.toContainText(stored);
  }

  // The new target: a target of 2.5, not the request's wrapping.
  const target = requests.filter({ hasText: 'KPI target' }).locator('[data-testid^="approval-diff-"]');
  await expect(target).toContainText('What is asked for');
  await expect(target.locator('dl > div')).toHaveCount(1);
  await expect(target.locator('dl > div')).toHaveText(/^Target\s*2\.5$/);
  for (const stored of ['dto', 'kind', 'kpiId', 'STATIC', kpi.id]) {
    await expect(target).not.toContainText(stored);
  }
});
