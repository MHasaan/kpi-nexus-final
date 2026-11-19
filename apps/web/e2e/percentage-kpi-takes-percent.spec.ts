/**
 * Owner's decision (2026-11-19): a new KPI of the kind Percentage, with no unit
 * typed, gets "%" — as a money KPI gets the organisation's currency (#369). It
 * used to show a bare number: a churn target of 5 read "5".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a Percentage KPI with no unit of its own takes %', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pct-${stamp}`,
      slug: `pct-${stamp}`,
      adminFullName: 'Pari Admin',
      adminEmail: `admin-${stamp}@pct.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });

  // The form says what an empty unit will become.
  await page.goto('/kpis/new');
  await page.getByTestId('kpi-name').fill(`Churn ${stamp}`);
  await page.getByTestId('kpi-type').selectOption('PERCENTAGE');
  await expect(page.getByTestId('kpi-unit-help')).toHaveText('Leave empty to use %.');
  await page.getByTestId('kpi-target').fill('5');
  await page.getByTestId('kpi-submit').click();

  await expect(page).toHaveURL(/\/kpis\/c[a-z0-9]{15,}$/);
  const id = page.url().split('/').pop()!;
  expect(((await (await api.get(`/kpis/${id}`)).json()) as { unit: string | null }).unit).toBe('%');
  await expect(page.getByTestId('overview-target')).toContainText('5 %');

  // A unit that was typed is kept; a plain number still gets none.
  const typed = (await (await api.post('/kpis', { data: { name: `Share ${stamp}`, scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: 'pts' } })).json()) as { unit: string | null };
  expect(typed.unit).toBe('pts');
  const plain = (await (await api.post('/kpis', { data: { name: `Visits ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER' } })).json()) as { unit: string | null };
  expect(plain.unit).toBeNull();
});
