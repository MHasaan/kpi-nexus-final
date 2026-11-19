/**
 * Flow walk (people): on a 1280-pixel-wide screen the People page ran off the
 * right-hand side — the invite form was cut and the page scrolled sideways.
 * The list's own columns (a separate one for the email) were wider than the
 * room beside the form.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the People page fits a 1280-pixel screen: nothing runs off the side', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-${stamp}@people-page-fits.test.local`;
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await registerOrgViaApi(page, {
      orgName: `ppf-${stamp}`,
      slug: `ppf-${stamp}`,
      adminFullName: 'Paloma Administrator',
      adminEmail: email,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  await page.goto('/users');
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row).toBeVisible();

  // The page does not scroll sideways.
  const overflow = await page.locator('main#main-content').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The invite form and the row's actions are wholly on the screen.
  for (const target of [page.getByTestId('invite-submit-button'), page.getByTestId(`user-edit-${email}`)]) {
    await expect(target).toBeInViewport({ ratio: 1 });
  }
  // The email is still on the row, under the name.
  await expect(row).toContainText(email);
  await expect(row).toContainText('Paloma Administrator');
});
