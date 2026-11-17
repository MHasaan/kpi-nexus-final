/**
 * Plan 4.4: with a ROLE_PERMISSIONS approval workflow on, saving a role's
 * permissions (or applying a preset) is queued, not applied. The page said so
 * in a line of green text that looked like "saved" and led nowhere. It now
 * shows the same notice as a KPI edit, with a link to the request.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('roles: a permission change under approval says so and links to the request', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rap-${stamp}`,
      slug: `rap-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@rap.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string; permissions: string[] }>;
  const adminRole = roles.find((r) => r.name === 'Admin')!;
  const viewer = roles.find((r) => r.name === 'Viewer')!;
  expect(viewer.permissions).not.toContain('KPI_EDIT');
  expect(
    (await admin.put('/approvals/workflows/ROLE_PERMISSIONS', { data: { requiredApproverRoleIds: [adminRole.id], requireAll: false, isActive: true } })).ok(),
  ).toBe(true);

  await page.goto('/roles');
  await page.getByTestId('role-row-Viewer').getByRole('button').click();
  // The real checkbox is visually hidden behind a drawn one; press its label.
  await page.locator('label', { has: page.getByTestId('perm-Viewer-KPI_EDIT') }).click();
  await expect(page.getByTestId('perm-Viewer-KPI_EDIT')).toBeChecked();
  await page.getByTestId('perm-save-Viewer').click();

  const notice = page.getByTestId('perm-approval-pending-Viewer');
  await expect(notice).toContainText('sent for approval');
  await expect(notice).toContainText('Nothing changes until an approver accepts');
  // Not applied: the box is back as it was, and the role is unchanged.
  await expect(page.getByTestId('perm-Viewer-KPI_EDIT')).not.toBeChecked();
  const after = (await (await admin.get('/roles')).json()) as Array<{ name: string; permissions: string[] }>;
  expect(after.find((r) => r.name === 'Viewer')!.permissions).not.toContain('KPI_EDIT');

  // The link leads to the request, named for the role.
  await notice.getByRole('link', { name: 'View approvals' }).click();
  await expect(page).toHaveURL(/\/approvals$/);
  const pending = page.getByTestId('pending-requests').locator('[data-testid^="request-"]').first();
  await expect(pending).toContainText('Role permission change');
  await expect(pending).toContainText('Viewer');
  await expect(pending).toContainText('Asked by you');
});
