/**
 * Manual QA (2026-11-19, F-014): Roles → New role → Create added the role to the list, but the matrix stayed on
 * Admin; an administrator who started ticking boxes was editing the wrong role. A new role now opens at once.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('a role just created is the one open for editing', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `role-${stamp}`,
      slug: `role-${stamp}`,
      adminFullName: 'Rae Admin',
      adminEmail: `admin-${stamp}@role.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/roles');
  await page.getByTestId('roles-new-button').click();
  await page.getByPlaceholder('e.g. Field Engineer').fill(`Field Engineer ${stamp}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // The matrix and the preset controls belong to the new role, not to Admin.
  await expect(page.getByTestId(`preset-select-Field Engineer ${stamp}`)).toBeVisible();
  await expect(page.getByTestId('preset-select-Admin')).toHaveCount(0);
});
