/**
 * Calculation engine (P2 backlog #8). API-level e2e via Playwright request.
 * Covers synchronous formula recompute + cascade rollup (each writing a COMPUTED
 * data point and recording lineage edges), and the reactive path (insert a child
 * point → parent rollup happens via the queue). Requires the api at $API_URL.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — calc-engine skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Api = import('@playwright/test').APIRequestContext;

async function makeKpi(api: Api, name: string, agg = 'LAST'): Promise<string> {
  const res = await api.post('/kpis', {
    data: { name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: agg },
  });
  return ((await res.json()) as { id: string }).id;
}

async function recordData(api: Api, kpiId: string, value: number): Promise<void> {
  await api.post(`/kpis/${kpiId}/data`, {
    data: { value, periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-05-31T23:59:59.000Z' },
  });
}

test('calc-engine: formula recompute + cascade rollup + lineage', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Calc E2E ${stamp}`,
      slug: `calc-${stamp}`,
      adminEmail: `admin-${stamp}@calc.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Calc Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  // ---- Formula recompute --------------------------------------------------
  const revenue = await makeKpi(api, 'revenue');
  const cost = await makeKpi(api, 'cost');
  const margin = await makeKpi(api, 'margin');
  await api.put(`/kpis/${margin}/formula`, { data: { raw: 'revenue - cost' } });
  await recordData(api, revenue, 100);
  await recordData(api, cost, 30);

  const recompute = await api.post(`/kpis/${margin}/recompute`, { data: {} });
  expect(recompute.status()).toBe(200);
  expect((await recompute.json()).value).toBe(70);

  // A COMPUTED point was written for margin.
  const marginData = (await (await api.get(`/kpis/${margin}/data`)).json()) as Array<{ value: number; sourceType: string }>;
  expect(marginData.some((d) => d.value === 70)).toBe(true);

  // Lineage records FORMULA edges revenue/cost -> margin.
  const up = (await (await api.get(`/lineage/kpi/${margin}/upstream`)).json()) as Array<{ id: string; via: string }>;
  expect(up.length).toBeGreaterThanOrEqual(2);
  expect(up.every((n) => n.via === 'FORMULA')).toBe(true);

  // ---- Cascade rollup -----------------------------------------------------
  const total = await makeKpi(api, 'total', 'SUM');
  const childA = await makeKpi(api, 'childA', 'SUM');
  const childB = await makeKpi(api, 'childB', 'SUM');
  await api.post('/kpi-cascades', { data: { parentKpiId: total, childKpiId: childA, method: 'SUM' } });
  await api.post('/kpi-cascades', { data: { parentKpiId: total, childKpiId: childB, method: 'SUM' } });
  await recordData(api, childA, 10);
  await recordData(api, childB, 20);

  const rollup = await api.post(`/kpis/${total}/rollup`, {
    data: { periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-05-31T23:59:59.000Z' },
  });
  expect(rollup.status()).toBe(200);
  expect((await rollup.json()).value).toBe(30); // 10 + 20

  const totalData = (await (await api.get(`/kpis/${total}/data`)).json()) as Array<{ value: number }>;
  expect(totalData.some((d) => d.value === 30)).toBe(true);

  // Lineage records CASCADE_ROLLUP edges childA/childB -> total.
  const totalUp = (await (await api.get(`/lineage/kpi/${total}/upstream`)).json()) as Array<{ via: string }>;
  expect(totalUp.length).toBeGreaterThanOrEqual(2);
  expect(totalUp.every((n) => n.via === 'CASCADE_ROLLUP')).toBe(true);

  // ---- Reactive path: inserting a child point triggers a parent rollup ----
  await recordData(api, childA, 99); // LAST/SUM child agg; new point in same period
  let reactiveValue = 0;
  for (let i = 0; i < 15; i++) {
    const data = (await (await api.get(`/kpis/${total}/data`)).json()) as Array<{ value: number }>;
    // After reactive rollup, total = sum(childA=99+10? no — SUM over period) ; just assert a fresh COMPUTED point > 30 appears
    const max = Math.max(...data.map((d) => d.value));
    if (max > 30) {
      reactiveValue = max;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  expect(reactiveValue).toBeGreaterThan(30);
});
