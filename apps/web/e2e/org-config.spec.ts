/**
 * Org-structure config (P1 OrgUnitDimensions/Types) + CustomDomains. API-level
 * e2e via Playwright request. Requires the api at $API_URL (default :4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — org-config skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminApi(stamp: string): Promise<import('@playwright/test').APIRequestContext> {
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `OrgConfig E2E ${stamp}`,
      slug: `orgconfig-${stamp}`,
      adminEmail: `admin-${stamp}@orgconfig.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'OrgConfig Admin',
    },
  })).json()) as { accessToken: string };
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
}

test('org-structure: dimension + type CRUD + in-use guards', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const api = await adminApi(stamp);

  const dim = (await (await api.post('/org-unit-dimensions', { data: { name: `Geography ${stamp}` } })).json()) as { id: string };
  expect(dim.id).toBeTruthy();

  const dims = (await (await api.get('/org-unit-dimensions')).json()) as Array<{ id: string }>;
  expect(dims.some((d) => d.id === dim.id)).toBe(true);

  const type = (await (await api.post('/org-unit-types', {
    data: { name: `Region ${stamp}`, namePlural: `Regions ${stamp}`, dimensionId: dim.id, icon: 'globe' },
  })).json()) as { id: string };
  expect(type.id).toBeTruthy();

  const types = (await (await api.get(`/org-unit-types?dimensionId=${dim.id}`)).json()) as Array<{ id: string }>;
  expect(types.some((t) => t.id === type.id)).toBe(true);

  // Deleting a dimension that still has types is rejected.
  const blocked = await api.delete(`/org-unit-dimensions/${dim.id}`);
  expect(blocked.status()).toBe(400);

  // Delete the type, then the dimension.
  expect((await api.delete(`/org-unit-types/${type.id}`)).status()).toBe(204);
  expect((await api.delete(`/org-unit-dimensions/${dim.id}`)).status()).toBe(204);
});

test('custom-domains: register + verify (unverified) + duplicate + delete', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const api = await adminApi(stamp);
  const domain = `dash.acme-${stamp}.test`;

  const reg = await api.post('/custom-domains', { data: { domain } });
  expect(reg.status()).toBe(201);
  const cd = (await reg.json()) as { id: string; txtChallengeKey: string; txtChallengeValue: string; verifiedAt: string | null };
  expect(cd.txtChallengeKey).toContain('_kpinexus-challenge.');
  expect(cd.txtChallengeValue).toContain('kpinexus-verify=');
  expect(cd.verifiedAt).toBeNull();

  // Duplicate registration is rejected.
  expect((await api.post('/custom-domains', { data: { domain } })).status()).toBe(409);

  // Verify a domain with no real TXT record → stays unverified with an error.
  const verify = await api.post(`/custom-domains/${cd.id}/verify`);
  expect(verify.status()).toBe(200);
  const after = (await verify.json()) as { verifiedAt: string | null; lastCheckError: string | null };
  expect(after.verifiedAt).toBeNull();
  expect(after.lastCheckError).toBeTruthy();

  expect((await api.delete(`/custom-domains/${cd.id}`)).status()).toBe(204);
});
