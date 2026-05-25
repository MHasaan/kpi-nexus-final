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
  await page.getByLabel('Password').fill(password);

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /create organization/i }).click(),
  ]);
  await expect(page).toHaveURL(/\/dashboard$/);
  return { email };
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

    // Admin role displays the "admin" badge + "all permissions (bypass)" hint
    const adminRow = page.getByTestId('role-row-Admin');
    await expect(adminRow.getByText('admin')).toBeVisible();

    // Create a custom role
    const customName = `Field Engineer ${suffix()}`;
    await page.getByLabel('Name').fill(customName);
    await page.getByLabel('Description').fill('Custom role made by UC-02 e2e');

    const createResp = page.waitForResponse(
      (r) => r.url().endsWith('/roles') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Create role$/ }).click();
    expect((await createResp).status()).toBe(201);

    // The new row shows up
    const customRow = page.getByTestId(`role-row-${customName}`);
    await expect(customRow).toBeVisible();
    await expect(customRow.getByText('Custom role made by UC-02 e2e')).toBeVisible();

    // Delete it
    const deleteResp = page.waitForResponse(
      (r) =>
        r.url().includes('/roles/') &&
        r.request().method() === 'DELETE',
    );
    await customRow.getByRole('button', { name: new RegExp(`delete ${customName}`, 'i') }).click();
    expect((await deleteResp).status()).toBe(204);

    // Row is gone
    await expect(customRow).toHaveCount(0);
  });

  test('cannot delete the seeded Admin role (still has the admin user)', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await signInAsFreshAdmin(page);
    await page.goto('/roles');
    await expect(page.getByRole('heading', { name: /^Roles$/ })).toBeVisible();

    const adminRow = page.getByTestId('role-row-Admin');
    const deleteResp = page.waitForResponse(
      (r) => r.url().includes('/roles/') && r.request().method() === 'DELETE',
    );
    await adminRow.getByRole('button', { name: /delete admin/i }).click();
    const resp = await deleteResp;
    expect(resp.status()).toBe(409);

    // The Admin row must still be present — the api refused the delete.
    await expect(page.getByTestId('role-row-Admin')).toBeVisible();
  });

  test('reject duplicate role name — POST returns 409', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await signInAsFreshAdmin(page);
    await page.goto('/roles');
    await expect(page.getByTestId('role-row-Manager')).toBeVisible();

    await page.getByLabel('Name').fill('Manager'); // already seeded

    const createResp = page.waitForResponse(
      (r) => r.url().endsWith('/roles') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Create role$/ }).click();
    expect((await createResp).status()).toBe(409);
  });
});
