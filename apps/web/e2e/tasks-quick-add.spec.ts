/**
 * Plan 7.7 (tasks): the quick-add box under each column emptied the moment
 * Enter was pressed — so when the task could not be created, the title that
 * had been typed was gone with it.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('tasks quick-add: a failed add keeps what was typed and says why; a retry works', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `tqa-${stamp}`,
      slug: `tqa-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@tqa.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/tasks');
  const box = page.getByTestId('quick-add-TODO');
  const title = `Call the supplier ${stamp}`;

  // The create fails once.
  await page.route('**/tasks', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'The database is not answering' }) })
      : route.continue(),
  );
  await box.fill(title);
  await box.press('Enter');
  await expect(page.getByTestId('tasks-error')).toContainText('The task was not added: The database is not answering');
  await expect(box).toHaveValue(title); // still there

  // Pressing Enter again, now that it works, creates it and empties the box.
  await page.unroute('**/tasks');
  await box.press('Enter');
  await expect(page.getByTestId('task-title').filter({ hasText: title })).toBeVisible();
  await expect(box).toHaveValue('');
  await expect(page.getByTestId('tasks-error')).toHaveCount(0);
});
