import { expect, test } from '@playwright/test';

test('landing page loads with brand and tagline', async ({ page }) => {
  await page.goto('/');

  // Redesigned landing: the tagline is the H1; the brand sits in the header.
  await expect(
    page.getByRole('heading', { name: 'Measure what matters.', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('KPI Nexus', { exact: true }).first()).toBeVisible();
});
