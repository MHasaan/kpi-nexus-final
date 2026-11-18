/**
 * Plan 6.5: the accept-invitation page said "At least 8 characters" whatever
 * the organisation's policy was, and a refused password named no rule (the
 * reset page printed "[object Object]"). The policy page sent a blank minimum
 * length to the API, which answered "Invalid request body".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("password rules: the invitation page states the organisation's rules and names the ones a password breaks", async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pwr-${stamp}`,
      slug: `pwr-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@pwr.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });

  // The policy page refuses a blank minimum length itself, naming the field.
  await page.goto('/settings/password-policy');
  await page.getByTestId('password-policy-min-length').fill('');
  await page.getByTestId('password-policy-save').click();
  await expect(page.getByTestId('password-policy-error')).toContainText('Minimum length must be a whole number from 6 to 128');

  // A stricter policy, then an invitation.
  await page.getByTestId('password-policy-min-length').fill('12');
  await page.getByTestId('password-policy-requireDigit').check();
  await page.getByTestId('password-policy-save').click();
  await expect(page.getByTestId('password-policy-saved')).toBeVisible();
  const invited = (await (await api.post('/users', { data: { email: `new-${stamp}@pwr.test.local`, fullName: 'Nia New' } })).json()) as { inviteToken: string };

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/accept-invitation?token=${encodeURIComponent(invited.inviteToken)}`);
  await expect(guest.getByText('Needs at least 12 characters, a digit.')).toBeVisible();
  await guest.getByTestId('invite-password').fill('shortpass');
  await guest.getByTestId('invite-confirm-password').fill('shortpass');
  await guest.locator('button[type="submit"]').click();
  await expect(guest.getByRole('alert').filter({ hasText: 'The password must be at least 12 characters and must contain a digit.' })).toBeVisible();
  await guest.context().close();
});
