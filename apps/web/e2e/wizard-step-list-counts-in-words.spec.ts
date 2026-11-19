/**
 * Flow walk (first use): the list of steps beside the setup wizard read
 * "1 units", "1 categories", "1 people". One of something is now written as one.
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the wizard step list writes one of something as one', async ({ page }) => {
  let up = false;
  try {
    up = (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    up = false;
  }
  test.skip(!up, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@counts.test.local`);
  await page.getByTestId('signup-org').fill(`Counts ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Counts ${stamp}`, { timeout: 15_000 });

  const structure = page.getByTestId('wizard-step-structure');
  await structure.click();
  await expect(structure).toContainText('0 units');
  await page.getByTestId('unit-type-suggest-Department').click();
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-0').fill('Sales');
  await expect(structure).toContainText('1 unit');
  await expect(structure).not.toContainText('1 units');
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-1').fill('Warehouse');
  await expect(structure).toContainText('2 units');
});
