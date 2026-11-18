/**
 * Plan 6.4: the dashboard's date range offered only "last N days". It now also
 * offers "This quarter" and "This fiscal year", which start where the
 * organisation's fiscal calendar says.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("dashboard: 'This fiscal year' and 'This quarter' follow the organisation's fiscal calendar", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `dfp-${stamp}`,
      slug: `dfp-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@dfp.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // A fiscal year that starts next month: it began on the 1st of that month last
  // year, and this month closes its fourth quarter.
  const startMonth = ((month + 1) % 12) + 1;
  expect((await api.patch('/organizations/me', { data: { fiscalCalendar: { startMonth } } })).ok()).toBeTruthy();
  const fiscalYearStart = iso(new Date(Date.UTC(year - 1, month + 1, 1)));
  const quarterStart = iso(new Date(Date.UTC(year, month - 2, 1)));
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };

  await page.goto(`/dashboards/${dashboard.id}`);
  const asksFrom = (from: string) => page.waitForRequest((r) => r.url().startsWith(API_URL) && r.url().includes(`from=${from}`));

  const yearAsked = asksFrom(fiscalYearStart);
  await page.getByTestId('date-preset-fiscal-year').click();
  await yearAsked;
  await expect(page.getByTestId('date-preset-fiscal-year')).toHaveAttribute('aria-checked', 'true');

  const quarterAsked = asksFrom(quarterStart);
  await page.getByTestId('date-preset-quarter').click();
  await quarterAsked;
  await expect(page.getByTestId('date-preset-quarter')).toHaveAttribute('aria-checked', 'true');
});
