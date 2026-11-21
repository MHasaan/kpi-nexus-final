/**
 * Manual QA (2026-11-19, F-006): Teams → expand a unit → Remove beside a member removed them at once, while
 * every other destructive action in the app asks first. Removing a member now asks, by name.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('removing a member from a unit asks first, by name', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rm-${stamp}`,
      slug: `rm-${stamp}`,
      adminFullName: 'Rita Admin',
      adminEmail: `admin-${stamp}@rm.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const me = ((await (await api.get('/auth/me')).json()) as { user: { id: string } }).user;
  const unitName = `Sales ${stamp}`;
  const unit = (await (await api.post('/org-units', { data: { name: unitName } })).json()) as { id: string };
  expect((await api.post(`/org-units/${unit.id}/members`, { data: { userId: me.id, memberRole: 'MEMBER' } })).status()).toBe(201);

  await page.goto('/org-units');
  await page.getByTestId(`expand-unit-${unitName}`).click();
  const row = page.getByTestId(`unit-member-${me.id}`);
  await expect(row).toBeVisible();

  // Asked first; No keeps them.
  await page.getByTestId(`remove-member-${me.id}`).click();
  const dialog = page.getByTestId('remove-member-confirm');
  await expect(dialog).toContainText('Rita Admin');
  await expect(dialog).toContainText(unitName);
  await page.getByTestId('remove-member-confirm-cancel').click();
  await expect(row).toBeVisible();

  // Yes removes them.
  await page.getByTestId(`remove-member-${me.id}`).click();
  await page.getByTestId('remove-member-confirm-confirm').click();
  await expect(row).toHaveCount(0);
});
