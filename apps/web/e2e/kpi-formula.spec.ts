/**
 * KPI formula persistence (P2 calc-engine foundations, plan Module 4). API-level
 * e2e via Playwright request. Covers attach (parse + dependency edges), unknown-
 * ref + parse-error + cycle rejection, get, detach. Each test uses a fresh org
 * so KPI names (which double as formula identifiers) are collision-free.
 * Requires the api at $API_URL (default localhost:4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-formula skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function makeKpi(api: import('@playwright/test').APIRequestContext, name: string): Promise<string> {
  const res = await api.post('/kpis', {
    data: { name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  });
  return ((await res.json()) as { id: string }).id;
}

test('formula: attach/detach + dependency edges + cycle/unknown/parse rejection', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Formula E2E ${stamp}`,
      slug: `formula-${stamp}`,
      adminEmail: `admin-${stamp}@formula.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Formula Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const revenue = await makeKpi(api, 'revenue');
  const cost = await makeKpi(api, 'cost');
  const margin = await makeKpi(api, 'margin');

  // No formula yet.
  expect(await (await api.get(`/kpis/${margin}/formula`)).json()).toBeNull();

  // Attach margin = revenue - cost.
  const attach = await api.put(`/kpis/${margin}/formula`, { data: { raw: 'revenue - cost' } });
  expect(attach.status()).toBe(200);
  expect((await attach.json()).raw).toBe('revenue - cost');

  // GET returns it.
  expect((await (await api.get(`/kpis/${margin}/formula`)).json()).raw).toBe('revenue - cost');

  // Unknown reference rejected.
  const unknown = await api.put(`/kpis/${margin}/formula`, { data: { raw: 'revenue - nope' } });
  expect(unknown.status()).toBe(400);
  expect((await unknown.json()).code).toBe('UNKNOWN_KPI_REFS');

  // Parse error rejected.
  const bad = await api.put(`/kpis/${margin}/formula`, { data: { raw: '(' } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).code).toBe('FORMULA_PARSE_ERROR');

  // Cycle rejected: margin depends on revenue; making revenue depend on margin cycles.
  const cycle = await api.put(`/kpis/${revenue}/formula`, { data: { raw: 'margin + 1' } });
  expect(cycle.status()).toBe(400);
  expect((await cycle.json()).code).toBe('FORMULA_CYCLE');

  // Detach → 204, then gone.
  expect((await api.delete(`/kpis/${margin}/formula`)).status()).toBe(204);
  expect(await (await api.get(`/kpis/${margin}/formula`)).json()).toBeNull();
});
