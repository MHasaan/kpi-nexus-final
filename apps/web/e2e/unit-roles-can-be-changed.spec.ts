/**
 * Manual QA (2026-11-19, F-005): a member's role in a unit could not be changed once set; the only way was
 * Remove and re-add. The Teams page now offers the role on each member's row.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("a member's unit role can be changed in place, and the change holds", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ur-${stamp}`,
      slug: `ur-${stamp}`,
      adminFullName: 'Uma Admin',
      adminEmail: `admin-${stamp}@ur.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const unitName = `Sales ${stamp}`;
  const unit = (await (await api.post('/org-units', { data: { name: unitName } })).json()) as { id: string };
  expect((await api.post(`/org-units/${unit.id}/members`, { data: { userId: me.user.id, memberRole: 'MEMBER' } })).status()).toBe(201);

  await page.goto('/org-units');
  await page.getByTestId(`unit-row-${unitName}`).getByTestId(`expand-unit-${unitName}`).click();
  const role = page.getByTestId(`member-role-${me.user.id}`);
  await expect(role).toHaveValue('MEMBER');
  await role.selectOption('MANAGER');
  await expect(role).toHaveValue('MANAGER');

  await expect
    .poll(async () => {
      const members = (await (await api.get(`/org-units/${unit.id}/members`)).json()) as Array<{ userId: string; memberRole: string }>;
      return members.find((m) => m.userId === me.user.id)?.memberRole;
    })
    .toBe('MANAGER');
  await page.reload();
  await page.getByTestId(`unit-row-${unitName}`).getByTestId(`expand-unit-${unitName}`).click();
  await expect(page.getByTestId(`member-role-${me.user.id}`)).toHaveValue('MANAGER');
});
