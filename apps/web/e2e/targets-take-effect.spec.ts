/**
 * UI-017: a target saved on a KPI's Targets tab was read by nothing — health,
 * dashboards and attainment used the target on the KPI itself. By the owner's
 * decision the target in effect is the KPI's target.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('targets: the one in effect becomes the KPI target; a future one waits; the page says which counts', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `tte-${stamp}`,
      slug: `tte-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@tte.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', direction: 'HIGHER_IS_BETTER', targetValue: 100 },
  })).json()) as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 80, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);
  const kpiTarget = async () => ((await (await api.get(`/kpis/${kpi.id}`)).json()) as { targetValue: number | null }).targetValue;
  const attainment = async () =>
    ((await (await api.get('/kpis/dashboard-summary')).json()) as Array<{ kpiId: string; attainmentPct: number | null }>).find((r) => r.kpiId === kpi.id)!.attainmentPct;
  expect(await attainment()).toBeCloseTo(80);

  await page.goto(`/kpis/${kpi.id}?tab=targets`);
  await expect(page.getByTestId('targets-none-in-effect')).toContainText('100');

  // A target with no dates is in effect at once: it is the KPI's target, and attainment follows.
  await page.getByTestId('target-value').fill('200');
  await page.getByTestId('target-add').click();
  const inEffect = page.getByTestId('target-in-effect');
  await expect(inEffect).toHaveCount(1);
  await expect(page.locator('[data-testid^="target-row-"]').filter({ has: inEffect })).toContainText('200');
  expect(await kpiTarget()).toBe(200);
  expect(await attainment()).toBeCloseTo(40);

  // One that starts next year waits: it is listed, marked as not yet started, and changes nothing.
  const nextYear = `${new Date().getUTCFullYear() + 1}-01-01`;
  await page.getByTestId('target-value').fill('500');
  await page.getByTestId('target-from').fill(nextYear);
  await page.getByTestId('target-add').click();
  await expect(page.locator('[data-testid^="target-row-"]')).toHaveCount(2);
  await expect(page.getByText('Starts later')).toBeVisible();
  await expect(page.locator('[data-testid^="target-row-"]').filter({ has: inEffect })).toContainText('200');
  expect(await kpiTarget()).toBe(200);

  // The API names the same one.
  const active = (await (await api.get(`/kpis/${kpi.id}/targets/active`)).json()) as { value: number };
  expect(active.value).toBe(200);

  // An end before a start is caught on the form.
  await page.getByTestId('target-value').fill('1');
  await page.getByTestId('target-from').fill('2027-06-01');
  await page.getByTestId('target-to').fill('2027-01-01');
  await page.getByTestId('target-add').click();
  await expect(page.getByTestId('target-error')).toContainText('after');
  await expect(page.locator('[data-testid^="target-row-"]')).toHaveCount(2);
});
