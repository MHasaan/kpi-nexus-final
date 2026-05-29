/**
 * Data lineage (P2 backlog #7). API-level e2e via Playwright request.
 * Covers the upstream/downstream/trace query endpoints (auth, validation, and
 * well-formed empty-graph results). BFS traversal correctness is exhaustively
 * covered by the lineage-graph unit tests; edge *recording* is a fire-and-forget
 * internal API consumed by the CalculationEngine (backlog #8).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-lineage skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('lineage: query endpoints — auth, validation, empty-graph shapes', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();

  // Unauthenticated access is rejected.
  const anon = await request.newContext({ baseURL: API_URL });
  const unauth = await anon.get('/lineage/kpi/whatever/upstream');
  expect(unauth.status()).toBe(401);

  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Lineage E2E ${stamp}`,
      slug: `lineage-${stamp}`,
      adminEmail: `admin-${stamp}@lineage.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Lineage Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const kpi = (await (await api.post('/kpis', {
    data: { name: `Lineage KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  // No edges recorded yet → empty results, well-formed.
  const up = await api.get(`/lineage/kpi/${kpi.id}/upstream`);
  expect(up.status()).toBe(200);
  expect(await up.json()).toEqual([]);

  const down = await api.get(`/lineage/kpi/${kpi.id}/downstream?depth=3`);
  expect(down.status()).toBe(200);
  expect(await down.json()).toEqual([]);

  const trace = await api.get(`/lineage/kpi/${kpi.id}/trace?maxDepth=5`);
  expect(trace.status()).toBe(200);
  expect(await trace.json()).toEqual({ upstream: [], downstream: [] });

  // Depth validation: 0 and non-numeric are rejected.
  expect((await api.get(`/lineage/kpi/${kpi.id}/upstream?depth=0`)).status()).toBe(400);
  expect((await api.get(`/lineage/kpi/${kpi.id}/upstream?depth=abc`)).status()).toBe(400);
  expect((await api.get(`/lineage/kpi/${kpi.id}/trace?maxDepth=999`)).status()).toBe(400);
});
