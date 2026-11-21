/**
 * Manual QA (2026-11-20, F-062): two-step sign-in worked end to end, with rough edges: errors said "Invalid TOTP
 * code", the recovery codes could not be copied or downloaded, the raw otpauth:// address was printed as a link,
 * and the sign-in field did not say a recovery code would do. Plain words, and buttons for the codes.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('two-step sign-in speaks plainly: codes can be copied or downloaded, no raw address, a wrong code is said in words', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `mfa-${stamp}`,
      slug: `mfa-${stamp}`,
      adminFullName: 'Noah Admin',
      adminEmail: `admin-${stamp}@mfa.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Security' }).click();
  await page.getByTestId('enable-mfa-button').click();
  await expect(page.getByTestId('mfa-enrollment-panel')).toBeVisible();

  // The key is shown; the otpauth address opens the app but is not printed.
  const open = page.getByTestId('mfa-otpauth-url');
  expect(await open.getAttribute('href')).toMatch(/^otpauth:\/\/totp\//);
  await expect(open).not.toContainText('otpauth://');

  // The recovery codes can be copied or downloaded.
  await expect(page.getByTestId('mfa-recovery-code')).toHaveCount(10);
  const recoveryCodes = await page.getByTestId('mfa-recovery-code').allTextContents();
  await expect(page.getByTestId('mfa-copy-codes')).toBeVisible();
  const download = page.getByTestId('mfa-download-codes');
  expect(await download.getAttribute('href')).toMatch(/^data:text\/plain/);
  expect(await download.getAttribute('download')).toMatch(/recovery-codes/);

  // A wrong code is refused in words, not in jargon.
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const refused = await api.post('/mfa/confirm', { data: { code: '000000', recoveryCodes } });
  expect(refused.status()).toBe(401);
  const body = (await refused.json()) as { message: string };
  expect(body.message).toMatch(/not right/i);
  expect(body.message).not.toMatch(/TOTP/);
});
