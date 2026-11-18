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

import { registerOrgViaApi } from './helpers/org';

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
    await registerOrgViaApi(page, {
      orgName: orgName,
      slug: slug,
      adminFullName: adminFullName,
      adminEmail: adminEmail,
      adminPassword: adminPassword,
    });

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

  // Plan 7.7: nothing said which of the listed sessions was the one in use.
  test('the session in use is marked "This device", listed first, and offers to sign out', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = randomSuffix();
    const adminEmail = `${stamp}@sessions-current.test.local`;
    const adminPassword = 'correct-horse-battery-staple';
    await registerOrgViaApi(page, {
      orgName: `e2e-sessions-current-${stamp}`,
      slug: `e2e-sessions-current-${stamp}`,
      adminFullName: 'Sessions Admin',
      adminEmail,
      adminPassword,
    });
    // A second sign-in from somewhere else — newer than the browser's own session.
    const other = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect(other.status).toBe(200);

    await page.goto('/me/sessions');
    const rows = page.locator('[data-testid^="session-row-"]');
    await expect(rows).toHaveCount(2);

    // Exactly one is this device, and it is the first row although it is the older session.
    await expect(page.getByTestId('session-current')).toHaveCount(1);
    await expect(rows.first().getByTestId('session-current')).toHaveText('This device');
    await expect(rows.first().getByRole('button')).toHaveText('Sign out');
    await expect(rows.nth(1).getByRole('button')).toHaveText('Revoke');

    // Revoking the other one leaves this device signed in.
    await rows.nth(1).getByRole('button').click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('session-current')).toHaveCount(1);
    await expect(page).toHaveURL(/\/me\/sessions$/);
  });

  test('unauthenticated access to /me/sessions redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/me/sessions');
    await expect(page).toHaveURL(/\/login\?next=%2Fme%2Fsessions$/);
  });

  test('profile page has Manage active sessions link', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = randomSuffix();
    const orgName = `e2e-sessions-link-${stamp}`;
    const slug = orgName;

    await registerOrgViaApi(page, {
      orgName: orgName,
      slug: slug,
      adminFullName: 'Sessions Link Admin',
      adminEmail: `${stamp}@sessions-link.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });

    await page.goto('/profile');
    // The sessions section (and its "full session manager" link) lives under the
    // Security tab on the rebuilt Account-settings page.
    await page.getByRole('tab', { name: 'Security' }).click();
    const link = page.getByTestId('manage-sessions-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/me/sessions');
  });
});
