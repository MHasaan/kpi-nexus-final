/**
 * Flow walk (sessions): every row of "Active sessions" read "Unknown device",
 * and the page's top bar called it "Inbox". A session now carries the browser
 * it was made from, and the page says so in words.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const FIREFOX_ON_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const PASSWORD = 'correct-horse-battery-staple';

test('active sessions say which browser each one is, and the page is called Sessions', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-${stamp}@snd.test.local`;
  const elsewhere = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'user-agent': FIREFOX_ON_WINDOWS } });
  let registered;
  try {
    registered = await elsewhere.post('/auth/register', {
      data: { orgName: `snd-${stamp}`, slug: `snd-${stamp}`, adminEmail: email, adminPassword: PASSWORD, adminFullName: 'Sam Admin' },
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  expect(registered.status()).toBe(201);
  // A second session, made by signing in from this test's own browser.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto('/me/sessions');
  await expect(page.getByRole('banner').getByTestId('top-bar-trail')).toHaveText(/^You\s*\/\s*Sessions$/);
  const rows = page.getByTestId('sessions-list').locator('[data-testid^="session-row-"]');
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('sessions-list')).not.toContainText('Unknown device');
  // The one made elsewhere is named for what it is; this one is marked as this device.
  await expect(rows.filter({ hasText: 'Firefox on Windows' })).toHaveCount(1);
  await expect(rows.filter({ has: page.getByTestId('session-current') })).toContainText(/Chrome on /);
});
