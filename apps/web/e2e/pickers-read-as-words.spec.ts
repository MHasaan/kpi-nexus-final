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

  // A picker's options are drawn once its page has loaded. Read them with an assertion that waits for them: a
  // one-off read straight after opening the page found none in about half the runs (2026-11-20).
  const offers = (testId: string, expected: string[]) => expect(page.getByTestId(testId).locator('option')).toHaveText(expected);

  await page.goto('/okrs');
  const statuses = ['Draft', 'Active', 'At risk', 'Achieved', 'Missed', 'Archived'];
  await offers('okr-create-status', statuses);

  await page.getByTestId('okr-create-name').fill(`Grow ${stamp}`);
  await page.getByTestId('okr-create-status').selectOption({ label: 'At risk' });
  await page.getByTestId('okr-create-submit').click();
  const card = page.locator('[data-testid^="okr-row-"]').filter({ hasText: `Grow ${stamp}` }).first();
  await expect(card).toContainText('At risk');
  await expect(card).not.toContainText('AT_RISK');
  await offers('okr-filter-status', ['All statuses', ...statuses]);

  await page.goto('/tasks');
  const priorities = ['Low', 'Medium', 'High', 'Urgent'];
  await offers('filter-priority', ['All priorities', ...priorities]);
  await page.getByTestId(`task-${task.id}`).getByTestId('task-title').click();
  await offers('task-detail-priority', priorities);
});
