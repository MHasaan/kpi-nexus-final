/**
 * UI-010: a person's role, manager and position were fixed at the moment they
 * were invited — /users had no way to change any of them, so a reporting line
 * could never be set up and /team stayed empty.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("a person's role, manager and name can be changed from the directory", async ({ page }) => {
  const stamp = suffix();
  const adminEmail = `admin-${stamp}@usersedit.test.local`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `usersedit-${stamp}`,
      slug: `usersedit-${stamp}`,
      adminFullName: 'Edit Admin',
      adminEmail,
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
  const invite = async (name: string) => {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}-${stamp}@usersedit.test.local`;
    const res = (await (await api.post('/users', { data: { email, fullName: name } })).json()) as { user: { id: string } };
    return { id: res.user.id, email };
  };
  const lead = await invite('Lena Lead');
  const dev = await invite('Dev Person');

  await page.goto('/users');
  await page.getByTestId(`user-edit-${dev.email}`).click();
  const panel = page.getByTestId('user-edit-panel');
  await expect(panel).toContainText('Dev Person');
  await panel.getByTestId('user-edit-name').fill('Devi Person');
  await panel.getByTestId('user-edit-manager').selectOption({ label: 'Lena Lead' });
  await panel.getByTestId('user-edit-role').selectOption({ label: 'Employee' });
  await panel.getByTestId('user-edit-save').click();

  await expect(page.getByTestId('toast').filter({ hasText: 'Changes saved' })).toBeVisible();
  await expect(panel).toBeHidden();
  const row = page.getByTestId(`user-row-${dev.email}`);
  await expect(row).toContainText('Devi Person');
  await expect(row).toContainText('Lena Lead');
  await expect(row).toContainText('Employee');
  const saved = (await (await api.get(`/users/${dev.id}`)).json()) as { fullName: string; managerId: string | null };
  expect(saved.fullName).toBe('Devi Person');
  expect(saved.managerId).toBe(lead.id);

  // A reporting loop is refused, and the reason is shown where the edit was made.
  await page.getByTestId(`user-edit-${lead.email}`).click();
  await panel.getByTestId('user-edit-manager').selectOption({ label: 'Devi Person' });
  await panel.getByTestId('user-edit-save').click();
  await expect(panel.getByTestId('user-edit-error')).toBeVisible();
  await expect(panel).toBeVisible();
  expect(((await (await api.get(`/users/${lead.id}`)).json()) as { managerId: string | null }).managerId).toBeNull();

  // Nobody is offered themselves as their own manager, and you cannot change your own role.
  await page.getByTestId(`user-edit-${adminEmail}`).click();
  await expect(panel.getByTestId('user-edit-manager').locator('option', { hasText: 'Edit Admin' })).toHaveCount(0);
  await expect(panel.getByTestId('user-edit-role')).toBeDisabled();
});
