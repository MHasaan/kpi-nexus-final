/**
 * P5 AnalyticsModule (ML-backed). API-level e2e via Playwright request. Exercises
 * the full cross-process chain api → Python ML sidecar (HMAC-signed): anomaly
 * detect/confirm, forecast, what-if. Requires BOTH the api ($API_URL) and the
 * ML sidecar (uvicorn :8000) running with matching ML_SIDECAR_HMAC_SECRET.
 */
import { type APIRequestContext, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const ML_URL = process.env.ML_SIDECAR_URL ?? 'http://localhost:8000';

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let ready = false;
test.beforeAll(async () => {
  ready = (await up(API_URL)) && (await up(ML_URL));
  if (!ready) console.warn('[skip] api or ML sidecar not reachable — ai-analytics skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminApi(): Promise<APIRequestContext> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Analytics E2E ${stamp}`,
      slug: `analytics-${stamp}`,
      adminEmail: `admin-${stamp}@analytics.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Analytics Admin',
    },
  })).json()) as { accessToken: string };
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
}

/** A KPI with a clear spike at month index 9 + a rising trend tail. */
async function makeKpiWithSpike(api: APIRequestContext): Promise<string> {
  const stamp = suffix();
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Latency ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'LOWER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  const values = [10, 11, 9, 10, 12, 8, 10, 11, 9, 100, 10, 9];
  for (let i = 0; i < values.length; i += 1) {
    const month = String(i + 1).padStart(2, '0');
    const res = await api.post(`/kpis/${kpi.id}/data`, {
      data: { value: values[i], periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-28` },
    });
    expect(res.status()).toBe(201);
  }
  return kpi.id;
}

test('anomaly: detect flags the spike, persist + confirm flips isConfirmed', async () => {
  test.skip(!ready, 'api/ML not reachable');
  const api = await adminApi();
  const kpiId = await makeKpiWithSpike(api);

  const det = await api.post(`/kpis/${kpiId}/anomalies/detect`, { data: { method: 'zscore', threshold: 3, persist: true } });
  expect(det.status()).toBe(201);
  const body = (await det.json()) as { anomalies: Array<{ index: number; id?: string }> };
  const spike = body.anomalies.find((a) => a.index === 9);
  expect(spike, 'the index-9 spike should be flagged by the ML sidecar').toBeTruthy();
  expect(spike!.id, 'persisted anomaly should have an id').toBeTruthy();

  // It is listed.
  const list = (await (await api.get(`/kpis/${kpiId}/anomalies`)).json()) as Array<{ id: string; isConfirmed: boolean }>;
  expect(list.length).toBeGreaterThanOrEqual(1);

  // Confirm flips isConfirmed.
  const confirmed = await api.patch(`/kpis/${kpiId}/anomalies/${spike!.id}/confirm`, { data: {} });
  expect(confirmed.status()).toBe(200);
  expect((await confirmed.json()).isConfirmed).toBe(true);
});

test('forecast: returns predictions with confidence bands via the sidecar', async () => {
  test.skip(!ready, 'api/ML not reachable');
  const api = await adminApi();
  const kpiId = await makeKpiWithSpike(api);

  const res = await api.post(`/kpis/${kpiId}/forecasts`, { data: { horizon: 3 } });
  expect(res.status()).toBe(201);
  const fc = (await res.json()) as { horizon: number; model: string; predictions: Array<Record<string, number>> };
  expect(fc.horizon).toBe(3);
  expect(fc.model).toBe('NAIVE'); // the default model
  expect(fc.predictions).toHaveLength(3);
  const p = fc.predictions[0]!;
  expect(p.yhat_lower_95).toBeLessThanOrEqual(p.yhat_upper_95 as number);

  const list = (await (await api.get(`/kpis/${kpiId}/forecasts`)).json()) as unknown[];
  expect(list.length).toBeGreaterThanOrEqual(1);
});

for (const [requested, saved] of [
  ['prophet', 'PROPHET'],
  ['arima', 'ARIMA'],
] as const) {
  test(`forecast: ${requested} runs in the sidecar and is saved as ${saved} (OT-005)`, async () => {
    test.skip(!ready, 'api/ML not reachable');
    test.setTimeout(60_000);
    const api = await adminApi();
    const kpiId = await makeKpiWithSpike(api);

    const res = await api.post(`/kpis/${kpiId}/forecasts`, { data: { horizon: 3, model: requested } });
    expect(res.status()).toBe(201);
    const fc = (await res.json()) as { model: string; predictions: Array<Record<string, number | string>> };
    expect(fc.model).toBe(saved);
    expect(fc.predictions).toHaveLength(3);
    const p = fc.predictions[0]!;
    expect(p.yhat_lower_95 as number).toBeLessThanOrEqual(p.yhat as number);
    expect(p.yhat as number).toBeLessThanOrEqual(p.yhat_upper_95 as number);

    const listed = (await (await api.get(`/kpis/${kpiId}/forecasts?model=${requested}`)).json()) as Array<{ model: string }>;
    expect(listed.map((f) => f.model)).toEqual([saved]);
  });
}

test('whatif: simulates a multiplicative scenario via the sidecar', async () => {
  test.skip(!ready, 'api/ML not reachable');
  const api = await adminApi();
  const kpiId = await makeKpiWithSpike(api);

  const res = await api.post(`/kpis/${kpiId}/whatif`, {
    data: { scenarios: [{ deltaPct: 10, mechanic: 'multiplicative' }], baselineCount: 6 },
  });
  expect(res.status()).toBe(201);
  const out = (await res.json()) as { baseline: number[]; scenarios: Array<{ aggregateLiftPct: number }> };
  expect(out.baseline.length).toBeGreaterThan(0);
  expect(out.scenarios[0]!.aggregateLiftPct).toBeCloseTo(10, 1);
});

test('analytics endpoints require auth (401)', async () => {
  test.skip(!ready, 'api/ML not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.post('/kpis/anything/anomalies/detect', { data: {} })).status()).toBe(401);
  expect((await anon.post('/kpis/anything/forecasts', { data: { horizon: 3 } })).status()).toBe(401);
});
