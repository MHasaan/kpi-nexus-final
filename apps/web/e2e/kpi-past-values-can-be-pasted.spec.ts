/**
 * Flow walk (first use): a new organisation's first job is entering the months
 * it already has, and the only way was one value at a time — date, date,
 * value, Record — for every month. A KPI's Data tab now takes a list pasted
 * from a spreadsheet or typed out, shows what each line becomes before
 * anything is saved, and records them all.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('past values are pasted onto a KPI, checked, and recorded together', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pvp-${stamp}`,
      slug: `pvp-${stamp}`,
      adminFullName: 'Parvez Admin',
      adminEmail: `admin-${stamp}@pvp.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Sales ${stamp}`, scope: 'ORG_WIDE', frequency: 'MONTHLY' } })).json()) as { id: string };
  // March is already recorded.
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 130, periodStart: '2026-03-01', periodEnd: '2026-03-31' } })).status()).toBe(201);

  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await page.getByTestId('past-values-open').click();
  await page.getByTestId('past-values-input').fill(['2026-01-01, 100', '2026-02, 120', '2026-03-15, 999', '2026-02-10, 125', 'not-a-date, 5'].join('\n'));

  // What each line becomes, before anything is saved.
  const rows = page.getByTestId('past-value-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('Ready');
  await expect(rows.nth(2)).toContainText('Already recorded');
  await expect(rows.nth(3)).toContainText('Same period as an earlier line');
  await expect(rows.nth(4)).toContainText('Not a date');
  await page.getByTestId('past-values-record').click();
  await expect(page.getByTestId('past-values-outcome')).toHaveText('Recorded 2 values.');

  // Two new values, each for its whole month; March is left as it was.
  const points = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{ value: number; periodStart: string; periodEnd: string }>;
  const byMonth = Object.fromEntries(points.map((p) => [p.periodStart.slice(0, 7), [p.value, p.periodEnd.slice(0, 10)]]));
  expect(byMonth).toEqual({ '2026-01': [100, '2026-01-31'], '2026-02': [120, '2026-02-28'], '2026-03': [130, '2026-03-31'] });
  await expect(page.getByTestId('data-point-value')).toHaveCount(3);
});

// The paste box records through the same route as the one-value form above it: on a per-unit KPI, for the unit
// chosen there. The full suite caught the two forms sharing a React key, so the tab drew a second record form
// whenever it reloaded — after every value recorded.
test('on a per-unit KPI, past values go to the unit chosen, and the tab keeps one record form', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pvu-${stamp}`,
      slug: `pvu-${stamp}`,
      adminFullName: 'Uzma Admin',
      adminEmail: `admin-${stamp}@pvu.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const unit = (await (await api.post('/org-units', { data: { name: `North ${stamp}` } })).json()) as { id: string };
  const kpi = (await (await api.post('/kpis', { data: { name: `Orders ${stamp}`, scope: 'PER_UNIT', frequency: 'MONTHLY', orgUnitIds: [unit.id] } })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(page.getByTestId('data-unit').first()).toContainText(`North ${stamp}`);
  await page.getByTestId('past-values-open').click();
  await page.getByTestId('past-values-input').fill(['2026-01, 40', '2026-02, 42'].join('\n'));
  await page.getByTestId('past-values-record').click();
  await expect(page.getByTestId('past-values-outcome')).toHaveText('Recorded 2 values.');

  // Each value is the unit's.
  const points = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{ periodStart: string; orgUnitId: string | null }>;
  expect(points.map((p) => [p.periodStart.slice(0, 7), p.orgUnitId]).sort()).toEqual([
    ['2026-01', unit.id],
    ['2026-02', unit.id],
  ]);
  // Recording reloads the tab: it still has one record form and one unit picker, not two.
  await expect(page.getByTestId('data-point-value')).toHaveCount(2);
  await expect(page.getByTestId('data-record-form')).toHaveCount(1);
  await expect(page.getByTestId('data-unit')).toHaveCount(1);
});
