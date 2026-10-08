/**
 * UC-02 e2e — Manage User Roles happy-path.
 *
 * Register an org, sign in, navigate to /roles, create a custom role,
 * see it appear in the list, delete it, confirm it's gone.
 *
 * Requires the api at $API_URL (default http://localhost:4000); skips
 * with a console warning if unreachable.
 */
import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable at ${API_URL} — UC-02 e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signInAsFreshAdmin(page: Page): Promise<{ email: string }> {
  const stamp = suffix();
  const slug = `uc02-${stamp}`;
  const email = `${stamp}@uc02.test.local`;
  const password = 'correct-horse-battery-staple';

  await page.goto('/register');
  await page.getByLabel('Organization name').fill(`uc02-${stamp}`);
  await page.getByLabel('URL slug').fill(slug);
  await page.getByLabel('Your full name').fill('UC-02 Admin');
  await page.getByLabel('Your email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /create organization/i }).click(),
  ]);
  await expect(page).toHaveURL(/\/dashboard$/);
  return { email };
}


/** The roles page is master/detail: a row selects the role; actions live in the detail panel. */
async function selectRole(page: Page, name: string): Promise<void> {
  await page.getByTestId(`role-row-${name}`).getByRole('button').click();
  // Substring match — the heading also carries an "admin" badge for admin roles.
  await expect(page.getByRole('heading', { name: `Permission matrix · ${name}` })).toBeVisible();
}

/** The create form is collapsed behind the header's "New role" button. */
async function openCreateForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^new role$/i }).click();
  await expect(page.locator('#role-name')).toBeVisible();
}

test.describe('UC-02: Manage User Roles happy-path', () => {
  test('sign in → /roles → create custom role → delete → gone', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await signInAsFreshAdmin(page);

    // Navigate to /roles — the dashboard nav link points there
    await page.goto('/roles');
    await expect(page.getByRole('heading', { name: /^Roles$/ })).toBeVisible();

    // Default seed: Admin / Manager / Employee / Viewer rows are present
    await expect(page.getByTestId('role-row-Admin')).toBeVisible();
    await expect(page.getByTestId('role-row-Manager')).toBeVisible();
    await expect(page.getByTestId('role-row-Employee')).toBeVisible();
    await expect(page.getByTestId('role-row-Viewer')).toBeVisible();

    // Admin role displays the "admin" badge
    const adminRow = page.getByTestId('role-row-Admin');
    await expect(adminRow.getByText('admin', { exact: true })).toBeVisible();

    // Create a custom role
    const customName = `Field Engineer ${suffix()}`;
    await openCreateForm(page);
    await page.locator('#role-name').fill(customName);
    await page.locator('#role-desc').fill('Custom role made by UC-02 e2e');

    const createResp = page.waitForResponse(
      (r) => r.url().endsWith('/roles') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Create$/ }).click();
    expect((await createResp).status()).toBe(201);

    // The new row shows up; selecting it shows the description in the detail panel
    const customRow = page.getByTestId(`role-row-${customName}`);
    await expect(customRow).toBeVisible();
    await selectRole(page, customName);
    await expect(page.getByText('Custom role made by UC-02 e2e')).toBeVisible();

    // Delete it
    const deleteResp = page.waitForResponse(
      (r) =>
        r.url().includes('/roles/') &&
        r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: `Delete ${customName}`, exact: true }).click();
    expect((await deleteResp).status()).toBe(204);

    // Row is gone
    await expect(customRow).toHaveCount(0);
  });

  test('cannot delete the seeded Admin role (still has the admin user)', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await signInAsFreshAdmin(page);
    await page.goto('/roles');
    await expect(page.getByRole('heading', { name: /^Roles$/ })).toBeVisible();

    await selectRole(page, 'Admin');
    const deleteResp = page.waitForResponse(
      (r) => r.url().includes('/roles/') && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Delete Admin', exact: true }).click();
    const resp = await deleteResp;
    expect(resp.status()).toBe(409);
    await expect(page.getByRole('alert').filter({ hasText: /still has/i })).toBeVisible();

    // The Admin row must still be present — the api refused the delete.
    await expect(page.getByTestId('role-row-Admin')).toBeVisible();
  });

  test('reject duplicate role name — POST returns 409', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await signInAsFreshAdmin(page);
    await page.goto('/roles');
    await expect(page.getByTestId('role-row-Manager')).toBeVisible();

    await openCreateForm(page);
    await page.locator('#role-name').fill('Manager'); // already seeded

    const createResp = page.waitForResponse(
      (r) => r.url().endsWith('/roles') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Create$/ }).click();
    expect((await createResp).status()).toBe(409);
  });

  test('apply VIEWER preset to Employee role → success feedback appears', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await signInAsFreshAdmin(page);
    await page.goto('/roles');

    // Wait for the role list and preset selects to load
    await expect(page.getByTestId('role-row-Employee')).toBeVisible();
    await selectRole(page, 'Employee');

    // The preset select should appear once presets are fetched
    const presetSelect = page.getByTestId('preset-select-Employee');
    await expect(presetSelect).toBeVisible({ timeout: 5000 });

    // Select the VIEWER preset (by value — Playwright selectOption label does not accept regex)
    await presetSelect.selectOption({ value: 'VIEWER' });

    // Click Apply and wait for the apply-preset API call
    const applyResp = page.waitForResponse(
      (r) => r.url().includes('/roles/') && r.url().includes('/apply-preset') && r.request().method() === 'POST',
    );
    await page.getByTestId('preset-apply-Employee').click();
    const resp = await applyResp;
    // API returns 200 or 201 depending on implementation
    expect([200, 201]).toContain(resp.status());

    // Success feedback must appear in the Employee detail panel
    const feedback = page.getByTestId('preset-feedback-Employee');
    await expect(feedback).toBeVisible({ timeout: 5000 });
    await expect(feedback).toContainText(/preset applied/i);
  });
});
