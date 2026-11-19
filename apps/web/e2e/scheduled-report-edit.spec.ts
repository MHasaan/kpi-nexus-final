/**
 * Flow walk (reports): a scheduled report could be paused or deleted, but not
 * changed. Adding one recipient or moving it to another day meant deleting it
 * — and its run history — and making it again. The report's page now has
 * Edit: the same form, filled with what is saved.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a scheduled report can be changed: name, recipients and schedule', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `sre-${stamp}`,
      slug: `sre-${stamp}`,
      adminFullName: 'Rae Admin',
      adminEmail: `admin-${stamp}@sre.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const report = (await (await api.post('/scheduled-reports', {
    data: { name: `Weekly ${stamp}`, cron: '0 9 * * 1', format: 'CSV', recipients: [`first-${stamp}@example.com`], kpiIds: [kpi.id] },
  })).json()) as { id: string };

  await page.goto(`/reports/${report.id}`);
  await page.getByTestId('report-detail-edit').click();
  await expect(page).toHaveURL(new RegExp(`/reports/${report.id}/edit$`));

  // The form holds what is saved.
  await expect(page.getByTestId('report-name-input')).toHaveValue(`Weekly ${stamp}`);
  await expect(page.getByTestId('report-format-select')).toHaveValue('CSV');
  await expect(page.getByTestId('report-recipient-0')).toHaveValue(`first-${stamp}@example.com`);
  await expect(page.getByTestId(`report-kpi-checkbox-${kpi.id}`)).toBeChecked();
  await expect(page.getByRole('radio', { name: /Weekly Mon 9am/ })).toBeChecked();

  // Change the name, add a recipient, move it to monthly, and take the KPI off (all KPIs again).
  await page.getByTestId('report-name-input').fill(`Monthly ${stamp}`);
  await page.getByTestId('report-add-recipient').click();
  await page.getByTestId('report-recipient-1').fill(`second-${stamp}@example.com`);
  await page.getByRole('radio', { name: /Monthly 1st 9am/ }).check();
  await page.getByTestId(`report-kpi-checkbox-${kpi.id}`).uncheck();
  await page.getByTestId('report-save-submit').click();

  // Back on the report, changed.
  await expect(page).toHaveURL(new RegExp(`/reports/${report.id}$`));
  await expect(page.getByTestId('report-detail-heading')).toHaveText(`Monthly ${stamp}`);
  await expect(page.getByText(`second-${stamp}@example.com`)).toBeVisible();
  const saved = (await (await api.get(`/scheduled-reports/${report.id}`)).json()) as { name: string; cron: string; recipients: string[]; kpiIds: string[]; format: string };
  expect(saved).toMatchObject({
    name: `Monthly ${stamp}`,
    cron: '0 9 1 * *',
    format: 'CSV',
    recipients: [`first-${stamp}@example.com`, `second-${stamp}@example.com`],
    kpiIds: [],
  });

  // A schedule that is not one of the three offered is kept as it is, under Custom.
  await api.patch(`/scheduled-reports/${report.id}`, { data: { cron: '30 7 * * 1-5' } });
  await page.goto(`/reports/${report.id}/edit`);
  await expect(page.getByRole('radio', { name: 'Custom' })).toBeChecked();
  await expect(page.getByTestId('report-cron-custom-input')).toHaveValue('30 7 * * 1-5');
});
