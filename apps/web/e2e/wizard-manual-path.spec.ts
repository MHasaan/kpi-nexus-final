/**
 * Batch 3 exit check (UI-005): an organisation built entirely by hand — no
 * template, no AI — through every step of the wizard, then found in the app:
 * two roles, two units, a per-unit KPI and one invited person.
 *
 * And the P6 exit numbers: the rich template plus hand edits still finishes
 * with the depth it promises (10 roles / 14 positions / 11 units / 20 KPIs / 5
 * categories) plus what was added.
 */
import { expect, request, test } from '@playwright/test';

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

test('wizard, by hand: sign up → six steps → an organisation with roles, units, a per-unit KPI and an invited person', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(120_000);
  const stamp = suffix();
  const adminEmail = `admin-${stamp}@manual.test.local`;
  const inviteEmail = `rae-${stamp}@manual.test.local`;

  // Sign-up.
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(adminEmail);
  await page.getByTestId('signup-org').fill(`Manual ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Manual ${stamp}`, { timeout: 15_000 });
  // The co-pilot stays shut: this is the path with no AI.
  if (await page.getByTestId('copilot-rail').isVisible()) await page.getByTestId('copilot-close').click();

  // 1. Organization.
  await page.getByTestId('wizard-org-industry').fill('Logistics');
  await page.getByTestId('wizard-org-currency').selectOption('PKR');
  await page.getByTestId('wizard-continue').click();

  // 2. Structure: Operations > Dispatch.
  await expect(page).toHaveURL(/step=structure/);
  await page.getByTestId('unit-type-suggest-Department').click();
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-0').fill('Operations');
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-1').fill('Dispatch');
  await page.getByTestId('unit-parent-1').selectOption('Operations');
  await page.getByTestId('wizard-continue').click();

  // 3. Roles: an administrator and a custom one; one position.
  await expect(page).toHaveURL(/step=roles/);
  await page.getByTestId('role-add').click();
  await page.getByTestId('role-name-0').fill('Owner');
  await page.getByTestId('role-admin-0').check();
  await page.getByTestId('role-add').click();
  await page.getByTestId('role-name-1').fill('Dispatcher');
  await page.getByTestId('role-permissions-1').click();
  await page.getByTestId('role-1-perm-KPI_VIEW').check();
  await page.getByTestId('role-1-perm-KPI_DATA_ENTRY').check();
  await page.getByTestId('position-add').click();
  await page.getByTestId('position-name-0').fill('Shift Lead');
  await page.getByTestId('wizard-continue').click();

  // 4. KPIs: one per-unit KPI held by Operations.
  await expect(page).toHaveURL(/step=kpis/);
  await page.getByTestId('kpi-category-suggest-Operations').click();
  await page.getByTestId('kpi-add').click();
  await page.getByTestId('kpi-name-0').fill('On-time Deliveries');
  await page.getByTestId('kpi-details-0').click();
  await page.getByTestId('kpi-scope-0').selectOption('PER_UNIT');
  await page.getByTestId('kpi-type-0').selectOption('PERCENTAGE');
  await page.getByTestId('kpi-unit-0').fill('%');
  await page.getByTestId('kpi-target-0').fill('95');
  await page.getByTestId('kpi-0-unit-Operations').check();
  await page.getByTestId('wizard-continue').click();

  // 5. Team: one person, reporting to me, in Dispatch.
  await expect(page).toHaveURL(/step=team/);
  await page.getByTestId('team-add').click();
  await page.getByTestId('team-email-0').fill(inviteEmail);
  await page.getByTestId('team-name-0').fill('Rae Dispatcher');
  await page.getByTestId('team-role-0').selectOption('Dispatcher');
  await page.getByTestId('team-position-0').selectOption('Shift Lead');
  await page.getByTestId('team-unit-0').selectOption('Dispatch');
  await page.getByTestId('team-manager-0').selectOption({ label: `Me (${adminEmail})` });
  await page.getByTestId('wizard-continue').click();

  // 6. Review: nothing to fix; the numbers are what was built.
  await expect(page).toHaveURL(/step=review/);
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
  await expect(page.getByTestId('count-roles')).toHaveText('2');
  await expect(page.getByTestId('count-orgUnits')).toHaveText('2');
  await expect(page.getByTestId('count-kpis')).toHaveText('1');
  await expect(page.getByTestId('count-team')).toHaveText('1');
  await page.getByTestId('admin-name').fill('Manual Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`manual-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByTestId('toast').filter({ hasText: `Manual ${stamp} is ready` })).toContainText('One invitation was sent.');

  // The setup checklist already knows a teammate was invited.
  await expect(page.getByTestId('checklist-progress')).toHaveText('1 of 14 complete', { timeout: 15_000 });

  // Found in the app.
  await page.goto('/roles');
  await expect(page.getByText('Dispatcher').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Owner').first()).toBeVisible();

  await page.goto('/org-units');
  await expect(page.getByTestId('unit-row-Operations')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('unit-row-Dispatch')).toContainText('Parent: Operations');
  // Dispatch inherits the KPI from Operations, and Rae is a member of it.
  await page.getByTestId('expand-unit-Dispatch').click();
  await expect(page.getByTestId('unit-kpis-panel')).toContainText('On-time Deliveries');
  await expect(page.getByTestId('unit-kpis-panel')).toContainText('Inherited from Operations');
  await expect(page.getByTestId('members-panel-Dispatch')).toContainText('Rae Dispatcher');

  await page.goto('/kpis');
  await expect(page.getByText('On-time Deliveries').first()).toBeVisible({ timeout: 15_000 });

  await page.goto('/users');
  const row = page.getByTestId(`user-row-${inviteEmail}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByTestId('user-status-badge')).toHaveText(/invited/i);
  await expect(row).toContainText('Manual Admin'); // reports to me
  await expect(row).toContainText('Dispatcher');

  await page.goto('/team');
  await expect(page.getByTestId('team-list')).toContainText('Rae Dispatcher', { timeout: 15_000 });

  // And the organisation's own settings took.
  const token = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  expect(await (await api.get('/organizations/me')).json()).toMatchObject({ name: `Manual ${stamp}`, industry: 'Logistics', currency: 'PKR' });
});

test('wizard, template plus edits: the rich template keeps its depth and gains what was added by hand', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(120_000);
  const stamp = suffix();
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@manual.test.local`);
  await page.getByTestId('signup-org').fill(`Depth ${stamp}`);
  await page.getByTestId('entry-template').click();
  await page.getByTestId('use-template-saas-startup-rich').click();
  await expect(page.getByTestId('count-roles')).toHaveText('10', { timeout: 15_000 });
  await expect(page.getByTestId('count-positions')).toHaveText('14');
  await expect(page.getByTestId('count-orgUnits')).toHaveText('11');
  await expect(page.getByTestId('count-kpis')).toHaveText('20');
  await expect(page.getByTestId('count-kpiCategories')).toHaveText('5');

  // One edit by hand on top: an extra unit under the first one.
  await page.getByTestId('wizard-step-structure').click();
  const firstUnit = await page.getByTestId('unit-name-0').inputValue();
  await page.getByTestId('unit-add').click();
  await page.getByTestId('unit-name-11').fill('Night Shift');
  await page.getByTestId('unit-parent-11').selectOption(firstUnit);
  await expect(page.getByTestId('count-orgUnits')).toHaveText('12');

  await page.getByTestId('wizard-step-review').click();
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
  await page.getByTestId('admin-name').fill('Depth Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`depth-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  const token = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  const len = async (path: string) => ((await (await api.get(path)).json()) as unknown[]).length;
  expect(await len('/roles')).toBe(10);
  expect(await len('/positions')).toBe(14);
  expect(await len('/org-units')).toBe(12);
  expect(await len('/kpis')).toBe(20);
  expect(await len('/kpi-categories')).toBe(5);
});
