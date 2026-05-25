import { expect, test } from '@playwright/test';

test('landing page loads with brand and tagline', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'KPI Nexus', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Measure what matters.')).toBeVisible();
});
