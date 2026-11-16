/**
 * UI-011: with an approval workflow active the API answers a KPI edit or a new
 * target with 202 "sent for approval" instead of the saved row. The UI must say
 * so — not navigate to /kpis/undefined, and not look as if nothing happened.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('kpi edit and target add under an approval workflow say "sent for approval"', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `Approval E2E ${stamp}`,
        slug: `approval-${stamp}`,
        adminEmail: `admin-${stamp}@approval.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Approval Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Approval KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  const roles = (await (await api.get('/roles')).json()) as Array<{ id: string; isAdmin: boolean }>;
  const adminRole = roles.find((r) => r.isAdmin);
  expect(adminRole, 'the new org has an admin role').toBeTruthy();
  for (const entityType of ['KPI_DEFINITION', 'KPI_TARGET']) {
    const res = await api.put(`/approvals/workflows/${entityType}`, {
      data: { requiredApproverRoleIds: [adminRole!.id], isActive: true },
    });
    expect(res.ok(), `${entityType} workflow enabled`).toBeTruthy();
  }

  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );

  // Edit: the change is queued, the user is told, and stays on a real page.
  await page.goto(`/kpis/${kpi.id}/edit`);
  await page.getByTestId('kpi-name').fill(`Approval KPI ${stamp} renamed`);
  await page.getByTestId('kpi-submit').click();
  const editNotice = page.getByTestId('kpi-approval-pending');
  await expect(editNotice).toBeVisible();
  await expect(editNotice).toContainText('sent for approval');
  await expect(editNotice.getByRole('link', { name: 'View approvals' })).toHaveAttribute('href', '/approvals');
  expect(page.url()).not.toContain('/kpis/undefined');
  // Not applied yet: the KPI still has its old name.
  const after = (await (await api.get(`/kpis/${kpi.id}`)).json()) as { name: string };
  expect(after.name).toBe(`Approval KPI ${stamp}`);

  // Target: same — a notice, and no target row yet.
  await page.goto(`/kpis/${kpi.id}`);
  await page.getByTestId('tab-targets').click();
  await page.getByTestId('target-value').fill('120');
  await page.getByTestId('target-add').click();
  const targetNotice = page.getByTestId('target-approval-pending');
  await expect(targetNotice).toBeVisible();
  await expect(targetNotice).toContainText('sent for approval');
  const targets = (await (await api.get(`/kpis/${kpi.id}/targets`)).json()) as unknown[];
  expect(targets).toHaveLength(0);
});
