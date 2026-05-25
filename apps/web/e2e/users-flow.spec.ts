/**
 * /users page e2e — list + invite UI gated by USERS_VIEW / USERS_MANAGE.
 *
 * Admin registers via api → seeds tokens in localStorage → visits /users →
 * sees themselves in the list → fills invite form → sees success URL → the
 * newly invited user appears in the list with INVITED status.
 *
 * Also covers: unauthenticated /users redirects to /login.
 */
import { expect, request, test } from '@playwright/test';

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
    console.warn(`[skip] api not reachable at ${API_URL} — users e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string };
}

test.describe('/users page — list + invite UI', () => {
  test('admin signs in → sees themselves → invites a new user → sees them in the list', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const slug = `users-e2e-${stamp}`;
    const adminEmail = `admin-${stamp}@users-e2e.test.local`;
    const adminPassword = 'correct-horse-battery-staple';
    const inviteeEmail = `invitee-${stamp}@users-e2e.test.local`;
    const inviteeName = 'Test Invitee';

    // 1. Register admin org via the api so we have a known account to sign in as
    const apiCtx = await request.newContext({ baseURL: API_URL });
    const regRes = await apiCtx.post('/auth/register', {
      data: {
        orgName: `Users E2E ${stamp}`,
        slug,
        adminEmail,
        adminPassword,
        adminFullName: 'Users E2E Admin',
      },
    });
    expect(regRes.status()).toBe(201);
    const reg: RegisterResult = await regRes.json();

    // 2. Seed tokens into localStorage so the FE behaves as if signed in
    await page.goto('/');
    await page.evaluate(
      ([accessToken, refreshToken]) => {
        window.localStorage.setItem('kpi-nexus.access-token', accessToken);
        window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
      },
      [reg.accessToken, reg.refreshToken] as const,
    );

    // 3. Navigate to /users — admin should see the page
    await page.goto('/users');
    await expect(page.getByTestId('users-heading')).toBeVisible();

    // The admin (the user we registered) shows up in the list with ACTIVE status
    await expect(page.getByTestId(`user-row-${adminEmail}`)).toBeVisible();
    await expect(
      page.getByTestId(`user-row-${adminEmail}`).getByTestId('user-status-badge'),
    ).toHaveText(/active/i);

    // The invite section is visible (admin has USERS_MANAGE)
    await expect(page.getByTestId('invite-section')).toBeVisible();
    await expect(page.getByTestId('invite-email-input')).toBeVisible();

    // 4. Fill the invite form and submit
    await page.getByTestId('invite-email-input').fill(inviteeEmail);
    await page.getByTestId('invite-name-input').fill(inviteeName);
    // Pick the seeded "Employee" role from the dropdown
    await page.getByTestId('invite-role-select').selectOption({ label: 'Employee' });
    await page.getByTestId('invite-submit-button').click();

    // 5. Success banner with the dev-mode accept URL surfaces
    await expect(page.getByTestId('invite-success')).toBeVisible();
    const acceptUrl = await page.getByTestId('invite-accept-url').textContent();
    expect(acceptUrl).toMatch(/\/accept-invitation\?token=[A-Za-z0-9_-]+$/);

    // 6. The invitee appears in the list with INVITED status
    await expect(page.getByTestId(`user-row-${inviteeEmail}`)).toBeVisible();
    await expect(
      page.getByTestId(`user-row-${inviteeEmail}`).getByTestId('user-status-badge'),
    ).toHaveText(/invited/i);

    // 7. Form fields cleared after submit
    await expect(page.getByTestId('invite-email-input')).toHaveValue('');
    await expect(page.getByTestId('invite-name-input')).toHaveValue('');
  });

  test('/users without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    // Ensure no tokens
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('kpi-nexus.access-token');
      window.localStorage.removeItem('kpi-nexus.refresh-token');
    });

    await page.goto('/users');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('invite with duplicate email shows the api error', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const slug = `users-dup-${stamp}`;
    const adminEmail = `admin-${stamp}@users-dup.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    const apiCtx = await request.newContext({ baseURL: API_URL });
    const regRes = await apiCtx.post('/auth/register', {
      data: {
        orgName: `Users Dup ${stamp}`,
        slug,
        adminEmail,
        adminPassword,
        adminFullName: 'Admin',
      },
    });
    expect(regRes.status()).toBe(201);
    const reg: RegisterResult = await regRes.json();

    await page.goto('/');
    await page.evaluate(
      ([accessToken, refreshToken]) => {
        window.localStorage.setItem('kpi-nexus.access-token', accessToken);
        window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
      },
      [reg.accessToken, reg.refreshToken] as const,
    );

    await page.goto('/users');
    await expect(page.getByTestId('users-heading')).toBeVisible();

    // Try to invite the same email that's already in the org (the admin themselves)
    await page.getByTestId('invite-email-input').fill(adminEmail);
    await page.getByTestId('invite-name-input').fill('Some Name');
    await page.getByTestId('invite-submit-button').click();

    await expect(page.getByTestId('invite-error')).toBeVisible();
    await expect(page.getByTestId('invite-error')).toContainText(/already exists/i);
    // No success banner appeared
    await expect(page.getByTestId('invite-success')).not.toBeVisible();
  });
});
