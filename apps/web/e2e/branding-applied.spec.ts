/**
 * Plan 6.3: the organisation's colour, logo and favicon were saved and shown
 * nowhere. The app is now drawn in the colour, and the sidebar carries the
 * organisation's name and logo.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// A 1×1 PNG, so nothing outside the test is fetched.
const LOGO = 'https://logo.test.local/logo.png';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test("branding: the organisation's colour, name and logo are applied", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `Brand ${stamp}`,
      slug: `brd-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@brd.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  await page.route('https://logo.test.local/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim());

  // The sidebar is headed by the organisation's name.
  await page.goto('/settings/branding');
  await expect(page.getByTestId('brand-name')).toHaveText(`Brand ${stamp}`);
  const before = await accent();
  // Nothing chosen yet: the fields are blank, not pre-filled with a colour nobody picked.
  await expect(page.getByTestId('branding-primary-color')).toHaveValue('');

  // A colour white text cannot be read on is refused, by the page and by the API.
  await page.getByTestId('branding-primary-color').fill('#fde047');
  await page.getByTestId('branding-save').click();
  await expect(page.getByTestId('branding-error')).toContainText('too light');
  expect((await api.patch('/organizations/me', { data: { primaryColor: '#fde047' } })).status()).toBe(400);
  expect(await accent()).toBe(before);

  // A usable colour and a logo: applied at once, and still there after a reload.
  await page.getByTestId('branding-primary-color').fill('#7c3aed');
  await page.getByTestId('branding-logo-url').fill(LOGO);
  await page.getByTestId('branding-save').click();
  await expect(page.getByTestId('branding-saved')).toBeVisible();
  await expect.poll(accent).toBe('262 83% 58%');
  await expect(page.getByTestId('brand-logo')).toHaveAttribute('src', LOGO);

  await page.goto('/dashboard');
  await expect.poll(accent).toBe('262 83% 58%');
  await expect(page.getByTestId('brand-logo')).toBeVisible();

  // Cleared: back to the app's own colour.
  await api.patch('/organizations/me', { data: { primaryColor: null, logoUrl: null } });
  await page.reload();
  await expect.poll(accent).toBe(before);
  await expect(page.getByTestId('brand-logo')).toHaveCount(0);
});
