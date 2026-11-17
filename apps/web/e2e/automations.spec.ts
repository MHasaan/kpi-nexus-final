/**
 * UI-007: "Create automation" always failed — the page sent a trigger name,
 * a rule and an action the API does not have — and took a KPI as a typed id.
 * An automation made on the page now fires, and can be paused, run by hand,
 * edited and deleted.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('an automation made on the page creates a task when its KPI crosses the line', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `auto-${stamp}`,
      slug: `auto-${stamp}`,
      adminFullName: 'Auto Admin',
      adminEmail: `admin-${stamp}@auto.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Monthly Revenue ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  const record = async (value: number, day: string) =>
    expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value, periodStart: `2026-${day}-01`, periodEnd: `2026-${day}-28` } })).status()).toBe(201);
  const taskTitles = async () => ((await (await api.get('/tasks')).json()) as Array<{ title: string }>).map((t) => t.title);

  await page.goto('/workflows');
  await expect(page.getByTestId('workflows-empty')).toBeVisible();

  // An incomplete form says what is missing, and sends nothing.
  await page.getByTestId('wf-create').click();
  await expect(page.getByTestId('wf-form-error')).toContainText('name');

  await page.getByTestId('wf-name').fill('Celebrate big revenue');
  await page.getByTestId('wf-kpi').selectOption({ label: `Monthly Revenue ${stamp}` });
  await page.getByTestId('wf-operator').selectOption('>');
  await page.getByTestId('wf-value').fill('100000');
  await page.getByTestId('wf-task-title').fill(`Celebrate ${stamp}`);
  await page.getByTestId('wf-create').click();

  // Listed as a sentence, with the KPI by name — not an id.
  const row = page.getByTestId('workflow-list').locator('[data-testid^="workflow-"]').first();
  await expect(row).toContainText(`When Monthly Revenue ${stamp} goes above 100000, create the task “Celebrate ${stamp}”`);
  await expect(row).not.toContainText(kpi.id);

  // Below the line: nothing. Above it: the task exists.
  await record(50_000, '01');
  expect(await taskTitles()).not.toContain(`Celebrate ${stamp}`);
  await record(150_000, '02');
  await expect.poll(taskTitles).toContain(`Celebrate ${stamp}`);

  // Paused: crossing the line again creates no second task.
  await row.getByTestId('wf-toggle').click();
  await expect(row).toContainText('Paused');
  await record(160_000, '03');
  expect((await taskTitles()).filter((t) => t === `Celebrate ${stamp}`)).toHaveLength(1);

  // Run now does the action whatever the value is, and says so.
  await row.getByTestId('wf-run').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Automation ran' })).toBeVisible();
  await expect.poll(async () => (await taskTitles()).filter((t) => t === `Celebrate ${stamp}`).length).toBe(2);

  // Edit: the form is filled with what is saved; saving changes it.
  await row.getByTestId('wf-edit').click();
  await expect(page.getByTestId('wf-name')).toHaveValue('Celebrate big revenue');
  await expect(page.getByTestId('wf-value')).toHaveValue('100000');
  await page.getByTestId('wf-value').fill('200000');
  await page.getByTestId('wf-create').click();
  await expect(row).toContainText('goes above 200000');

  // Delete asks first.
  await row.getByTestId('wf-delete').click();
  const dialog = page.getByTestId('wf-delete-confirm');
  await expect(dialog).toContainText('Delete “Celebrate big revenue”?');
  await page.getByTestId('wf-delete-confirm-confirm').click();
  await expect(page.getByTestId('workflows-empty')).toBeVisible();
  expect(((await (await api.get('/workflows')).json()) as unknown[]).length).toBe(0);
});
