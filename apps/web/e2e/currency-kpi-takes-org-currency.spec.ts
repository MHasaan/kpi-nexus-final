/**
 * Flow walk (first use): the setup wizard and Settings ask for the
 * organisation's currency, "used for … money … everywhere". Nothing used it: a
 * KPI of the kind Currency, with no unit typed, showed bare numbers. Such a KPI
 * now starts with the organisation's currency as its unit, and the form says so.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("a Currency KPI with no unit of its own takes the organisation's currency", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cur-${stamp}`,
      slug: `cur-${stamp}`,
      adminFullName: 'Cara Admin',
      adminEmail: `admin-${stamp}@cur.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  expect((await api.patch('/organizations/me', { data: { currency: 'PKR' } })).ok()).toBe(true);

  // The form says what an empty unit will become, only for a money KPI.
  await page.goto('/kpis/new');
  await page.getByTestId('kpi-name').fill(`Sales ${stamp}`);
  await expect(page.getByTestId('kpi-unit-help')).not.toContainText('PKR');
  await page.getByTestId('kpi-type').selectOption('CURRENCY');
  await expect(page.getByTestId('kpi-unit-help')).toContainText("Leave empty to use your organisation's currency (PKR)");
  await page.getByTestId('kpi-target').fill('50000');
  await page.getByTestId('kpi-submit').click();

  // The new KPI's own page: an id, not the form's "/kpis/new".
  await expect(page).toHaveURL(/\/kpis\/c[a-z0-9]{15,}$/);
  const id = page.url().split('/').pop()!;
  expect(((await (await api.get(`/kpis/${id}`)).json()) as { unit: string | null }).unit).toBe('PKR');
  await expect(page.getByTestId('overview-target')).toContainText('50,000 PKR');

  // A unit the person typed is theirs; another kind of KPI gets none.
  const typed = (await (await api.post('/kpis', { data: { name: `Export sales ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD' } })).json()) as { unit: string | null };
  expect(typed.unit).toBe('USD');
  const plain = (await (await api.post('/kpis', { data: { name: `Orders ${stamp}`, scope: 'ORG_WIDE', type: 'COUNT' } })).json()) as { unit: string | null };
  expect(plain.unit).toBeNull();
});
