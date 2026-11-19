/**
 * Flow walk (objectives, tasks): the status of an objective and the priority
 * of a task were offered as the stored keys — "AT_RISK", "MEDIUM" — while the
 * same value on a card read "At risk", "Medium". The pickers and the
 * objective's badge now use the same words.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('objective statuses and task priorities are offered in words, not stored keys', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `prw-${stamp}`,
      slug: `prw-${stamp}`,
      adminFullName: 'Pia Admin',
      adminEmail: `admin-${stamp}@prw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const task = (await (await api.post('/tasks', { data: { title: `Chase invoices ${stamp}` } })).json()) as { id: string };

  const words = (testId: string) => page.getByTestId(testId).locator('option').allTextContents();

  await page.goto('/okrs');
  const statuses = ['Draft', 'Active', 'At risk', 'Achieved', 'Missed', 'Archived'];
  expect((await words('okr-create-status')).map((t) => t.trim())).toEqual(statuses);

  await page.getByTestId('okr-create-name').fill(`Grow ${stamp}`);
  await page.getByTestId('okr-create-status').selectOption({ label: 'At risk' });
  await page.getByTestId('okr-create-submit').click();
  const card = page.locator('[data-testid^="okr-row-"]').filter({ hasText: `Grow ${stamp}` }).first();
  await expect(card).toContainText('At risk');
  await expect(card).not.toContainText('AT_RISK');
  expect((await words('okr-filter-status')).map((t) => t.trim())).toEqual(['All statuses', ...statuses]);

  await page.goto('/tasks');
  const priorities = ['Low', 'Medium', 'High', 'Urgent'];
  expect((await words('filter-priority')).map((t) => t.trim())).toEqual(['All priorities', ...priorities]);
  await page.getByTestId(`task-${task.id}`).getByTestId('task-title').click();
  expect((await words('task-detail-priority')).map((t) => t.trim())).toEqual(priorities);
});
