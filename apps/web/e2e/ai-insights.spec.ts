/**
 * P5 InsightsModule. API-level e2e via Playwright request. Creates a KPI with a
 * few data points, then exercises generate / generate-batch / list /
 * schedule-daily through the router + mock provider. Requires the api at
 * $API_URL with AI_MOCK_RESPONSE set (mock-first dev mode).
 */
import { type APIRequestContext, expect, request, test } from '@playwright/test';

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
  if (!apiAvailable) console.warn('[skip] api not reachable — ai-insights skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminApi(): Promise<APIRequestContext> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Insights E2E ${stamp}`,
      slug: `insights-${stamp}`,
      adminEmail: `admin-${stamp}@insights.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Insights Admin',
    },
  })).json()) as { accessToken: string };
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
}

async function makeKpiWithData(api: APIRequestContext, stamp: string): Promise<string> {
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  const months = [
    ['2026-01-01', '2026-01-31', 100],
    ['2026-02-01', '2026-02-28', 130],
    ['2026-03-01', '2026-03-31', 175],
  ] as const;
  for (const [periodStart, periodEnd, value] of months) {
    const res = await api.post(`/kpis/${kpi.id}/data`, { data: { value, periodStart, periodEnd } });
    expect(res.status()).toBe(201);
  }
  return kpi.id;
}

test('insights: generate persists a narrative for a KPI with enough points', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  const kpiId = await makeKpiWithData(api, suffix());

  const res = await api.post('/insights/generate', { data: { kpiId } });
  expect(res.status()).toBe(201);
  const { insight } = (await res.json()) as { insight: { kpiId: string; narrative: string; model: string } | null };
  expect(insight).not.toBeNull();
  expect(insight!.kpiId).toBe(kpiId);
  expect(insight!.narrative.length).toBeGreaterThan(0);

  // It now appears in the list.
  const list = (await (await api.get(`/insights?kpiId=${kpiId}`)).json()) as Array<{ kpiId: string }>;
  expect(list.length).toBeGreaterThanOrEqual(1);
  expect(list[0]!.kpiId).toBe(kpiId);
});

test('insights: generate returns null for a KPI with too few points (no crash)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Sparse ${suffix()}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  const res = await api.post('/insights/generate', { data: { kpiId: kpi.id } });
  expect(res.status()).toBe(201);
  expect((await res.json()).insight).toBeNull();
});

test('insights: generate-batch summarizes the most-changed KPIs', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  await makeKpiWithData(api, suffix()); // +75% change → over the 10% threshold

  const res = await api.post('/insights/generate-batch', { data: { thresholdChangePct: 10 } });
  expect(res.status()).toBe(201);
  const { insights } = (await res.json()) as { insights: unknown[] };
  expect(Array.isArray(insights)).toBe(true);
  expect(insights.length).toBeGreaterThanOrEqual(1);
});

test('insights: schedule-daily registers the cron (ORG_SETTINGS)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  const res = await api.post('/insights/schedule-daily', { data: {} });
  expect(res.status()).toBe(201);
  expect((await res.json()).scheduled).toBe(true);
});

test('insights: requires auth (401)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.get('/insights')).status()).toBe(401);
});
