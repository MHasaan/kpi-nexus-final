/**
 * X-02 (plan 7.2): a failed request looked like "nothing here". A search that
 * failed said "No results"; the alerts bell said "No open alerts"; saved views
 * showed an empty picker; a widget that could not be removed stayed without a
 * word. Each failure below is produced by answering the page's request with a
 * 500.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const fail = { status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'The database is not answering' }) };

test('a failed request says it failed instead of looking empty', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `err-${stamp}`,
      slug: `err-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@err.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const widget = (await (await api.post(`/dashboards/${dashboard.id}/widgets`, {
    data: { widgetType: 'kpi_card', title: 'Revenue card', position: { x: 0, y: 0, w: 4, h: 3 }, config: { kpiId: kpi.id } },
  })).json()) as { id: string };

  // Saved views: could not be loaded — said so, not an empty picker.
  await page.route('**/kpi-saved-views*', (route) => route.fulfill(fail));
  await page.goto('/kpis');
  await expect(page.getByRole('alert').filter({ hasText: 'Saved views could not be loaded' })).toBeVisible();
  await page.unroute('**/kpi-saved-views*');

  // Global search: a failure is not "No results".
  await page.route('**/search?*', (route) => route.fulfill(fail));
  await page.getByTestId('global-search-trigger').click();
  await page.getByTestId('global-search-input').fill('Revenue');
  await expect(page.getByTestId('global-search-error')).toBeVisible();
  await expect(page.getByTestId('global-search-empty')).toHaveCount(0);
  await page.unroute('**/search?*');
  await page.keyboard.press('Escape');

  // The alerts bell: could not load — said so, not "No open alerts".
  await page.route('**/alerts?*', (route) => route.fulfill(fail));
  await page.getByTestId('alerts-bell').click();
  await expect(page.getByTestId('alerts-bell-error')).toBeVisible();
  await expect(page.getByTestId('alerts-bell-dropdown')).not.toContainText('No open alerts');
  await page.unroute('**/alerts?*');

  // A widget that cannot be removed: the dashboard says so and keeps it.
  await page.goto(`/dashboards/${dashboard.id}`);
  await page.getByTestId('dashboard-edit-toggle').click();
  await page.route(`**/dashboards/${dashboard.id}/widgets/${widget.id}`, (route) => (route.request().method() === 'DELETE' ? route.fulfill(fail) : route.continue()));
  await page.getByTestId(`widget-delete-${widget.id}`).click();
  await page.getByTestId('widget-delete-confirm-confirm').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'The widget was not removed' })).toContainText('The database is not answering');
  await expect(page.getByTestId(`widget-card-${widget.id}`)).toBeVisible();
});
