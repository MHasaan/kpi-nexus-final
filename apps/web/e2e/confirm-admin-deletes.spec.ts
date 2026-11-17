/**
 * X-01 (plan 7.1, part 3): deleting a role, a task from its card, a widget, a
 * position, a unit, a connector, a plugin or a webhook, revoking an API key or
 * a SCIM token and disconnecting an integration all acted on one click. The
 * task card's × was also invisible until hovered — unreachable by touch.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('deleting a role or a task asks first; the task card’s delete is visible without hovering', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cad-${stamp}`,
      slug: `cad-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@cad.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const role = (await (await api.post('/roles', { data: { name: `Temp ${stamp}`, permissions: ['KPI_VIEW'] } })).json()) as { id: string };
  const task = (await (await api.post('/tasks', { data: { title: `Chase invoices ${stamp}`, priority: 'LOW' } })).json()) as { id: string };

  // A role: the dialog names it; Cancel keeps it; confirming deletes it.
  await page.goto('/roles');
  await page.getByTestId(`role-row-Temp ${stamp}`).getByRole('button').click();
  const deleteRole = page.getByRole('button', { name: `Delete Temp ${stamp}` });
  await deleteRole.click();
  const roleDialog = page.getByTestId('role-delete-confirm');
  await expect(roleDialog).toContainText(`Delete the role “Temp ${stamp}”?`);
  await roleDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(((await (await api.get('/roles')).json()) as Array<{ id: string }>).some((r) => r.id === role.id)).toBe(true);
  await deleteRole.click();
  await page.getByTestId('role-delete-confirm-confirm').click();
  await expect(page.getByTestId(`role-row-Temp ${stamp}`)).toHaveCount(0);

  // A task card: the × can be seen without a mouse over it, and asks before deleting.
  await page.goto('/tasks');
  const card = page.getByTestId(`task-${task.id}`);
  const remove = card.getByRole('button', { name: 'Delete task' });
  await page.mouse.move(0, 0);
  expect(Number(await remove.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.3);
  await remove.click();
  const taskDialog = page.getByTestId('task-delete-confirm');
  await expect(taskDialog).toContainText(`Chase invoices ${stamp}`);
  await taskDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toBeVisible();
  await remove.click();
  await page.getByTestId('task-delete-confirm-confirm').click();
  await expect(card).toHaveCount(0);
});
