/**
 * Flow walk, 2026-11-18. On the home page:
 *  - a KPI at 94% of its target, with rising values, carried a red "▼ 6%" —
 *    the gap to target drawn as if it were a fall;
 *  - "Attainment vs target" was one unlabelled block for one KPI;
 *  - with a target set and no value yet it said "No targets set".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('home page: attainment is said in words, per KPI, and the empty state says what is really missing', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `har-${stamp}`,
      slug: `har-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@har.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const name = `Revenue ${stamp}`;
  const kpi = (await (await api.post('/kpis', {
    data: { name, scope: 'ORG_WIDE', unit: 'USD', direction: 'HIGHER_IS_BETTER', targetValue: 50000 },
  })).json()) as { id: string };

  // A target and no value: the card says values are missing, not targets.
  await page.goto('/dashboard');
  const card = page.getByTestId('dashboard-attainment-bar');
  await expect(card).toContainText('No values yet');
  await expect(card).not.toContainText('No targets set');

  const today = new Date().toISOString().slice(0, 10);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 47200, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);
  await page.reload();

  // In the list: "94% of target", not an arrow.
  const row = page.getByTestId(`dashboard-card-${name}`);
  await expect(row.getByTestId('kpi-row-attainment')).toHaveText('94% of target');
  await expect(row).not.toContainText('▼');
  await expect(row).not.toContainText('▲');

  // In the card: the KPI by name with its percentage.
  const bar = card.getByTestId(`attainment-row-${name}`);
  await expect(bar).toContainText(name);
  await expect(bar).toContainText('94%');
});
