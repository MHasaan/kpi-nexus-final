/**
 * P5 RecommendationsModule. API-level e2e via Playwright request. Covers the
 * direct generate/list/status endpoints AND the alert→recommendation
 * auto-trigger chain (rule → breaching data point → alert → recommendation).
 * Requires the api at $API_URL with AI_MOCK_RESPONSE set (mock-first dev mode).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — ai-recommendations skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminApi(): Promise<APIRequestContext> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Recs E2E ${stamp}`,
      slug: `recs-${stamp}`,
      adminEmail: `admin-${stamp}@recs.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Recs Admin',
    },
  })).json()) as { accessToken: string };
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
}

async function makeKpi(api: APIRequestContext, stamp: string): Promise<string> {
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Latency ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'LOWER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  return kpi.id;
}

test('recommendations: generate persists content + confidence, status flips', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  const kpiId = await makeKpi(api, suffix());

  const gen = await api.post('/recommendations/generate', { data: { kpiId } });
  expect(gen.status()).toBe(201);
  const rec = (await gen.json()) as { id: string; status: string; confidence: number; content: unknown };
  expect(rec.status).toBe('PENDING');
  expect(typeof rec.confidence).toBe('number');
  expect(rec.content).toBeTruthy();

  // Lists for the KPI.
  const list = (await (await api.get(`/recommendations?kpiId=${kpiId}`)).json()) as Array<{ id: string }>;
  expect(list.some((r) => r.id === rec.id)).toBe(true);

  // Flip to ACTIONED.
  const patched = await api.patch(`/recommendations/${rec.id}/status`, { data: { status: 'ACTIONED' } });
  expect(patched.status()).toBe(200);
  expect((await patched.json()).status).toBe('ACTIONED');

  // PENDING is not an allowed target.
  expect((await api.patch(`/recommendations/${rec.id}/status`, { data: { status: 'PENDING' } })).status()).toBe(400);
});

test('recommendations: generate requires kpiId or alertId (400)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  expect((await api.post('/recommendations/generate', { data: {} })).status()).toBe(400);
});

test('recommendations: auto-triggered by an alert breach', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  const kpiId = await makeKpi(api, suffix());

  // Alert when value rises above 50 (LOWER_IS_BETTER → high is bad).
  const rule = await api.post('/alert-rules', {
    data: {
      kpiId,
      name: `Breach ${suffix()}`,
      ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 50 },
      severity: 'HIGH',
    },
  });
  expect(rule.status()).toBe(201);

  // Record a breaching data point → enqueues alert eval → alert → recommendation.
  const dp = await api.post(`/kpis/${kpiId}/data`, {
    data: { value: 100, periodStart: '2026-05-01', periodEnd: '2026-05-31' },
  });
  expect(dp.status()).toBe(201);

  // Poll for the auto-generated recommendation (worker is async).
  let found: { alertId: string | null } | undefined;
  for (let i = 0; i < 20; i += 1) {
    const recs = (await (await api.get(`/recommendations?kpiId=${kpiId}`)).json()) as Array<{ alertId: string | null }>;
    found = recs.find((r) => r.alertId != null);
    if (found) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  expect(found, 'a recommendation linked to the alert should appear within ~20s').toBeTruthy();
  expect(found!.alertId).toBeTruthy();
});

test('recommendations: requires auth (401)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.get('/recommendations')).status()).toBe(401);
});
