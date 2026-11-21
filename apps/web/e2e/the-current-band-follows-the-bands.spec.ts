/**
 * Manual QA (2026-11-19, F-019): after adding bands on the Thresholds tab, "Current band" kept saying no bands
 * were set; only a full reload showed the band the value was in. The line now follows the bands as they are
 * added and removed.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the current band follows the bands as they are added and removed, without a reload', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `band-${stamp}`,
      slug: `band-${stamp}`,
      adminFullName: 'Bea Admin',
      adminEmail: `admin-${stamp}@band.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 236_500, periodStart: '2026-10-01', periodEnd: '2026-10-31' } })).status()).toBe(201);

  await page.goto(`/kpis/${kpi.id}?tab=thresholds`);
  const status = page.getByTestId('band-status');
  await expect(status).toHaveText('Current band: No bands set');

  // Add a band the value falls in: the line names it at once.
  await page.getByLabel('Counts as').selectOption('ON_TRACK');
  await page.getByLabel('Name').fill('Healthy');
  await page.getByLabel('From').fill('220000');
  await page.getByTestId('band-add').click();
  await expect(page.getByTestId('band-row-Healthy')).toBeVisible();
  await expect(status).toHaveText('Current band: Healthy');

  // Remove it: the line says so.
  await page.getByTestId('band-row-Healthy').getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('band-delete-confirm-confirm').click();
  await expect(page.getByTestId('band-row-Healthy')).toHaveCount(0);
  await expect(status).toHaveText('Current band: No bands set');
});
