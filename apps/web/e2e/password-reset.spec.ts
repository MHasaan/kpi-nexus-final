/**
 * Forgot / reset password flow (audit BE-007 + FE-018), driven through the UI
 * with the reset email read from Mailhog.
 */
import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';
const MAILHOG = process.env.MAILHOG_URL ?? 'http://127.0.0.1:8025';

async function reachable(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function resetLinkFor(email: string): Promise<string | undefined> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILHOG}/api/v2/search?kind=to&query=${encodeURIComponent(email)}`);
    const data = (await res.json()) as { items: Array<{ Content: { Body: string } }> };
    const body = data.items[0]?.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
    const path = body?.match(/\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0];
    if (path) return path;
    await new Promise((r) => setTimeout(r, 500));
  }
  return undefined;
}

test('forgot password → emailed link → set new password → sign in', async ({ page }) => {
  test.skip(!(await reachable(`${API}/health`)) || !(await reachable(`${MAILHOG}/api/v2/messages?limit=1`)), 'api or mailhog not reachable');

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `ui-reset-${stamp}@e2e.test.local`;
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orgName: `UI Reset ${stamp}`, slug: `ui-reset-${stamp}`, adminEmail: email, adminPassword: 'correct-horse-battery-staple', adminFullName: 'UI Reset' }),
  });
  expect(reg.status).toBe(201);

  // 1. Login page links to the forgot-password form.
  await page.goto('/login');
  await page.getByRole('link', { name: /forgot password/i }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  // 2. Request a link — the confirmation never reveals whether the account exists.
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /send reset link/i }).click();
  await expect(page.getByTestId('forgot-sent')).toBeVisible();

  // 3. Follow the emailed link and choose a new password.
  const link = await resetLinkFor(email);
  expect(link, 'reset email should contain a /reset-password link').toBeDefined();
  await page.goto(link!);
  await page.getByTestId('reset-password').fill('Brand-New-Passw0rd!');
  await page.getByTestId('reset-confirm').fill('Brand-New-Passw0rd!');
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page.getByTestId('reset-done')).toBeVisible();

  // 4. Sign in with the new password.
  await page.getByRole('link', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill('Brand-New-Passw0rd!');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('reset page without a token explains what to do', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: /reset link is missing/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password');
});
