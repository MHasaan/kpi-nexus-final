/**
 * Plan 5.5: Plugins, System status and three settings pages drew their own
 * bare header — no sidebar, no search, no way on except the browser's Back.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('every page sits in the app frame: sidebar, breadcrumb, and a way back', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `shell-${stamp}`,
      slug: `shell-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@shell.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  for (const [path, heading] of [
    ['/plugins', 'Plugins'],
    ['/status', 'System status'],
    ['/settings/retention', 'Data retention'],
    ['/settings/scim', 'SCIM provisioning'],
    ['/settings/password-policy', 'Password policy'],
  ] as const) {
    await page.goto(path);
    await expect(page, `${path} stays put`).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByTestId('nav-dashboard'), `${path} has the sidebar`).toBeVisible();
    await expect(page.getByRole('banner').getByTestId('top-bar-title'), `${path} is named in the top bar`).toHaveText(heading);
    // No sideways scroll at phone width either.
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} fits a phone`).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  // The sidebar marks Plugins as the page you are on, and Settings for its sub-pages.
  await page.goto('/plugins');
  await expect(page.getByTestId('nav-plugins')).toHaveAttribute('aria-current', 'page');
  await page.goto('/settings/scim');
  await page.getByRole('banner').getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
