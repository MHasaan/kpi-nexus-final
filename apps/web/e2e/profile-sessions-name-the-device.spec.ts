/**
 * Flow walk (the invited person): on Account settings → Security, "Active
 * sessions" showed each session's raw browser string ("Mozilla/5.0 (X11; Linux
 * x86_64) AppleWebKit/…"), and that long line pushed the whole tab off the
 * right-hand side: the "Not enabled" badge and the sign-out button were cut.
 * It now names the device as the Sessions page does, and fits.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test("the profile's session list names the device and stays on the page", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-${stamp}@psd.test.local`;
  const anon = await request.newContext({ baseURL: API_URL });
  let registered;
  try {
    registered = await anon.post('/auth/register', {
      data: { orgName: `psd-${stamp}`, slug: `psd-${stamp}`, adminEmail: email, adminPassword: PASSWORD, adminFullName: 'Pia Admin' },
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  expect(registered.status()).toBe(201);
  // A session made from a real browser: it carries a long browser string.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Security' }).click();
  const list = page.getByTestId('sessions-list');
  await expect(list).toContainText(/Chrome on /);
  await expect(list).not.toContainText('Mozilla/5.0');
  await expect(list.getByTestId('session-current')).toHaveText('This device');

  // Nothing runs off the side: the page does not scroll sideways, and the sign-out button is whole.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const main = (await page.getByRole('main').boundingBox())!;
  const button = (await page.getByTestId('revoke-all-button').boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(main.x + main.width);
});
