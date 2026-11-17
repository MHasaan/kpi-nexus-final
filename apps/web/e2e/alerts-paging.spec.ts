/**
 * Plan 7.5: the alerts list showed its newest hundred and nothing led to the
 * rest; an alert's delivery trail was picked out of the organisation's newest
 * hundred deliveries in the browser, so an older alert's trail was empty.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('alerts: older ones can be loaded; the API pages and filters deliveries by alert', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `apg-${stamp}`,
      slug: `apg-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@apg.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Errors ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await api.post('/alert-rules', { data: { kpiId: kpi.id, name: `Any error ${stamp}`, ruleType: 'STATIC_THRESHOLD', severity: 'LOW', config: { operator: '>', value: 0 } } })).status()).toBe(201);
  // 55 breaching values, one per day: 55 alerts — more than one page of 50.
  const TOTAL = 55;
  for (let i = 0; i < TOTAL; i += 1) {
    const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: i + 1, periodStart: day, periodEnd: day } })).status()).toBe(201);
  }
  await expect.poll(async () => ((await (await api.get(`/alerts?kpiId=${kpi.id}&limit=500`)).json()) as unknown[]).length, { timeout: 60_000, intervals: [1000] }).toBe(TOTAL);

  // The API: pages do not overlap and together are everything.
  const first = (await (await api.get(`/alerts?kpiId=${kpi.id}&limit=50`)).json()) as Array<{ id: string }>;
  const rest = (await (await api.get(`/alerts?kpiId=${kpi.id}&limit=50&before=${first.at(-1)!.id}`)).json()) as Array<{ id: string }>;
  expect(first).toHaveLength(50);
  expect(rest).toHaveLength(5);
  expect(new Set([...first, ...rest].map((a) => a.id)).size).toBe(TOTAL);
  // …and deliveries can be asked for by alert.
  const trail = await api.get(`/notification-deliveries?alertId=${first[0]!.id}`);
  expect(trail.status()).toBe(200);
  expect(((await trail.json()) as Array<{ alertId: string }>).every((d) => d.alertId === first[0]!.id)).toBe(true);

  // The page: fifty, then the rest on request, then nothing more to load.
  await page.goto('/alerts');
  const rows = page.locator('[data-testid^="alert-row-"]');
  await expect(rows).toHaveCount(50);
  await page.getByTestId('alerts-load-more').click();
  await expect(rows).toHaveCount(TOTAL);
  await expect(page.getByTestId('alerts-load-more')).toHaveCount(0);
});
