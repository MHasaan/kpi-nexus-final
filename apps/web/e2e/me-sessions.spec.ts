/**
 * Active sessions page — /me/sessions
 *
 * Registers a fresh admin org (which creates at least one session), navigates
 * to /me/sessions, asserts a session row is shown, then clicks "Revoke all
 * other sessions" and asserts success (user stays logged in, success message
 * is displayed).
 *
 * Auto-skips when the api is not reachable so CI stages without the api still
 * pass.
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    // eslint-disable-next-line no-console
    console.warn(`[skip] api not reachable at ${API_URL} — me-sessions e2e skipped`);
  }
});

function randomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('Active sessions page (/me/sessions)', () => {
  test('register → navigate to /me/sessions → list sessions → revoke all others', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = randomSuffix();
    const orgName = `e2e-sessions-${stamp}`;
    const slug = orgName;
    const adminFullName = 'Sessions Admin';
    const adminEmail = `${stamp}@sessions.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    // 1. Register a fresh org → lands on /dashboard
    await page.goto('/register');
    await page.getByLabel('Organization name').fill(orgName);
    await expect(page.getByLabel('URL slug')).toHaveValue(slug);
    await page.getByLabel('Your full name').fill(adminFullName);
    await page.getByLabel('Your email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);

    const registerResp = page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    const resp = await registerResp;
    expect(resp.status()).toBe(201);

    await expect(page).toHaveURL(/\/dashboard$/);

    // 2. Navigate to /me/sessions
    await page.goto('/me/sessions');
    await expect(page.getByTestId('sessions-heading')).toBeVisible();

    // 3. At least one session row should be listed (the one created at register)
    await expect(page.getByTestId('sessions-list')).toBeVisible();
    const rows = page.locator('[data-testid^="session-row-"]');
    await expect(rows.first()).toBeVisible();

    // 4. Click "Revoke all other sessions" — current session is kept
    await page.getByTestId('revoke-all-button').click();

    // 5. Success message should appear
    await expect(page.getByTestId('sessions-success')).toBeVisible();

    // 6. User is still on /me/sessions (still logged in — current session preserved)
    await expect(page).toHaveURL(/\/me\/sessions$/);

    // 7. Session list is still visible (our current session remains)
    await expect(page.getByTestId('sessions-list')).toBeVisible();
  });

  test('unauthenticated access to /me/sessions redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/me/sessions');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('profile page has Manage active sessions link', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = randomSuffix();
    const orgName = `e2e-sessions-link-${stamp}`;
    const slug = orgName;

    await page.goto('/register');
    await page.getByLabel('Organization name').fill(orgName);
    await expect(page.getByLabel('URL slug')).toHaveValue(slug);
    await page.getByLabel('Your full name').fill('Sessions Link Admin');
    await page.getByLabel('Your email').fill(`${stamp}@sessions-link.test.local`);
    await page.getByLabel('Password').fill('correct-horse-battery-staple');

    const registerResp = page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    await registerResp;
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/profile');
    const link = page.getByTestId('manage-sessions-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/me/sessions');
  });
});
