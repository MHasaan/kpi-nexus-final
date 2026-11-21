/**
 * Manual QA (2026-11-19, F-016): a formula could name another KPI only as a bare word, and almost every real
 * KPI name has spaces, so `Monthly Recurring Revenue * 12` was refused with "Unexpected token 'Recurring'" and
 * no syntax worked. The Formula tab now inserts a KPI's name in double quotes from a picker, the hint says so,
 * and a bare multi-word name gets that hint back as the error.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('formula tab: a KPI picked from the list is inserted in quotes and the formula saves', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fq-${stamp}`,
      slug: `fq-${stamp}`,
      adminFullName: 'Fay Admin',
      adminEmail: `admin-${stamp}@fq.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const mrrName = `Monthly Recurring Revenue ${stamp}`;
  await api.post('/kpis', { data: { name: mrrName, scope: 'ORG_WIDE', type: 'CURRENCY' } });
  const arr = (await (await api.post('/kpis', { data: { name: `Annual Recurring Revenue ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY' } })).json()) as { id: string };

  await page.goto(`/kpis/${arr.id}?tab=formula`);
  await expect(page.getByTestId('formula-raw')).toBeVisible();
  await expect(page.getByText(/double quotes/)).toBeVisible();

  // Typed bare, the name gets the hint back.
  await page.getByTestId('formula-raw').fill(`${mrrName} * 12`);
  await page.getByTestId('formula-save').click();
  await expect(page.getByText(/A KPI name with spaces goes in double quotes/)).toBeVisible();

  // Picked from the list, it is inserted in quotes.
  await page.getByTestId('formula-raw').fill('');
  await page.getByTestId('formula-kpi-picker').getByText(mrrName).click();
  await expect(page.getByTestId('formula-raw')).toHaveValue(`"${mrrName}"`);
  await page.getByTestId('formula-raw').fill(`"${mrrName}" * 12`);
  await page.getByTestId('formula-save').click();
  await expect(page.getByText('Formula saved.')).toBeVisible();

  const saved = (await (await api.get(`/kpis/${arr.id}/formula`)).json()) as { raw: string };
  expect(saved.raw).toBe(`"${mrrName}" * 12`);
});
