/**
 * Plan 7.4 (validation): a hand-typed schedule, the report's recipients and
 * the forecast horizon were sent as typed and came back as a server error —
 * or, with an empty horizon, as a forecast for nothing.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('forms say what is wrong before sending: report schedule and recipients, forecast horizon', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fck-${stamp}`,
      slug: `fck-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@fck.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && (r.url().endsWith('/scheduled-reports') || r.url().endsWith('/forecasts'))) sent.push(r.url());
  });

  // The report form.
  await page.goto('/reports/new');
  const error = page.getByTestId('report-create-error');
  await page.getByTestId('report-create-submit').click();
  await expect(error).toHaveText('Give the report a name.');
  await page.getByTestId('report-name-input').fill(`Weekly ${stamp}`);
  await page.getByTestId('report-create-submit').click();
  await expect(error).toHaveText('Add at least one email address to send the report to.');
  await page.getByTestId('report-recipient-0').fill('not-an-address');
  await page.getByTestId('report-create-submit').click();
  await expect(error).toHaveText('"not-an-address" is not an email address.');

  // The forecast page.
  await page.goto(`/kpis/${kpi.id}/forecast`);
  await page.getByTestId('fc-horizon').fill('');
  await page.getByTestId('fc-run').click();
  await expect(page.getByTestId('fc-error')).toContainText('whole number');
  await page.getByTestId('fc-horizon').fill('900');
  await page.getByTestId('fc-run').click();
  await expect(page.getByTestId('fc-error')).toContainText('between 1 and 365');

  expect(sent, 'nothing was sent while the forms were wrong').toEqual([]);
});
