/**
 * P6 OnboardingModule. API-level e2e via Playwright request. The headline test
 * reproduces the seed.ts-depth exit criterion: start → apply the rich SaaS
 * template → complete → the org has 10 roles / 14 positions / 11 units / 20 KPIs
 * / 5 categories. Public flow (pre-auth); draft access via X-Draft-Token.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — onboarding skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Start { sessionId: string; draftToken: string }

async function startSession(anon: APIRequestContext, stamp: string): Promise<Start> {
  const res = await anon.post('/onboarding/start', {
    data: { email: `admin-${stamp}@onb.test.local`, organizationName: `Onb ${stamp}` },
  });
  expect(res.status()).toBe(201);
  return res.json() as Promise<Start>;
}

test('onboarding: template → complete reproduces seed.ts depth (10/14/11/20/5)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, stamp);
  const hdr = { 'x-draft-token': draftToken };

  // Apply the rich template into the draft.
  const applied = await anon.post(`/onboarding/${sessionId}/apply-template`, { headers: hdr, data: { slug: 'saas-startup-rich' } });
  expect(applied.status()).toBe(201);

  // Complete → org materialized + JWT issued.
  const done = await anon.post(`/onboarding/${sessionId}/complete`, {
    headers: hdr,
    data: { adminEmail: `admin-${stamp}@onb.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Onb Admin', slug: `onb-${stamp}` },
  });
  expect(done.status()).toBe(201);
  const { accessToken } = (await done.json()) as { accessToken: string };
  expect(accessToken).toBeTruthy();

  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${accessToken}` } });
  const len = async (path: string) => ((await (await api.get(path)).json()) as unknown[]).length;
  expect(await len('/roles')).toBe(10);
  expect(await len('/positions')).toBe(14);
  expect(await len('/org-units')).toBe(11);
  expect(await len('/kpis')).toBe(20);
  expect(await len('/kpi-categories')).toBe(5);
});

test('onboarding: draft patch persists + resumes; wrong token forbidden', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, stamp);
  const hdr = { 'x-draft-token': draftToken };

  await anon.put(`/onboarding/${sessionId}`, { headers: hdr, data: { patch: { organization: { name: 'Renamed Co' } }, lastEditedStep: 'org' } });
  const got = (await (await anon.get(`/onboarding/${sessionId}`, { headers: hdr })).json()) as { payload: { organization: { name: string } }; lastEditedStep: string };
  expect(got.payload.organization.name).toBe('Renamed Co');
  expect(got.lastEditedStep).toBe('org');

  // Wrong token → 403.
  expect((await anon.get(`/onboarding/${sessionId}`, { headers: { 'x-draft-token': 'nope' } })).status()).toBe(403);
});

test('onboarding: complete on an empty draft is rejected (400)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, stamp);
  const res = await anon.post(`/onboarding/${sessionId}/complete`, {
    headers: { 'x-draft-token': draftToken },
    data: { adminEmail: `admin-${stamp}@onb.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Onb Admin', slug: `empty-${stamp}` },
  });
  expect(res.status()).toBe(400); // no admin role / no payload depth
});
