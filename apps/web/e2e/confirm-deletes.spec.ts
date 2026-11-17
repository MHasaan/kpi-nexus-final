/**
 * X-01 (plan 7.1, part 1): five deletes still asked through the browser's own
 * confirm box — unstyled, unnamed, and not saying what would happen. They use
 * the app's dialog now: it names the thing, says what is lost, and Cancel
 * keeps it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('deleting a dashboard, a report and a snapshot asks in the app\'s own dialog', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cfd-${stamp}`,
      slug: `cfd-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@cfd.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const snapshot = (await (await api.post(`/dashboards/${dashboard.id}/snapshots`, { data: { label: 'Before the change' } })).json()) as { id: string };
  const report = (await (await api.post('/scheduled-reports', {
    data: { name: `Weekly ${stamp}`, cron: '0 9 * * 1', format: 'CSV', recipients: [`r-${stamp}@example.com`] },
  })).json()) as { id: string };

  // No browser dialog may appear anywhere in this test.
  let nativeDialogs = 0;
  page.on('dialog', (d) => {
    nativeDialogs += 1;
    void d.dismiss();
  });

  /** Press delete, read the dialog, cancel (still there), press again, confirm. */
  const confirmDelete = async (trigger: string, dialogId: string, says: string[]) => {
    await page.getByTestId(trigger).click();
    const dialog = page.getByTestId(dialogId);
    for (const text of says) await expect(dialog).toContainText(text);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId(trigger)).toBeVisible();
    await page.getByTestId(trigger).click();
    await page.getByTestId(`${dialogId}-confirm`).click();
    await expect(page.getByTestId(trigger)).toHaveCount(0);
  };

  await page.goto(`/dashboards/${dashboard.id}/snapshots`);
  await confirmDelete(`snapshot-delete-${snapshot.id}`, 'snapshot-delete-confirm', ['Before the change', 'The dashboard itself is not affected']);

  await page.goto('/reports');
  await confirmDelete(`report-delete-${report.id}`, 'report-delete-confirm', [`Weekly ${stamp}`, 'It stops being sent']);
  expect((await api.get(`/scheduled-reports/${report.id}`)).status()).toBe(404);

  await page.goto('/dashboards');
  await confirmDelete(`dashboard-delete-${dashboard.id}`, 'dashboard-delete-confirm', [`Board ${stamp}`, 'dashboard archive']);
  expect(((await (await api.get('/dashboards')).json()) as Array<{ id: string }>).some((d) => d.id === dashboard.id)).toBe(false);

  expect(nativeDialogs).toBe(0);
});
