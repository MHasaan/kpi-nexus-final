/**
 * Flow walk (tasks): the round "?" help button floated over the bottom-right
 * corner of every page — exactly where the task drawer keeps its Save button,
 * and the comments drawer its Send. A click on Save opened help instead.
 * Help now sits in the top bar with the other page tools, over nothing.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a task opened from the board can be changed and saved; help is in the top bar', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `tds-${stamp}`,
      slug: `tds-${stamp}`,
      adminFullName: 'Tess Admin',
      adminEmail: `admin-${stamp}@tds.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const task = (await (await api.post('/tasks', { data: { title: `Call the bank ${stamp}` } })).json()) as { id: string };

  await page.goto('/tasks');
  await page.getByTestId(`task-${task.id}`).getByTestId('task-title').click();
  const drawer = page.getByTestId('task-detail');
  await expect(drawer).toBeVisible();

  // Nothing lies over the Save button: the point at its middle is the button itself.
  const save = page.getByTestId('task-detail-save');
  const onTop = await save.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  });
  expect(onTop).toBe(true);

  await page.getByTestId('task-detail-title').fill(`Call the bank today ${stamp}`);
  await save.click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId(`task-${task.id}`).getByTestId('task-title')).toHaveText(`Call the bank today ${stamp}`);

  // Help is one of the top bar's tools, and still opens.
  const help = page.getByRole('banner').getByTestId('help-drawer-trigger');
  await expect(help).toBeVisible();
  await help.click();
  await expect(page.getByTestId('help-drawer-title')).toBeVisible();
});
