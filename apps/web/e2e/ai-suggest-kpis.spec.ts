/**
 * P5 KpiSuggestionsModule. API-level e2e via Playwright request. Exercises
 * POST /ai/suggest-kpis (KPI_CREATE) end-to-end through the router + mock
 * provider. Requires the api at $API_URL with AI_MOCK_RESPONSE set to a valid
 * suggestions JSON (mock-first dev mode). Requires the api at $API_URL.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — ai-suggest-kpis skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminApi() {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Suggest E2E ${stamp}`,
      slug: `suggest-${stamp}`,
      adminEmail: `admin-${stamp}@suggest.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Suggest Admin',
    },
  })).json()) as { accessToken: string };
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
}

interface Suggestion { name: string; type: string; direction: string }

test('suggest-kpis: returns validated suggestions parsed from the model JSON', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();

  const res = await api.post('/ai/suggest-kpis', { data: { count: 3 } });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { suggestions: Suggestion[] };
  expect(Array.isArray(body.suggestions)).toBe(true);
  // With the mocked suggestions JSON the parser yields the canned KPI.
  expect(body.suggestions.length).toBeGreaterThanOrEqual(1);
  const first = body.suggestions[0]!;
  expect(first.name).toBeTruthy();
  expect(['NUMBER', 'PERCENTAGE', 'CURRENCY', 'DURATION', 'COUNT', 'RATING', 'BOOLEAN']).toContain(first.type);
});

test('suggest-kpis: rejects an out-of-range count (400)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  expect((await api.post('/ai/suggest-kpis', { data: { count: 99 } })).status()).toBe(400);
});

test('suggest-kpis: requires auth (401)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.post('/ai/suggest-kpis', { data: { count: 3 } })).status()).toBe(401);
});
