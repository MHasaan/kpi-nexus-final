/**
 * Flow walk (first use): a new organisation's first job is entering the months
 * it already has. On a monthly KPI, moving "Period from" to 1 October left "to"
 * on 30 November, so the value was stored against two months unless the second
 * date was fixed by hand every time. The end now follows the start.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('moving the start of the period moves its end with it', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rpe-${stamp}`,
      slug: `rpe-${stamp}`,
      adminFullName: 'Rana Admin',
      adminEmail: `admin-${stamp}@rpe.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Sales ${stamp}`, scope: 'ORG_WIDE', frequency: 'MONTHLY' } })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}?tab=data`);
  const start = page.getByTestId('data-period-start');
  const end = page.getByTestId('data-period-end');
  await start.fill('2026-03-01');
  await expect(end).toHaveValue('2026-03-31');

  // It is stored as the one month.
  await page.getByTestId('data-value').fill('900');
  await page.getByTestId('data-record').click();
  await expect(page.getByTestId('data-point-value').first()).toHaveText('900');
  const points = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{ periodStart: string; periodEnd: string }>;
  expect(points[0]!.periodStart.slice(0, 10)).toBe('2026-03-01');
  expect(points[0]!.periodEnd.slice(0, 10)).toBe('2026-03-31');

  // An end the person sets themself is theirs: the start no longer moves it.
  await end.fill('2026-03-15');
  await start.fill('2026-02-01');
  await expect(end).toHaveValue('2026-03-15');
});
