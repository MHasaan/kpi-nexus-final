/**
 * Plan 3.6 step 3 (UI-005): roles and positions could only come from a
 * template or the AI. The step builds them by hand, with a permission matrix,
 * and never lets the last administrator role go.
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

async function enterRoles(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@roles.test.local`);
  await page.getByTestId('signup-org').fill(`Roles ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Roles ${stamp}`, { timeout: 15_000 });
  await page.getByTestId('wizard-step-roles').click();
}

test('wizard roles step: standard roles, a custom role with chosen permissions, positions — and they become the real ones', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(90_000);
  const stamp = suffix();
  await enterRoles(page, stamp);

  // No administrator role yet: the step says so.
  await expect(page.getByTestId('wizard-step-problems-roles')).toHaveText('1');
  await page.getByTestId('roles-add-standard').click();
  await expect(page.getByTestId('count-roles')).toHaveText('4');
  await expect(page.getByTestId('wizard-step-problems-roles')).toHaveCount(0);
  await expect(page.getByTestId('roles-add-standard')).toHaveCount(0); // nothing left to add

  // The only administrator role cannot be demoted or removed.
  await expect(page.getByTestId('role-admin-0')).toBeChecked();
  await expect(page.getByTestId('role-admin-0')).toBeDisabled();
  await expect(page.getByTestId('role-remove-0')).toBeDisabled();
  await expect(page.getByTestId('role-card-0')).toContainText('can do everything');

  // Rename one, and build a custom one.
  await page.getByTestId('role-name-2').fill('Staff');
  await page.getByTestId('role-add').click();
  await page.getByTestId('role-name-4').fill('Analyst');
  await page.getByTestId('role-permissions-4').click();
  await page.getByTestId('role-4-perm-KPI_VIEW').check();
  await page.getByTestId('role-4-perm-REPORTS_VIEW').check();
  await page.getByTestId('role-4-group-all-Dashboards').click();
  await expect(page.getByTestId('role-permissions-4')).toContainText('4 of 25');
  await page.getByTestId('role-4-perm-DASHBOARD_MANAGE').uncheck();
  await expect(page.getByTestId('role-permissions-4')).toContainText('3 of 25');

  // Remove the Viewer role.
  await page.getByTestId('role-remove-3').click();
  await expect(page.getByTestId('count-roles')).toHaveText('4');
  await expect(page.getByTestId('role-name-3')).toHaveValue('Analyst');

  // Positions.
  await page.getByTestId('position-add').click();
  await page.getByTestId('position-name-0').fill('Engineer');
  await page.getByTestId('position-add').click();
  await page.getByTestId('position-name-1').fill('Head of Sales');
  await page.getByTestId('position-track-1').selectOption('MANAGEMENT');
  await expect(page.getByTestId('count-positions')).toHaveText('2');

  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('role-name-3')).toHaveValue('Analyst', { timeout: 15_000 });
  await expect(page.getByTestId('position-track-1')).toHaveValue('MANAGEMENT');

  // Finish and look at the real roles.
  await page.getByTestId('wizard-step-review').click();
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
  await page.getByTestId('admin-name').fill('Roles Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`roles-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  const token = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  const roles = (await (await api.get('/roles')).json()) as Array<{ name: string; isAdmin: boolean; permissions: string[] }>;
  expect(roles.map((r) => r.name).sort()).toEqual(['Admin', 'Analyst', 'Manager', 'Staff']);
  expect(roles.find((r) => r.name === 'Analyst')!.permissions.sort()).toEqual(['DASHBOARD_VIEW', 'KPI_VIEW', 'REPORTS_VIEW']);
  expect(roles.find((r) => r.name === 'Staff')!.permissions).toContain('KPI_DATA_ENTRY');
  const positions = (await (await api.get('/positions')).json()) as Array<{ name: string; track: string | null }>;
  expect(positions.map((p) => [p.name, p.track]).sort()).toEqual([['Engineer', 'IC'], ['Head of Sales', 'MANAGEMENT']]);
});

test('wizard roles step: with two administrator roles either can be demoted; the last one cannot', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await enterRoles(page, suffix());
  await page.getByTestId('role-add').click();
  await page.getByTestId('role-name-0').fill('Owner');
  await page.getByTestId('role-admin-0').check();
  await page.getByTestId('role-add').click();
  await page.getByTestId('role-name-1').fill('IT Admin');
  await page.getByTestId('role-admin-1').check();

  await expect(page.getByTestId('role-admin-0')).toBeEnabled();
  await page.getByTestId('role-admin-0').uncheck();
  await expect(page.getByTestId('role-admin-1')).toBeDisabled();
  await expect(page.getByTestId('role-remove-1')).toBeDisabled();
  await expect(page.getByTestId('role-remove-0')).toBeEnabled();
});
