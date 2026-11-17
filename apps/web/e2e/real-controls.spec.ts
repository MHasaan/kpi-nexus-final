/**
 * Plan 7.6: the alert filters and the dashboard's date range each had a second,
 * invisible set of buttons carrying the test ids — so a test could "press the
 * filter" without touching the control a person sees. The ids are on the real
 * options now and the stand-ins are gone.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('filters and date range: the control on screen is the one that is pressed', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rcl-${stamp}`,
      slug: `rcl-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@rcl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };

  // Alerts: each filter id is on exactly one, visible, option; pressing it selects it and asks the API again.
  await page.goto('/alerts');
  const acknowledged = page.getByTestId('alerts-filter-ACKNOWLEDGED');
  await expect(acknowledged).toHaveCount(1);
  await expect(acknowledged).toBeVisible();
  await expect(page.getByTestId('alerts-filter-OPEN')).toHaveAttribute('aria-checked', 'true');
  const asked = page.waitForRequest((r) => r.url().includes('/alerts?') && r.url().includes('status=ACKNOWLEDGED'));
  await acknowledged.click();
  await asked;
  await expect(acknowledged).toHaveAttribute('aria-checked', 'true');
  const high = page.getByTestId('alerts-filter-severity-HIGH');
  await expect(high).toBeVisible();
  await high.click();
  await expect(high).toHaveAttribute('aria-checked', 'true');

  // Dashboard: the same for the date range.
  await page.goto(`/dashboards/${dashboard.id}`);
  const ninety = page.getByTestId('date-preset-90d');
  await expect(ninety).toHaveCount(1);
  await expect(ninety).toBeVisible();
  await ninety.click();
  await expect(ninety).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('date-preset-custom').click();
  await expect(page.locator('input[type="date"]').first()).toBeVisible();

  // An empty page is marked as empty, on something visible — it used to carry the list's id on a hidden element,
  // so a test waiting for "the list" passed with nothing listed.
  await page.goto('/my-kpis');
  await expect(page.getByTestId('my-kpis-empty')).toBeVisible();
  await expect(page.getByTestId('my-kpis-list')).toHaveCount(0);
});
