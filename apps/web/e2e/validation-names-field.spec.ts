/**
 * QA-L10: a form whose input the API refused showed "Invalid request body" and
 * named no field. The refusal carries the field; the page now says it.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('a refused request names the field: an org unit with a one-letter name', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `vnf-${stamp}`,
      slug: `vnf-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@vnf.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/org-units');
  // The form asks only that a name be given; the API wants at least two characters.
  await page.getByTestId('unit-name-input').fill('A');
  await page.getByTestId('unit-submit-button').click();
  const error = page.getByTestId('unit-error');
  await expect(error).toContainText('Name:');
  await expect(error).not.toContainText('Invalid request body');
});
