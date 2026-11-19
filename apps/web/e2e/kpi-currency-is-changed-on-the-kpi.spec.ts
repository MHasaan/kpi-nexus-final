/**
 * Owner's decision (2026-11-19): a money KPI keeps the currency it was created
 * with; changing the organisation's currency does not touch it. One KPI's
 * currency is changed on that KPI — its Unit, under Edit — which already
 * worked and was said nowhere. The Edit form and the organisation's settings
 * now say so, and say that the values are relabelled, not converted.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("a money KPI keeps its currency when the organisation's changes, and can be given another on its own Edit page", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kcc-${stamp}`,
      slug: `kcc-${stamp}`,
      adminFullName: 'Kamil Admin',
      adminEmail: `admin-${stamp}@kcc.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const unitOf = async (id: string) => ((await (await api.get(`/kpis/${id}`)).json()) as { unit: string | null }).unit;

  // Created while the organisation's currency is USD: it takes USD.
  const kpi = (await (await api.post('/kpis', { data: { name: `Sales ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', targetValue: 50000 } })).json()) as { id: string };
  expect(await unitOf(kpi.id)).toBe('USD');
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 42000, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);

  // The organisation moves to PKR: the KPI keeps USD.
  expect((await api.patch('/organizations/me', { data: { currency: 'PKR' } })).ok()).toBe(true);
  expect(await unitOf(kpi.id)).toBe('USD');

  // The settings page says where one KPI's currency is changed.
  await page.goto('/settings/organization');
  await expect(page.getByTestId('org-currency-help')).toContainText('A KPI that already exists keeps its own');
  await expect(page.getByTestId('org-currency-help')).toContainText('Edit');

  // That KPI's Edit page says what changing it does, and changes it.
  await page.goto(`/kpis/${kpi.id}/edit`);
  const help = page.getByTestId('kpi-unit-help');
  await expect(help).toContainText('This KPI’s currency');
  await expect(help).toContainText('not converted');
  await expect(page.getByTestId('kpi-unit')).toHaveValue('USD');
  await page.getByTestId('kpi-unit').fill('PKR');
  await page.getByTestId('kpi-submit').click();
  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}$`));
  await expect(page.getByTestId('overview-target')).toContainText('50,000 PKR');
  expect(await unitOf(kpi.id)).toBe('PKR');
  // The figure recorded is the same figure: relabelled, not converted.
  const points = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{ value: number }>;
  expect(points[0]!.value).toBe(42000);
});
