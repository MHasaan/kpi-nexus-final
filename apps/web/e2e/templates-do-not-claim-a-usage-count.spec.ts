/**
 * Manual QA (2026-11-19, F-025): the KPI templates library showed "Used 980×" and "Used 760×" on a brand-new
 * organisation — numbers that came with the built-in catalogue, not from anyone here. A built-in template no
 * longer claims a usage count; a template this organisation made keeps its own.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('built-in templates show no usage count on a new organisation', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `tmpl-${stamp}`,
      slug: `tmpl-${stamp}`,
      adminFullName: 'Tess Admin',
      adminEmail: `admin-${stamp}@tmpl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/kpis/templates');
  const useButtons = page.locator('[data-testid^="tmpl-use-"]');
  await expect(useButtons.first()).toBeVisible();
  expect(await useButtons.count()).toBeGreaterThan(3);
  await expect(page.locator('[data-testid^="tmpl-popularity-"]')).toHaveCount(0);
  await expect(page.getByText(/Used \d+×/)).toHaveCount(0);
});
