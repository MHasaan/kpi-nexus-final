/**
 * KPI targets (P2 backlog #3). API-level e2e via Playwright request context.
 * Covers per-type validation + resolveActive.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-targets skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('KPI targets: per-type validation + active resolution', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Targets E2E ${stamp}`,
      slug: `targets-${stamp}`,
      adminEmail: `admin-${stamp}@targets.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Targets Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const kpi = (await (await api.post('/kpis', {
    data: { name: `Target KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', unit: 'pts', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  // STATIC without value → 400.
  expect((await api.post(`/kpis/${kpi.id}/targets`, { data: { type: 'STATIC' } })).status()).toBe(400);
  // STATIC with value → 201.
  expect((await api.post(`/kpis/${kpi.id}/targets`, { data: { type: 'STATIC', value: 100 } })).status()).toBe(201);

  // TIERED with bad ordering (HIGHER_IS_BETTER expects ascending) → 400.
  expect(
    (await api.post(`/kpis/${kpi.id}/targets`, { data: { type: 'TIERED', minValue: 30, expectedValue: 20, stretchValue: 10 } })).status(),
  ).toBe(400);
  // TIERED ascending → 201.
  expect(
    (await api.post(`/kpis/${kpi.id}/targets`, { data: { type: 'TIERED', minValue: 10, expectedValue: 20, stretchValue: 30 } })).status(),
  ).toBe(201);

  // TIME_VARYING window covering now → becomes the active target.
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const tv = await api.post(`/kpis/${kpi.id}/targets`, {
    data: { type: 'TIME_VARYING', value: 42, effectiveFrom: past, effectiveTo: future },
  });
  expect(tv.status()).toBe(201);
  const tvId = ((await tv.json()) as { id: string }).id;

  // List shows all created targets.
  const list = (await (await api.get(`/kpis/${kpi.id}/targets`)).json()) as unknown[];
  expect(list.length).toBe(3);

  // Active resolves to the time-varying window (most recent effectiveFrom).
  const active = (await (await api.get(`/kpis/${kpi.id}/targets/active`)).json()) as { id: string } | null;
  expect(active?.id).toBe(tvId);
});
