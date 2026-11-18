/**
 * Plan 6.1: the organisation's date format, number format and timezone were
 * saved and used nowhere — every page wrote dates and numbers the browser's
 * way. Pages now write them the way Settings says.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("formats: dates and numbers follow the organisation's settings", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fmt-${stamp}`,
      slug: `fmt-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@fmt.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', unit: 'USD', frequency: 'MONTHLY' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 1234567.5, periodStart: '2026-03-01', periodEnd: '2026-03-31' } })).status()).toBe(201);

  // A value nothing can format with is refused, naming the field.
  const bad = await api.patch('/organizations/me', { data: { timezone: 'Mars/Olympus' } });
  expect(bad.status()).toBe(400);

  // Before: the defaults — ISO dates.
  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(page.getByRole('cell', { name: '2026-03-01', exact: true })).toBeVisible();

  // Choose day-first dates and a comma for decimals on the settings page.
  await page.goto('/settings/fiscal');
  await page.getByTestId('fiscal-date-format').selectOption('DD/MM/YYYY');
  await page.getByTestId('fiscal-number-format').selectOption('1.234,56');
  await page.getByTestId('fiscal-save').click();
  await expect(page.getByTestId('fiscal-saved')).toBeVisible();

  // The KPI's values: the period is a calendar day, written day-first.
  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(page.getByRole('cell', { name: '01/03/2026', exact: true })).toBeVisible();

  // The home page: the number in the organisation's style.
  await page.goto('/dashboard');
  await expect(page.getByText('1.234.567,5 USD').first()).toBeVisible();

  // The audit log: a moment, as date and 24-hour time.
  await page.goto('/settings/audit');
  await expect(page.getByTestId('audit-list').getByText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/).first()).toBeVisible();
});
