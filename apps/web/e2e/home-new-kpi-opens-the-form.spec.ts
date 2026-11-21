/**
 * Flow walk: the "New KPI" button on the home page — in its top bar, and in the
 * empty state a new organisation lands on — opened the KPI list, where the
 * button had to be found and pressed again. It now opens the new-KPI form.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the home page’s New KPI opens the new-KPI form', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `hnk-${stamp}`,
      slug: `hnk-${stamp}`,
      adminFullName: 'Hamid Admin',
      adminEmail: `admin-${stamp}@hnk.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-empty')).toBeVisible();
  const buttons = page.getByTestId('dashboard-new-kpi');
  await expect(buttons.first()).toBeVisible();
  for (const href of await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('href')))) {
    expect(href).toBe('/kpis/new');
  }
  await buttons.first().click();
  await expect(page).toHaveURL(/\/kpis\/new$/);
  await expect(page.getByTestId('kpi-name')).toBeVisible();
});
