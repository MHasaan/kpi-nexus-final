/**
 * Manual QA (2026-11-20, F-071): a KPI's Lineage tab read "kpi:cmwmyjra CASCADE_ROLLUP" — a raw id and a code,
 * not a link — and its Benchmarks tab "EXTERNAL_INDUSTRY: 260000 (SaaS Capital)". Both now name things and
 * format numbers.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('lineage names the KPIs and says how they connect; benchmarks read in words with formatted numbers', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `lin-${stamp}`,
      slug: `lin-${stamp}`,
      adminFullName: 'Lia Admin',
      adminEmail: `admin-${stamp}@lin.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const make = async (name: string) => ((await (await api.post('/kpis', { data: { name: `${name} ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', aggregationMethod: 'SUM' } })).json()) as { id: string }).id;
  const mrr = await make('MRR');
  const bookings = await make('New Bookings');
  expect((await api.post('/kpi-cascades', { data: { parentKpiId: mrr, childKpiId: bookings, method: 'SUM' } })).status()).toBe(201);
  // Lineage is recorded when a roll-up runs: a value on the child, then the parent worked out.
  const period = { periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-31T23:59:59.000Z' };
  expect((await api.post(`/kpis/${bookings}/data`, { data: { value: 92000, ...period } })).status()).toBe(201);
  expect((await api.post(`/kpis/${mrr}/rollup`, { data: period })).status()).toBe(200);
  await expect.poll(async () => ((await (await api.get(`/lineage/kpi/${mrr}/upstream`)).json()) as unknown[]).length).toBeGreaterThan(0);
  expect((await api.post(`/kpis/${mrr}/benchmarks`, { data: { kind: 'EXTERNAL_INDUSTRY', value: 260000, source: 'SaaS Capital 2026 survey' } })).status()).toBe(201);

  await page.goto(`/kpis/${mrr}?tab=lineage`);
  const upstream = page.getByTestId('lineage-upstream');
  await expect(upstream.getByRole('link', { name: `New Bookings ${stamp}` })).toBeVisible();
  await expect(upstream).toContainText('rolls up into this KPI');
  await expect(upstream).not.toContainText('CASCADE_ROLLUP');
  await expect(upstream).not.toContainText('kpi:');

  await page.goto(`/kpis/${mrr}?tab=benchmarks`);
  const rows = page.getByTestId('benchmark-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Industry benchmark');
  await expect(rows.first()).toContainText('260,000');
  await expect(rows.first()).toContainText('SaaS Capital 2026 survey');
  await expect(rows.first()).not.toContainText('EXTERNAL_INDUSTRY');
});
