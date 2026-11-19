/**
 * Flow walk (KPI pages): the Categories page says a category's colour "is used
 * as the KPI accent in lists". It was used nowhere, and the KPI list did not
 * show a KPI's category at all — it could be filtered by, not seen. Each row
 * now names its category, marked with the category's colour.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the KPI list shows each KPI’s category, in the category’s colour', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `klc-${stamp}`,
      slug: `klc-${stamp}`,
      adminFullName: 'Cleo Admin',
      adminEmail: `admin-${stamp}@klc.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const category = (await (await api.post('/kpi-categories', { data: { name: `Finance ${stamp}`, color: '#16a34a' } })).json()) as { id: string };
  const inCategory = `Revenue ${stamp}`;
  const loose = `Visits ${stamp}`;
  expect((await api.post('/kpis', { data: { name: inCategory, scope: 'ORG_WIDE', categoryId: category.id } })).status()).toBe(201);
  expect((await api.post('/kpis', { data: { name: loose, scope: 'ORG_WIDE' } })).status()).toBe(201);

  await page.goto('/kpis');
  const chip = page.getByTestId(`kpi-row-${inCategory}`).getByTestId('kpi-category');
  await expect(chip).toHaveText(`Finance ${stamp}`);
  await expect(chip.getByTestId('kpi-category-colour')).toHaveCSS('background-color', 'rgb(22, 163, 74)');
  // A KPI in no category shows none.
  await expect(page.getByTestId(`kpi-row-${loose}`).getByTestId('kpi-category')).toHaveCount(0);
});
