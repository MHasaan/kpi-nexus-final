/**
 * Manual QA (2026-11-19, F-017): the Data tab's form took a second value for the same month with no warning,
 * leaving two November rows that could not be moved or removed. The second is now refused on the form, which
 * points at Correct.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('recording a second value for the same period is refused and points at Correct', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `once-${stamp}`,
      slug: `once-${stamp}`,
      adminFullName: 'Ona Admin',
      adminEmail: `admin-${stamp}@once.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', frequency: 'MONTHLY' } })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(page.getByTestId('data-record-form')).toBeVisible();
  await page.getByTestId('data-value').fill('236500');
  await page.getByTestId('data-record').click();
  await expect(page.getByTestId('data-point-value')).toHaveCount(1);

  await page.getByTestId('data-value').fill('231000');
  await page.getByTestId('data-record').click();
  await expect(page.getByTestId('data-error')).toContainText(/already recorded/i);
  await expect(page.getByTestId('data-error')).toContainText(/Correct/);
  await expect(page.getByTestId('data-point-value')).toHaveCount(1);
  const points = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as unknown[];
  expect(Array.isArray(points) ? points.length : (points as { items: unknown[] }).items.length).toBe(1);
});
