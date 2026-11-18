/**
 * Plan 6.5: the password policy's maximum age was saved and never enforced.
 * Sign-in now answers 401 PASSWORD_EXPIRED for a password that is too old
 * (covered in `auth.service.spec.ts`; a password cannot be aged through the
 * API, so the answer is stood in for here). The page offers a reset link.
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('sign-in: an expired password offers a reset link, which is really sent', async ({ page }) => {
  const up = await page.request.get(`${API_URL}/health`).catch(() => null);
  test.skip(!up?.ok(), 'api not reachable');

  await page.route('**/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PASSWORD_EXPIRED', message: 'Your password has expired. Reset it to sign in.' }),
    }),
  );

  await page.goto('/login');
  await page.locator('input[type="email"]').fill('someone@example.test');
  await page.locator('input[type="password"]').fill('an-old-password');
  await page.locator('button[type="submit"]').click();

  await expect(page.getByRole('alert').filter({ hasText: 'Your password has expired' })).toBeVisible();
  const asked = page.waitForResponse((r) => r.url().includes('/auth/password/request-reset') && r.request().method() === 'POST');
  await page.getByTestId('login-send-reset').click();
  expect((await asked).ok()).toBeTruthy();
  await expect(page.getByTestId('login-reset-sent')).toContainText('someone@example.test');
  await expect(page.getByTestId('login-send-reset')).toHaveCount(0);
});
