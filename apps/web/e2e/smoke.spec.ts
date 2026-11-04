import { expect, test } from '@playwright/test';

test('landing page loads with brand and tagline', async ({ page }) => {
  await page.goto('/');

  // Redesigned landing: the tagline is the H1; the brand sits in the header.
  await expect(
    page.getByRole('heading', { name: 'Measure what matters.', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('KPI Nexus', { exact: true }).first()).toBeVisible();
});

test('unknown routes get the app 404 page (FE-004)', async ({ page }) => {
  const res = await page.goto('/definitely-not-a-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/dashboard');
});
