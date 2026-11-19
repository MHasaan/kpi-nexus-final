/**
 * Flow walk (reports): a report's own page printed its schedule as
 * "0 9 * * 1", and neither it nor the form said whose clock "9am" is on
 * (it is the organisation's time zone).
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a report says when it runs in words, and in whose time zone', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rsw-${stamp}`,
      slug: `rsw-${stamp}`,
      adminFullName: 'Rhea Admin',
      adminEmail: `admin-${stamp}@rsw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  expect((await api.patch('/organizations/me', { data: { timezone: 'Asia/Karachi' } })).ok()).toBe(true);
  const report = (await (await api.post('/scheduled-reports', {
    data: { name: `Weekly ${stamp}`, cron: '0 9 * * 1', format: 'CSV', recipients: [`r-${stamp}@example.com`] },
  })).json()) as { id: string };

  // The report's page.
  await page.goto(`/reports/${report.id}`);
  const when = page.getByTestId('report-schedule');
  await expect(when).toContainText('Every Monday at 09:00');
  await expect(when).toContainText('Asia/Karachi time');
  await expect(when).not.toContainText('0 9 * * 1');

  // The list says the same.
  await page.goto('/reports');
  await expect(page.getByTestId(`report-row-${report.id}`)).toContainText('Every Monday at 09:00');

  // The form says what the chosen schedule means as it is chosen.
  await page.goto('/reports/new');
  await expect(page.getByTestId('report-schedule-words')).toContainText('Every day at 08:00, Asia/Karachi time');
  await page.getByRole('radio', { name: 'Custom' }).check();
  await page.getByTestId('report-cron-custom-input').fill('30 7 * * 1-5');
  await expect(page.getByTestId('report-schedule-words')).toContainText('Monday to Friday at 07:30, Asia/Karachi time');
});
