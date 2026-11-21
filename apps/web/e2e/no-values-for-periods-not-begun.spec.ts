/**
 * Manual QA (2026-11-19, F-037): a value for a month that had not begun was accepted without a word, became
 * the KPI's latest value and fired an alert. The form now says the period has not begun and records nothing.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a value for a period that has not begun is refused on the form', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fut-${stamp}`,
      slug: `fut-${stamp}`,
      adminFullName: 'Fay Admin',
      adminEmail: `admin-${stamp}@fut.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', frequency: 'MONTHLY' } })).json()) as { id: string };
  const nextYear = new Date().getUTCFullYear() + 1;

  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await page.getByTestId('data-value').fill('100');
  await page.getByTestId('data-period-start').fill(`${nextYear}-03-01`);
  await page.getByTestId('data-period-end').fill(`${nextYear}-03-31`);
  await page.getByTestId('data-record').click();
  await expect(page.getByTestId('data-error')).toContainText(/not begun/i);
  await expect(page.getByTestId('data-point-value')).toHaveCount(0);
});
