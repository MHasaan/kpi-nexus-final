/**
 * Plan 6.4: the fiscal year's start month and the first day of the week were
 * saved and used nowhere — a new objective always started with the calendar
 * quarter and a weekly value always ran Monday to Sunday.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("fiscal calendar: default periods follow the organisation's fiscal year and week start", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fis-${stamp}`,
      slug: `fis-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@fis.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Weekly ${stamp}`, scope: 'ORG_WIDE', unit: 'count', frequency: 'WEEKLY' } })).json()) as { id: string };

  // A new organisation's week starts on Monday — what every week in the app was before the setting took effect.
  expect(((await (await api.get('/organizations/me')).json()) as { weekStartsOn: number }).weekStartsOn).toBe(1);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // A fiscal year that starts next month: this month is its last, so the current
  // fiscal quarter is this month and the two before it — not a calendar quarter
  // (unless this month happens to end one).
  const startMonth = ((month + 1) % 12) + 1;
  const quarterStart = iso(new Date(Date.UTC(year, month - 2, 1)));
  const quarterEnd = iso(new Date(Date.UTC(year, month + 1, 0)));
  const sunday = iso(new Date(Date.UTC(year, month, now.getUTCDate() - now.getUTCDay())));
  const saturday = iso(new Date(Date.UTC(year, month, now.getUTCDate() - now.getUTCDay() + 6)));

  // Set both on the Fiscal calendar page.
  await page.goto('/settings/fiscal');
  await page.getByTestId('fiscal-start-month').selectOption(String(startMonth));
  await page.getByTestId('fiscal-week-starts-on').selectOption('0');
  await page.getByTestId('fiscal-save').click();
  await expect(page.getByTestId('fiscal-saved')).toBeVisible();

  // A new objective starts with the current fiscal quarter.
  await page.goto('/okrs');
  await expect(page.getByTestId('okr-create-period-start')).toHaveValue(quarterStart);
  await expect(page.getByTestId('okr-create-period-end')).toHaveValue(quarterEnd);

  // A weekly KPI's value defaults to a week that starts on Sunday.
  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(page.getByTestId('data-period-start')).toHaveValue(sunday);
  await expect(page.getByTestId('data-period-end')).toHaveValue(saturday);
});
