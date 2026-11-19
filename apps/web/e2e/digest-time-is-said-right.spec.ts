/**
 * Flow walk (settings): Settings → Notifications offered the alert digest as
 * "Daily 8am" and "Weekly Mon 8am". It is sent at 07:00 UTC — which is what the
 * same choice says on Account settings → Preferences, and 8am nowhere.
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
  await expect(page.getByTestId('digest-DAILY').locator('xpath=..')).toHaveText('Daily, at 07:00 UTC');
  await expect(page.getByTestId('digest-WEEKLY').locator('xpath=..')).toHaveText('Weekly, on Mondays at 07:00 UTC');
  await expect(page.getByRole('main')).not.toContainText('8am');
});
