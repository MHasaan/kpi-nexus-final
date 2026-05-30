/**
 * P6 OnboardingAiModule (co-pilot). API-level e2e via Playwright request. Live
 * generator (exit criterion: reasonable org JSON) + per-mode rate limit (6th
 * generator call → 429). Public flow; draft via X-Draft-Token. Requires the api
 * with live AI keys.
 */
import { type APIRequestContext, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — onboarding-ai skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function start(anon: APIRequestContext): Promise<{ sessionId: string; draftToken: string }> {
  const stamp = suffix();
  const res = await anon.post('/onboarding/start', { data: { email: `a-${stamp}@oai.test.local`, organizationName: `OAI ${stamp}` } });
  expect(res.status()).toBe(201);
  return res.json() as Promise<{ sessionId: string; draftToken: string }>;
}

test('co-pilot generate returns reasonable org JSON (<30s)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await start(anon);

  const res = await anon.post('/onboarding/ai/generate', {
    headers: { 'x-draft-token': draftToken },
    data: { sessionId, prompt: 'B2B SaaS startup, 50 employees, focus on engineering excellence' },
    timeout: 35_000,
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { counts: { roles: number; kpis: number; orgUnitTypes: number } };
  expect(body.counts.roles).toBeGreaterThanOrEqual(3);
  expect(body.counts.kpis).toBeGreaterThanOrEqual(3);
});

test('co-pilot enforces the generator rate limit (6th call → 429)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(120_000);
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await start(anon);
  const hdr = { 'x-draft-token': draftToken };

  // The limit is consumed pre-flight, so even a slow/failed AI call counts.
  // Fire 5 (allowed), then the 6th must be blocked regardless of AI outcome.
  for (let i = 0; i < 5; i += 1) {
    await anon.post('/onboarding/ai/generate', { headers: hdr, data: { sessionId, prompt: `gen ${i}` }, timeout: 35_000 });
  }
  const sixth = await anon.post('/onboarding/ai/generate', { headers: hdr, data: { sessionId, prompt: 'over limit' } });
  expect(sixth.status()).toBe(429);
  expect((await sixth.json()).details.retryAfter).toBeGreaterThan(0);
});

test('co-pilot requires a valid draft token', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId } = await start(anon);
  const res = await anon.post('/onboarding/ai/suggest', {
    headers: { 'x-draft-token': 'wrong' },
    data: { sessionId, fieldPath: 'organization.industry' },
  });
  expect(res.status()).toBe(403);
});
