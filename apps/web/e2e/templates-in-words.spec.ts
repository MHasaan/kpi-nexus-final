/**
 * Flow walk (KPI templates): each card carried its scorecard perspective as a
 * stored key ("INTERNAL_PROCESS", "LEARNING_GROWTH") and the function filter
 * listed "ops" and "hr". They now read as words.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('KPI templates name perspectives and functions in words', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `tiw-${stamp}`,
      slug: `tiw-${stamp}`,
      adminFullName: 'Tom Admin',
      adminEmail: `admin-${stamp}@tiw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  await page.goto('/kpis/templates');
  const options = (await page.getByTestId('tmpl-function').locator('option').allTextContents()).map((t) => t.trim());
  expect(options).toEqual(['All functions', 'Finance', 'Sales', 'Marketing', 'Operations', 'HR', 'Support', 'Engineering']);

  const main = page.getByRole('main');
  await expect(main.getByText('Internal process').first()).toBeVisible();
  for (const key of ['INTERNAL_PROCESS', 'LEARNING_GROWTH', 'FINANCIAL', 'CUSTOMER']) {
    await expect(main.getByText(key, { exact: true })).toHaveCount(0);
  }
});
