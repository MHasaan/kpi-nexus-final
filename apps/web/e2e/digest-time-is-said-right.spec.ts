/**
 * Flow walk (settings): Settings → Notifications offered the alert digest as
 * "Daily 8am" and "Weekly Mon 8am", when it went out at 07:00 UTC. It now goes
 * out at 07:00 on each person's own clock, and both pages that offer it say so.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the notifications page says when the digest is really sent', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `dts-${stamp}`,
      slug: `dts-${stamp}`,
      adminFullName: 'Dua Admin',
      adminEmail: `admin-${stamp}@dts.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings/notifications');
  await expect(page.getByTestId('digest-DAILY').locator('xpath=..')).toHaveText('Daily, at 07:00 your time');
  await expect(page.getByTestId('digest-WEEKLY').locator('xpath=..')).toHaveText('Weekly, on Mondays at 07:00 your time');
  await expect(page.getByRole('main')).not.toContainText('8am');
  await expect(page.getByRole('main')).not.toContainText('UTC');

  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await expect(page.getByTestId('digest-help')).toContainText('at 07:00 on your own clock');
  await expect(page.getByTestId('digest-help')).not.toContainText('UTC');
});
