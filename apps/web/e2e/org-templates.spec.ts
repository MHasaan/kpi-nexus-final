/**
 * P6 OrgTemplatesModule. API-level e2e via Playwright request. The read
 * endpoints are PUBLIC (used during onboarding before auth). Verifies the rich
 * SaaS template reproduces seed.ts depth. Requires the api at $API_URL.
 */
import { expect, request, test } from '@playwright/test';

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
  if (!apiAvailable) console.warn('[skip] api not reachable — org-templates skipped');
});

interface Summary { slug: string; tier: string; counts: { roles: number; positions: number; orgUnits: number; kpis: number; kpiCategories: number } }

test('org-templates: public list includes the rich SaaS template with seed.ts depth', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });

  const list = (await (await anon.get('/org-templates')).json()) as Summary[];
  expect(list.length).toBeGreaterThanOrEqual(4);
  const rich = list.find((t) => t.slug === 'saas-startup-rich')!;
  expect(rich.tier).toBe('rich');
  expect(rich.counts).toEqual({ roles: 10, positions: 14, orgUnitTypes: 3, orgUnits: 11, kpiCategories: 5, kpis: 20 } as unknown as Summary['counts']);
});

test('org-templates: preview returns the full payload', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  const res = await anon.get('/org-templates/saas-startup-rich');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { payload: { roles: unknown[]; kpis: unknown[] } };
  expect(body.payload.roles).toHaveLength(10);
  expect(body.payload.kpis).toHaveLength(20);
});

test('org-templates: filter by tier + unknown slug 404', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  const starters = (await (await anon.get('/org-templates?tier=starter')).json()) as Summary[];
  expect(starters.length).toBeGreaterThanOrEqual(1);
  expect(starters.every((t) => t.tier === 'starter')).toBe(true);
  expect((await anon.get('/org-templates/does-not-exist')).status()).toBe(404);
});
