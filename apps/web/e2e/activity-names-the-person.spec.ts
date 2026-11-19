/**
 * Flow walk (activity): inviting someone read "created a user", and changing
 * their role "updated a user" — not who. The row now names the person, and
 * leads to them.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('activity names the person a row is about', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `anp-${stamp}`,
      slug: `anp-${stamp}`,
      adminFullName: 'Anwar Admin',
      adminEmail: `admin-${stamp}@anp.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const invited = (await (await api.post('/users', { data: { email: `ina-${stamp}@anp.test.local`, fullName: `Ina ${stamp}` } })).json()) as { user: { id: string } };

  await page.goto('/activity');
  const list = page.getByTestId('activity-list');
  await expect(list).toContainText(`Anwar Admin invited Ina ${stamp}`);
  await expect(list).not.toContainText('created a user');
  await list.getByRole('link', { name: `invited Ina ${stamp}` }).click();
  await expect(page).toHaveURL(new RegExp(`/users/${invited.user.id}$`));
});
