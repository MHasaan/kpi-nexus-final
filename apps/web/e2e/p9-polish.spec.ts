/**
 * P9 Polish — API-level e2e (Playwright request). Hermetic exit criteria:
 *   1. SCIM round-trip — mint token → provision (INVITED) → PATCH active=false
 *      (SUSPENDED) → DELETE (ARCHIVED), via /scim/v2 with the bearer token
 *   2. Global search returns a freshly-created KPI
 *   3. Activity feed surfaces audited actions
 *   4. Retention tier preset applies to all entity types
 * (SAML SSO round-trip needs a real IdP and is manual; JIT logic is unit-tested.)
 * Requires the api at $API_URL.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — p9-polish skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminCtx(): Promise<{ ctx: APIRequestContext; stamp: string }> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = await anon.post('/auth/register', {
    data: { orgName: `P9 ${stamp}`, slug: `p9-${stamp}`, adminEmail: `admin-${stamp}@p9.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'P9 Admin' },
  });
  expect(reg.status()).toBe(201);
  const { accessToken } = (await reg.json()) as { accessToken: string };
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${accessToken}` } });
  return { ctx, stamp };
}

test('SCIM round-trip: provision (INVITED) → deactivate (SUSPENDED) → delete (ARCHIVED)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx, stamp } = await adminCtx();

  // Admin mints a SCIM token.
  const mint = await ctx.post('/scim/tokens', { data: { label: 'Okta' } });
  expect(mint.status()).toBe(201);
  const { token } = (await mint.json()) as { token: string };
  // Mirror a real IdP (Okta) which sends content-type on every request — incl.
  // the bodyless DELETE. The api's onRequest hook strips a stale JSON
  // content-type from empty requests so Fastify's strict parser doesn't 400.
  const scim = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });

  // Provision a user.
  const userName = `scim-${stamp}@p9.test.local`;
  const created = await scim.post('/scim/v2/Users', { data: { userName, name: { givenName: 'Scim', familyName: 'User' } } });
  expect(created.status()).toBe(201);
  const scimUser = (await created.json()) as { id: string; active: boolean };
  expect(scimUser.active).toBe(true);

  // Admin sees the new user as INVITED.
  const users = (await (await ctx.get('/users')).json()) as Array<{ email: string; status: string }>;
  expect(users.find((u) => u.email === userName)?.status).toBe('INVITED');

  // Deactivate (active=false) → SUSPENDED.
  const patched = await scim.patch(`/scim/v2/Users/${scimUser.id}`, { data: { Operations: [{ op: 'replace', path: 'active', value: false }] } });
  expect(patched.status()).toBe(200);
  expect(((await patched.json()) as { active: boolean }).active).toBe(false);
  let after = (await (await ctx.get('/users')).json()) as Array<{ email: string; status: string }>;
  expect(after.find((u) => u.email === userName)?.status).toBe('SUSPENDED');

  // Delete → ARCHIVED.
  expect((await scim.delete(`/scim/v2/Users/${scimUser.id}`)).status()).toBe(204);
  after = (await (await ctx.get('/users')).json()) as Array<{ email: string; status: string }>;
  expect(after.find((u) => u.email === userName)?.status).toBe('ARCHIVED');

  // An unauthenticated SCIM call is rejected.
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.get('/scim/v2/Users')).status()).toBe(401);
});

test('global search returns a freshly-created KPI', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx, stamp } = await adminCtx();
  const name = `SearchMe ${stamp}`;
  const kpi = await ctx.post('/kpis', { data: { name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST' } });
  expect(kpi.status()).toBe(201);
  const kpiId = ((await kpi.json()) as { id: string }).id;

  const results = (await (await ctx.get(`/search?q=${encodeURIComponent('SearchMe')}`)).json()) as Array<{ type: string; id: string }>;
  expect(results.some((r) => r.type === 'kpi' && r.id === kpiId)).toBe(true);
});

test('activity feed surfaces audited actions', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx, stamp } = await adminCtx();
  // Generate some auditable activity.
  await ctx.post('/kpi-categories', { data: { name: `Cat ${stamp}` } });
  const page = (await (await ctx.get('/activity?limit=10')).json()) as { items: Array<{ action: string }>; nextCursor: string | null };
  expect(page.items.length).toBeGreaterThan(0);
});

test('retention tier preset applies to all entity types', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx } = await adminCtx();
  const applied = await ctx.post('/retention-policies/apply-tier', { data: { tier: 'PRO' } });
  expect(applied.status()).toBe(200);
  const policies = (await applied.json()) as Array<{ entityType: string; days: number }>;
  expect(policies.length).toBeGreaterThan(0);
  expect(policies.every((p) => p.days === 365)).toBe(true);
});
