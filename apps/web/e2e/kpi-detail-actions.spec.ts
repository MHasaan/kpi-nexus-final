/**
 * UI-012 (plan 5.1): from a KPI's own page there was no way to edit it, delete
 * it, or reach its forecast, anomalies, what-if or embed pages — each needed
 * the address typed by hand. The open tab was not in the address either, so
 * "Edit cascades" on the KPI tree landed on Overview.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI detail: edit, analyse and delete from the page; the tab is in the address', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kda-${stamp}`,
      slug: `kda-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kda.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  // A link can name the tab; a tab this KPI does not have opens Overview.
  await page.goto(`/kpis/${kpi.id}?tab=cascade`);
  await expect(page.getByTestId('tab-cascade').getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('tab-targets').getByRole('tab').click();
  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}\\?tab=targets$`));
  await page.reload();
  await expect(page.getByTestId('tab-targets').getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  await page.goto(`/kpis/${kpi.id}?tab=assignments`);
  await expect(page.getByTestId('tab-overview').getByRole('tab')).toHaveAttribute('aria-selected', 'true');

  // Each analysis page is one click away and opens.
  for (const key of ['forecast', 'anomalies', 'whatif', 'embed']) {
    await page.goto(`/kpis/${kpi.id}`);
    await page.getByTestId(`kpi-analytics-${key}`).click();
    await expect(page, `${key} opens`).toHaveURL(new RegExp(`/kpis/${kpi.id}/${key}$`));
  }

  // Edit opens the form.
  await page.goto(`/kpis/${kpi.id}`);
  await page.getByTestId('kpi-detail-edit').click();
  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}/edit$`));

  // Delete asks first, says where the KPI goes, and goes back to the list.
  await page.goto(`/kpis/${kpi.id}`);
  await page.getByTestId('kpi-detail-delete').click();
  const dialog = page.getByTestId('kpi-delete-confirm');
  await expect(dialog).toContainText(`Revenue ${stamp}`);
  await expect(dialog).toContainText('KPI archive');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await api.get(`/kpis/${kpi.id}`)).status()).toBe(200);
  await page.getByTestId('kpi-detail-delete').click();
  await page.getByTestId('kpi-delete-confirm-confirm').click();
  await expect(page).toHaveURL(/\/kpis$/);
  expect((await api.get(`/kpis/${kpi.id}`)).status()).toBe(404);
});
