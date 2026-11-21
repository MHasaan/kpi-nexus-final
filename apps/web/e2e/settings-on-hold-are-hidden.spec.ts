/**
 * UI-014: neither single sign-on nor a custom domain is switched on in this version. Their settings pages
 * saved what an administrator typed and then said it was not in use yet (ADR-002 and ADR-003 are not
 * written). Owner decision 2026-11-20: hide both pages and do them later. Settings no longer lists them,
 * and a link or bookmark to either leads back to Settings. Their code is kept for when they are built.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the SSO and custom-domain settings are hidden until they are built', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `soh-${stamp}`,
      slug: `soh-${stamp}`,
      adminFullName: 'Sadia Admin',
      adminEmail: `admin-${stamp}@soh.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings');
  await expect(page.getByTestId('settings-link-settings-password-policy')).toBeVisible();
  await expect(page.getByTestId('settings-link-settings-sso')).toHaveCount(0);
  await expect(page.getByTestId('settings-link-settings-custom-domain')).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('Single sign-on');
  await expect(page.getByRole('main')).not.toContainText('Custom domain');

  for (const path of ['/settings/sso', '/settings/custom-domain']) {
    await page.goto(path);
    await expect(page, `${path} leads back to Settings`).toHaveURL(/\/settings$/);
    await expect(page.getByTestId('settings-link-settings-password-policy')).toBeVisible();
  }
});
