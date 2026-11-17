/**
 * Plan 3.6 step 2 (UI-005): units could only come from a template or the AI.
 * The Structure step builds them by hand: unit types, and units as a tree.
 */
import { type Page, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function enterStructure(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@structure.test.local`);
  await page.getByTestId('signup-org').fill(`Structure ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Structure ${stamp}`, { timeout: 15_000 });
  await page.getByTestId('wizard-step-structure').click();
}

test('wizard structure step: build a unit tree by hand; renames and removals keep it whole; it becomes the real structure', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(90_000);
  const stamp = suffix();
  await enterStructure(page, stamp);

  // Nothing yet: a unit needs a type first, and says so.
  await expect(page.getByTestId('unit-add')).toBeDisabled();
  await page.getByTestId('unit-type-suggest-Department').click();
  await page.getByTestId('unit-type-add').click();
  await page.getByTestId('unit-type-name-1').fill('Squad');

  // Three units: Engineering > Platform (a Squad), and Sales.
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-0').fill('Engineering');
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-1').fill('Platform');
  await page.getByTestId('unit-type-1').selectOption('Squad');
  await page.getByTestId('unit-parent-1').selectOption('Engineering');
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-2').fill('Sales');
  await expect(page.getByTestId('count-orgUnits')).toHaveText('3');

  // A unit is not offered itself, or anything below it, as its parent.
  await expect(page.getByTestId('unit-parent-0').locator('option')).toHaveText(['Top level', 'Sales']);
  // Platform is drawn under Engineering.
  await expect(page.getByTestId('unit-row-1')).toHaveAttribute('data-depth', '1');

  // Renaming Engineering takes Platform with it.
  await page.getByTestId('unit-name-0').fill('Product Engineering');
  await expect(page.getByTestId('unit-parent-1')).toHaveValue('Product Engineering');

  // A type that units use cannot be removed; an unused one can.
  await expect(page.getByTestId('unit-type-remove-0')).toBeDisabled();
  await page.getByTestId('unit-type-add').click();
  await page.getByTestId('unit-type-name-2').fill('Region');
  await page.getByTestId('unit-type-remove-2').click();
  await expect(page.getByTestId('unit-type-name-2')).toHaveCount(0);

  // A duplicate name is flagged on its row, and on the step.
  await page.getByTestId('unit-name-2').fill('platform');
  await expect(page.getByTestId('unit-problem-2')).toContainText('already a unit called');
  await expect(page.getByTestId('wizard-step-problems-structure')).toBeVisible();
  await page.getByTestId('unit-name-2').fill('Sales');
  await expect(page.getByTestId('unit-problem-2')).toHaveCount(0);

  // It is saved: a reload shows the same tree.
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('unit-name-0')).toHaveValue('Product Engineering', { timeout: 15_000 });
  await expect(page.getByTestId('unit-parent-1')).toHaveValue('Product Engineering');

  // Removing Sales just removes it.
  await page.getByTestId('unit-remove-2').click();
  await expect(page.getByTestId('count-orgUnits')).toHaveText('2');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');

  // Finish (an administrator role is added through the API) and look at the real structure.
  const handle = await page.evaluate(() => JSON.parse(window.localStorage.getItem('kpi-nexus.onboarding-draft')!) as { sessionId: string; draftToken: string });
  const anon = await request.newContext({ baseURL: API_URL });
  await anon.put(`/onboarding/${handle.sessionId}`, { headers: { 'x-draft-token': handle.draftToken }, data: { patch: { roles: [{ name: 'Admin', isAdmin: true }] } } });
  await page.goto('/signup/wizard?step=review');
  await expect(page.getByTestId('wizard-ready')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('admin-name').fill('Structure Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`structure-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  await page.goto('/org-units');
  await expect(page.getByTestId('unit-row-Product Engineering')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('unit-row-Platform')).toContainText('Parent: Product Engineering');
});

test('wizard structure step: removing a unit moves the units under it up, not out', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  await enterStructure(page, stamp);
  await page.getByTestId('unit-type-suggest-Department').click();
  for (const [i, name] of ['Company', 'Engineering', 'Platform'].entries()) {
    await page.getByTestId('unit-add').click();
    await page.getByTestId(`unit-name-${i}`).fill(name);
  }
  await page.getByTestId('unit-parent-1').selectOption('Company');
  await page.getByTestId('unit-parent-2').selectOption('Engineering');

  await page.getByTestId('unit-remove-1').click();
  await expect(page.getByTestId('count-orgUnits')).toHaveText('2');
  // Platform (now row 1) sits under Company.
  await expect(page.getByTestId('unit-name-1')).toHaveValue('Platform');
  await expect(page.getByTestId('unit-parent-1')).toHaveValue('Company');
});
