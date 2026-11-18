/**
 * Plan 6.7: retention periods were saved and nothing was ever deleted. A
 * period now purges — but only after an administrator turns purging on for
 * it (owner's decision, 2026-11-18): setting a period deletes nothing.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface Policy { entityType: string; days: number; purgeEnabledAt: string | null; lastRunDeleted: number | null }

test('retention: a period deletes nothing until purging is turned on; then old KPI values go', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ret-${stamp}`,
      slug: `ret-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@ret.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `History ${stamp}`, scope: 'ORG_WIDE', unit: 'count' } })).json()) as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 1, periodStart: '2020-01-01', periodEnd: '2020-01-31' } })).status()).toBe(201);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 2, periodStart: monthStart, periodEnd: today } })).status()).toBe(201);
  const values = async () => ((await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{ value: number }>).map((p) => p.value).sort();
  const policy = async () => ((await (await api.get('/retention-policies')).json()) as Policy[]).find((p) => p.entityType === 'kpi_data_point')!;

  // A period is set: purging is off, and a run deletes nothing.
  expect((await api.put('/retention-policies/kpi_data_point', { data: { days: 365 } })).ok()).toBeTruthy();
  expect((await policy()).purgeEnabledAt).toBeNull();
  expect(await (await api.post('/retention-policies/run', { data: { dryRun: false } })).json()).toEqual({ policies: 0, deleted: 0 });
  expect(await values()).toEqual([1, 2]);

  // The page: off, a count on request, and a question that says what the first run deletes.
  await page.goto('/settings/retention');
  await expect(page.getByTestId('retention-purging-kpi_data_point')).toHaveText('Purging off');
  await page.getByTestId('retention-preview').click();
  await expect(page.getByTestId('retention-status-kpi_data_point')).toContainText('1 row older than 365 days');
  await expect(page.getByTestId('retention-run')).toHaveCount(0);

  await page.getByTestId('retention-on-kpi_data_point').click();
  await expect(page.getByTestId('retention-purging-confirm')).toContainText('The first run will delete 1 row');
  await page.getByTestId('retention-purging-confirm-confirm').click();
  await expect(page.getByTestId('retention-purging-kpi_data_point')).toHaveText('Purging on');
  // Turning it on deleted nothing yet.
  expect(await values()).toEqual([1, 2]);

  // Run now: the 2020 value goes, this month's stays.
  await page.getByTestId('retention-run').click();
  await expect(page.getByTestId('retention-run-confirm')).toContainText('1 row will be deleted for good');
  await page.getByTestId('retention-run-confirm-confirm').click();
  await expect(page.getByTestId('retention-status-kpi_data_point')).toContainText('1 row deleted');
  expect(await values()).toEqual([2]);
  expect((await policy()).lastRunDeleted).toBe(1);

  // A new period turns purging off again.
  await page.getByTestId('retention-days-kpi_data_point').fill('30');
  await page.getByTestId('retention-save-kpi_data_point').click();
  await expect(page.getByTestId('retention-purging-kpi_data_point')).toHaveText('Purging off');
  expect((await policy()).purgeEnabledAt).toBeNull();
});
