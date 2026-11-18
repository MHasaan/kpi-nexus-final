/**
 * Flow walk, 2026-11-18. A KPI's own page did not say how the KPI stands:
 * no target, no attainment, the value unformatted ("47200 USD") with the day
 * it was typed instead of the period it is for — and a new KPI gave no hint
 * that the next step is to record a value.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI page: a new KPI asks for its first value; with values it shows value, period, target and attainment', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kos-${stamp}`,
      slug: `kos-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kos.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', unit: 'USD', direction: 'HIGHER_IS_BETTER', targetValue: 50000 },
  })).json()) as { id: string };

  // New: the target is already there, and the page says what to do next.
  await page.goto(`/kpis/${kpi.id}`);
  await expect(page.getByTestId('overview-target')).toHaveText('50,000 USD');
  const first = page.getByTestId('overview-record-first');
  await expect(first).toContainText('No values yet');
  await first.getByRole('link', { name: 'Record a value' }).click();
  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}\\?tab=data$`));

  // With values.
  for (const [month, value] of [['08', 41000], ['09', 44500], ['10', 47200]] as const) {
    expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-28` } })).status()).toBe(201);
  }
  await page.goto(`/kpis/${kpi.id}`);
  await expect(page.getByTestId('overview-record-first')).toHaveCount(0);
  await expect(page.getByTestId('overview-latest')).toHaveText('47,200 USD');
  // The period the value is for, not the day it was entered.
  await expect(page.getByTestId('overview-latest-period')).toContainText('2026-10-01');
  await expect(page.getByTestId('overview-latest-period')).toContainText('2026-10-28');
  await expect(page.getByTestId('overview-attainment')).toHaveText('94% of target');
  // The trend says what it shows.
  await expect(page.getByTestId('overview-trend-caption')).toContainText('3 values');
  await expect(page.getByTestId('overview-trend-caption')).toContainText('target');

  // A KPI with no target says so, and where to set one.
  const bare = (await (await api.post('/kpis', { data: { name: `Bare ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  await page.goto(`/kpis/${bare.id}`);
  await expect(page.getByTestId('overview-target')).toHaveText('No target set');
});
