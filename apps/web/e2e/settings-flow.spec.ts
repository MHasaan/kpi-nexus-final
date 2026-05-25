/**
 * UC-11 e2e — Manage Organization Settings happy-path.
 *
 * Register an org, navigate to /settings/organization, change the
 * roleLabel from "Role" to "Permission Tier", save, then visit /roles
 * and confirm the nav link + page heading are now "Permission Tiers".
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
    console.warn(`[skip] api not reachable at ${API_URL} — UC-11 e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function registerAndLand(page: Page): Promise<void> {
  const stamp = suffix();
  const slug = `uc11-${stamp}`;
  const email = `${stamp}@uc11.test.local`;
  const password = 'correct-horse-battery-staple';

  await page.goto('/register');
  await page.getByLabel('Organization name').fill(`uc11-${stamp}`);
  await page.getByLabel('URL slug').fill(slug);
  await page.getByLabel('Your full name').fill('UC-11 Admin');
  await page.getByLabel('Your email').fill(email);
  await page.getByLabel('Password').fill(password);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /create organization/i }).click(),
  ]);
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('UC-11: Manage Organization Settings happy-path', () => {
  test('change roleLabel → nav + headings pick up the new term (pluralized)', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await registerAndLand(page);

    // Navigate to /settings/organization
    await page.goto('/settings/organization');
    await expect(
      page.getByRole('heading', { name: /^Organization settings$/ }),
    ).toBeVisible();

    // Current roleLabel is the seeded default "Role"
    const roleField = page.getByTestId('label-roleLabel');
    await expect(roleField).toHaveValue('Role');

    // Change to "Permission Tier"
    await roleField.fill('Permission Tier');

    // Save and wait for the PATCH response
    const patchResp = page.waitForResponse(
      (r) => r.url().endsWith('/organizations/me') && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: /save changes/i }).click();
    expect((await patchResp).status()).toBe(200);

    // Inline success indicator
    await expect(page.getByTestId('settings-saved')).toBeVisible();

    // The nav link on the SAME page is fed by the terminology context —
    // after refresh() runs inside handleSave, the link text updates.
    await expect(page.getByTestId('nav-roles')).toHaveText('Permission Tiers');

    // Navigate to /roles — its heading + nav both render the custom label
    await page.getByTestId('nav-roles').click();
    await expect(page).toHaveURL(/\/roles$/);
    await expect(page.getByTestId('roles-heading')).toHaveText('Permission Tiers');
    await expect(page.getByTestId('nav-roles')).toHaveText('Permission Tiers');

    // The default roles (Admin/Manager/...) are still listed — the label
    // change is for UI verbiage, not role names.
    await expect(page.getByTestId('role-row-Admin')).toBeVisible();
    await expect(page.getByTestId('role-row-Manager')).toBeVisible();
  });

  test('GET /organizations/me/terminology returns defaults for a fresh org', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await registerAndLand(page);
    await page.goto('/roles');

    // Untouched org → nav link uses the default plural "Roles"
    await expect(page.getByTestId('nav-roles')).toHaveText('Roles');
    await expect(page.getByTestId('roles-heading')).toHaveText('Roles');
  });
});
