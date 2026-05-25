/**
 * UC-01 e2e — full happy-path: register → dashboard → sign out → sign in.
 *
 * Requires the api to be reachable at $API_URL (default http://localhost:4000).
 * Auto-skips with a clear console message if the api isn't up so CI gates
 * that haven't booted the api still pass.
 *
 *   pnpm docker:up
 *   pnpm db:setup
 *   pnpm --filter @kpi-nexus/api start     # one terminal
 *   pnpm --filter @kpi-nexus/web test:e2e  # another (web auto-starts)
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
    console.warn(`[skip] api not reachable at ${API_URL} — UC-01 e2e skipped`);
  }
});

function randomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('UC-01: Login & Authentication happy-path', () => {
  test('register → dashboard → sign out → sign in', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = randomSuffix();
    const orgName = `e2e-uc01-${stamp}`;
    const slug = orgName; // already lowercase + hyphen-safe
    const adminFullName = 'UC-01 Admin';
    const adminEmail = `${stamp}@uc01.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    // 1. Landing — buttons visible
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'KPI Nexus', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /create organization/i }),
    ).toBeVisible();

    // 2. Click "Create organization" → /register
    await page.getByRole('link', { name: /create organization/i }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole('heading', { name: /create your organization/i }),
    ).toBeVisible();

    // 3. Fill register form
    await page.getByLabel('Organization name').fill(orgName);
    // slug auto-derives — wait briefly then verify it's pre-filled
    await expect(page.getByLabel('URL slug')).toHaveValue(slug);
    await page.getByLabel('Your full name').fill(adminFullName);
    await page.getByLabel('Your email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);

    // 4. Submit — wait for the api POST
    const registerResp = page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: /create organization/i })
      .click();
    const resp = await registerResp;
    expect(resp.status()).toBe(201);

    // 5. Land on /dashboard with the user's first name
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: /welcome back, uc-01/i }),
    ).toBeVisible();
    // Email is rendered in both the header and the Email card — use first().
    await expect(page.getByText(adminEmail).first()).toBeVisible();

    // 6. Sign out → /login
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    // 7. Sign in with the same credentials
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPassword);

    const loginResp = page.waitForResponse(
      (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /sign in/i }).click();
    expect((await loginResp).status()).toBe(200);

    // 8. Back on /dashboard
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: /welcome back/i }),
    ).toBeVisible();
  });

  test('login with wrong password surfaces an error and stays on /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@nope.test');
    await page.getByLabel('Password').fill('definitely-wrong');

    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('dashboard without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
