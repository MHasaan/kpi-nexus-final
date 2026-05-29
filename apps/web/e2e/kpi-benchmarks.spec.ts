/**
 * KPI benchmarks (P2 backlog #5). API-level e2e via Playwright request.
 * Covers manual CRUD + INTERNAL_HISTORICAL compute from recorded data points.
 * Requires the api at $API_URL (default http://localhost:4000).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-benchmarks skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('benchmarks: manual CRUD + compute internal historical from data points', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Bench E2E ${stamp}`,
      slug: `bench-${stamp}`,
      adminEmail: `admin-${stamp}@bench.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Bench Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const kpi = (await (await api.post('/kpis', {
    data: { name: `Bench KPI ${stamp}`, scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  // Empty to start.
  let list = (await (await api.get(`/kpis/${kpi.id}/benchmarks`)).json()) as unknown[];
  expect(list.length).toBe(0);

  // Manual external benchmark.
  const createRes = await api.post(`/kpis/${kpi.id}/benchmarks`, {
    data: { kind: 'EXTERNAL_INDUSTRY', value: 75, source: 'Gartner 2026' },
  });
  expect(createRes.status()).toBe(201);
  const manual = (await createRes.json()) as { id: string; kind: string; value: number; source: string };
  expect(manual.kind).toBe('EXTERNAL_INDUSTRY');
  expect(manual.value).toBe(75);
  expect(manual.source).toBe('Gartner 2026');

  // Compute with no data points → 400 NO_DATA.
  const noData = await api.post(`/kpis/${kpi.id}/benchmarks/compute`, { data: { days: 30 } });
  expect(noData.status()).toBe(400);
  expect((await noData.json()).code).toBe('NO_DATA');

  // Record three data points, then compute the internal-historical benchmark.
  for (const v of [60, 80, 100]) {
    await api.post(`/kpis/${kpi.id}/data`, {
      data: { value: v, periodStart: '2026-05-29T00:00:00.000Z', periodEnd: '2026-05-29T12:00:00.000Z' },
    });
  }
  const computeRes = await api.post(`/kpis/${kpi.id}/benchmarks/compute`, { data: { days: 30 } });
  expect(computeRes.status()).toBe(201);
  const computed = (await computeRes.json()) as { kind: string; value: number; source: string };
  expect(computed.kind).toBe('INTERNAL_HISTORICAL');
  expect(computed.value).toBeCloseTo(80, 5); // mean of 60, 80, 100
  expect(computed.source).toContain('computed:internal_historical');

  // List now has both; invalid kind rejected with 400.
  list = (await (await api.get(`/kpis/${kpi.id}/benchmarks`)).json()) as unknown[];
  expect(list.length).toBe(2);
  const bad = await api.post(`/kpis/${kpi.id}/benchmarks`, { data: { kind: 'NONSENSE', value: 1 } });
  expect(bad.status()).toBe(400);

  // Delete the manual one → 204, list drops to 1.
  const del = await api.delete(`/kpis/${kpi.id}/benchmarks/${manual.id}`);
  expect(del.status()).toBe(204);
  list = (await (await api.get(`/kpis/${kpi.id}/benchmarks`)).json()) as unknown[];
  expect(list.length).toBe(1);
});
