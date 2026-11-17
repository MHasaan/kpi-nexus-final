/**
 * UI-016: the invite form could set a role and nothing else — no manager, no
 * position — and said "Invite created — share the accept URL" whether or not
 * the email had gone out, so nobody knew if the person had been told.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('an invitation can set the manager and position, and says the email went out', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string; adminFullName: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `invform-${stamp}`,
      slug: `invform-${stamp}`,
      adminFullName: 'Invite Admin',
      adminEmail: `admin-${stamp}@invform.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });
  const position = (await (await api.post('/positions', { data: { name: `Analyst ${stamp}`, track: 'IC' } })).json()) as { id: string };
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const email = `nadia-${stamp}@invform.test.local`;

  await page.goto('/users');
  await page.getByTestId('invite-email-input').fill(email);
  await page.getByTestId('invite-name-input').fill('Nadia Karim');
  await page.getByTestId('invite-manager-select').selectOption({ label: 'Invite Admin' });
  await page.getByTestId('invite-position-select').selectOption({ label: `Analyst ${stamp}` });
  await page.getByTestId('invite-submit-button').click();

  // Told plainly that the email went out, and to whom.
  const toast = page.getByTestId('toast').filter({ hasText: 'Invitation sent' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(email);

  // The row shows who they report to, and the API agrees on both.
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row).toContainText('Invite Admin');
  const users = (await (await api.get('/users')).json()) as Array<{ email: string; managerId: string | null; positionId: string | null }>;
  const invited = users.find((u) => u.email === email);
  expect(invited?.managerId).toBe(me.user.id);
  expect(invited?.positionId).toBe(position.id);

  // The pickers reset with the rest of the form.
  await expect(page.getByTestId('invite-manager-select')).toHaveValue('');
  await expect(page.getByTestId('invite-position-select')).toHaveValue('');
});
