/**
 * P5 AI foundation (AiModule). API-level e2e via Playwright request. Covers the
 * per-feature routing config (list/override/revert), the spend budget (get +
 * patch caps), and BYO-key management (list/set/clear) — all gated by
 * ORG_SETTINGS. Requires the api at $API_URL (default localhost:4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — ai-foundation skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function registerOrg(): Promise<{ accessToken: string }> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  return (await (await anon.post('/auth/register', {
    data: {
      orgName: `AI E2E ${stamp}`,
      slug: `ai-${stamp}`,
      adminEmail: `admin-${stamp}@ai.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'AI Admin',
    },
  })).json()) as { accessToken: string };
}

interface FeatureConfig {
  feature: string;
  provider: string;
  model: string;
  isOverride: boolean;
}

test('ai configs: lists 11 features with defaults, overrides one, reverts it', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { accessToken } = await registerOrg();
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${accessToken}` },
  });

  // Defaults: 11 features, none overridden, NLQ on free Gemini.
  const list = (await (await api.get('/ai/configs')).json()) as FeatureConfig[];
  expect(list).toHaveLength(11);
  expect(list.every((c) => c.isOverride === false)).toBe(true);
  const nlq = list.find((c) => c.feature === 'NLQ_PRIMARY')!;
  expect(nlq.provider).toBe('GEMINI');
  expect(nlq.model).toBe('gemini-3.5-flash'); // free-tier reasoning tier (2026-10-09)

  // Override INSIGHTS to Claude.
  const put = await api.put('/ai/configs/INSIGHTS', {
    data: { providerId: 'CLAUDE', model: 'claude-haiku-4-5' },
  });
  expect(put.status()).toBe(200);
  const after = (await (await api.get('/ai/configs')).json()) as FeatureConfig[];
  const insights = after.find((c) => c.feature === 'INSIGHTS')!;
  expect(insights.isOverride).toBe(true);
  expect(insights.provider).toBe('CLAUDE');

  // Unknown feature → 400.
  expect((await api.put('/ai/configs/NOPE', { data: { providerId: 'CLAUDE', model: 'x' } })).status()).toBe(400);

  // Revert.
  expect((await api.delete('/ai/configs/INSIGHTS')).status()).toBe(200);
  const reverted = (await (await api.get('/ai/configs')).json()) as FeatureConfig[];
  expect(reverted.find((c) => c.feature === 'INSIGHTS')!.isOverride).toBe(false);
});

test('ai budget: defaults to $1/day $30/mo and accepts cap updates', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { accessToken } = await registerOrg();
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${accessToken}` },
  });

  const budget = (await (await api.get('/ai/budget')).json()) as {
    dailyCapUsd: number;
    monthlyCapUsd: number;
    circuitBreaker: string;
    dailySpend: number;
  };
  expect(budget.dailyCapUsd).toBe(1);
  expect(budget.monthlyCapUsd).toBe(30);
  expect(budget.circuitBreaker).toBe('FAIL_CLOSED');
  expect(budget.dailySpend).toBe(0);

  const patched = (await (await api.patch('/ai/budget', {
    data: { dailyCapUsd: 5, circuitBreaker: 'FALLBACK' },
  })).json()) as { dailyCapUsd: number; circuitBreaker: string };
  expect(patched.dailyCapUsd).toBe(5);
  expect(patched.circuitBreaker).toBe('FALLBACK');
});

test('ai BYO keys: lists providers, stores + clears an encrypted key', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { accessToken } = await registerOrg();
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${accessToken}` },
  });

  const before = (await (await api.get('/ai/providers/byok')).json()) as Array<{ key: string; configured: boolean }>;
  expect(before).toHaveLength(4);
  expect(before.every((p) => p.configured === false)).toBe(true);

  // Reject a malformed key.
  expect((await api.post('/ai/providers/GEMINI/byok', { data: { apiKey: 'not-a-key' } })).status()).toBe(400);

  // Store a well-formed (fake) Gemini key — ping may fail (non-fatal), still stored.
  const set = await api.post('/ai/providers/GEMINI/byok', {
    data: { apiKey: 'AIzaSyFAKE_KEY_FOR_E2E_TESTING_000001' },
  });
  expect(set.status()).toBe(201);
  expect((await set.json()).configured).toBe(true);

  const after = (await (await api.get('/ai/providers/byok')).json()) as Array<{ key: string; configured: boolean }>;
  expect(after.find((p) => p.key === 'GEMINI')!.configured).toBe(true);

  // Clear it.
  expect((await api.delete('/ai/providers/GEMINI/byok')).status()).toBe(200);
  const cleared = (await (await api.get('/ai/providers/byok')).json()) as Array<{ key: string; configured: boolean }>;
  expect(cleared.find((p) => p.key === 'GEMINI')!.configured).toBe(false);
});

test('ai endpoints require auth (401 without a token)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.get('/ai/configs')).status()).toBe(401);
  expect((await anon.get('/ai/budget')).status()).toBe(401);
  expect((await anon.get('/ai/providers/byok')).status()).toBe(401);
});
