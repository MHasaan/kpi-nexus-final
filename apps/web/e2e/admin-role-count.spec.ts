/**
 * Flow walk (roles): the list of roles put "0" beside the administrator role —
 * its count of ticked permissions — while every box on the right was ticked,
 * because an administrator role passes every check without holding any.
 * It now reads "All".
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the administrator role is listed with All permissions, not 0', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `arc-${stamp}`,
      slug: `arc-${stamp}`,
      adminFullName: 'Ari Admin',
      adminEmail: `admin-${stamp}@arc.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/roles');
  await expect(page.getByTestId('role-permission-count-Admin')).toHaveText('All');
  // A role that holds permissions one by one still shows how many.
  await expect(page.getByTestId('role-permission-count-Viewer')).toHaveText(/^\d+$/);
});
