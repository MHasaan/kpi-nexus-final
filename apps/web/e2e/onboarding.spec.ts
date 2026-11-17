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

// ---- Plan 3.1: the draft has a shape, and says what is wrong with it --------

interface Problem { section: string; index?: number; field?: string; message: string }

test('onboarding: a write that is not a draft is refused, and the draft is left as it was', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, suffix());
  const hdr = { 'x-draft-token': draftToken };
  const put = (patch: unknown) => anon.put(`/onboarding/${sessionId}`, { headers: hdr, data: { patch } });

  for (const bad of [
    { roles: 'everyone' },
    { kpis: [{ name: 'X', category: 'Y', scope: 'PER_PLANET' }] },
    { secrets: { anything: 'stored for free' } },
  ]) {
    const res = await put(bad);
    expect(res.status(), JSON.stringify(bad)).toBe(400);
    const body = (await res.json()) as { code: string; details: { problems: Problem[] } };
    expect(body.code).toBe('ONBOARDING_INVALID_DRAFT');
    expect(body.details.problems.length).toBeGreaterThan(0);
  }
  const scope = (await (await put({ kpis: [{ name: 'X', category: 'Y', scope: 'PER_PLANET' }] })).json()) as { details: { problems: Problem[] } };
  expect(scope.details.problems[0]).toMatchObject({ section: 'kpis', index: 0, field: 'scope' });

  const draft = (await (await anon.get(`/onboarding/${sessionId}`, { headers: hdr })).json()) as { payload: Record<string, unknown> };
  expect(Object.keys(draft.payload)).toEqual(['organization']);

  // A half-typed row is still a draft: it saves.
  expect((await put({ kpis: [{ name: '', category: '' }] })).status()).toBe(200);
});

test('onboarding: validate lists what stops the draft becoming an organisation; complete refuses with the same list', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, stamp);
  const hdr = { 'x-draft-token': draftToken };
  const validate = async () =>
    ((await (await anon.get(`/onboarding/${sessionId}/validate`, { headers: hdr })).json()) as { problems: Problem[] }).problems;

  // Fresh draft: named, but nobody could administer it.
  expect(await validate()).toEqual([expect.objectContaining({ section: 'roles' })]);

  await anon.put(`/onboarding/${sessionId}`, {
    headers: hdr,
    data: {
      patch: {
        roles: [{ name: 'Admin', isAdmin: true }, { name: 'admin' }],
        orgUnitTypes: [{ name: 'Department' }],
        orgUnits: [{ name: 'Engineering', type: 'Squad' }],
        kpiCategories: [{ name: 'Delivery' }],
        kpis: [{ name: 'Cycle Time', category: 'Speed' }],
      },
    },
  });
  const problems = await validate();
  expect(problems).toEqual([
    expect.objectContaining({ section: 'roles', index: 1, field: 'name' }),
    expect.objectContaining({ section: 'orgUnits', index: 0, field: 'type' }),
    expect.objectContaining({ section: 'kpis', index: 0, field: 'category' }),
  ]);

  const refused = await anon.post(`/onboarding/${sessionId}/complete`, {
    headers: hdr,
    data: { adminEmail: `admin-${stamp}@onb.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Onb Admin', slug: `onb-${stamp}` },
  });
  expect(refused.status()).toBe(400);
  const body = (await refused.json()) as { code: string; details: { problems: Problem[] } };
  expect(body.code).toBe('ONBOARDING_INVALID');
  expect(body.details.problems).toEqual(problems);

  // The wrong token cannot read the list either.
  expect((await anon.get(`/onboarding/${sessionId}/validate`, { headers: { 'x-draft-token': 'nope' } })).status()).toBe(403);
});

test('onboarding: references match by name whatever the capitals, and the organisation is built from them', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, stamp);
  const hdr = { 'x-draft-token': draftToken };
  expect((await anon.put(`/onboarding/${sessionId}`, {
    headers: hdr,
    data: {
      patch: {
        roles: [{ name: 'Admin', isAdmin: true }],
        orgUnitTypes: [{ name: 'Department' }],
        orgUnits: [{ name: 'Engineering', type: 'department' }, { name: 'Platform', type: 'DEPARTMENT', parent: 'engineering ' }],
        kpiCategories: [{ name: 'Delivery' }],
        kpis: [{ name: 'Cycle Time', category: 'delivery' }],
      },
    },
  })).status()).toBe(200);

  const done = await anon.post(`/onboarding/${sessionId}/complete`, {
    headers: hdr,
    data: { adminEmail: `admin-${stamp}@onb.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Onb Admin', slug: `onb-${stamp}` },
  });
  expect(done.status()).toBe(201);
  const { accessToken } = (await done.json()) as { accessToken: string };
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${accessToken}` } });
  const units = (await (await api.get('/org-units')).json()) as Array<{ id: string; name: string; parentUnitId: string | null }>;
  const engineering = units.find((u) => u.name === 'Engineering')!;
  expect(units.find((u) => u.name === 'Platform')?.parentUnitId).toBe(engineering.id);
  const kpis = (await (await api.get('/kpis')).json()) as Array<{ name: string; categoryId: string | null }>;
  expect(kpis.find((k) => k.name === 'Cycle Time')?.categoryId).toBeTruthy();
});

// ---- Plan 3.2a: the organisation's own settings are part of the draft ------

test('onboarding: timezone, currency, language, fiscal year and week start are applied when the organisation is created', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, stamp);
  const hdr = { 'x-draft-token': draftToken };
  expect((await anon.put(`/onboarding/${sessionId}`, {
    headers: hdr,
    data: {
      patch: {
        organization: {
          name: `Settings ${stamp}`,
          industry: 'Logistics',
          sizeTier: 'SCALEUP',
          timezone: 'Asia/Karachi',
          currency: 'pkr',
          locale: 'en-GB',
          fiscalYearStartMonth: 7,
          weekStartsOn: 1,
        },
        roles: [{ name: 'Admin', isAdmin: true }],
      },
    },
  })).status()).toBe(200);

  const done = await anon.post(`/onboarding/${sessionId}/complete`, {
    headers: hdr,
    data: { adminEmail: `admin-${stamp}@onb.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Onb Admin', slug: `onb-${stamp}` },
  });
  expect(done.status()).toBe(201);
  const { accessToken } = (await done.json()) as { accessToken: string };
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${accessToken}` } });
  const org = (await (await api.get('/organizations/me')).json()) as Record<string, unknown>;
  expect(org).toMatchObject({
    name: `Settings ${stamp}`,
    industry: 'Logistics',
    sizeTier: 'MEDIUM', // what the template called SCALEUP; it used to be dropped
    timezone: 'Asia/Karachi',
    currency: 'PKR',
    locale: 'en-GB',
    weekStartsOn: 1,
  });
  expect((org.fiscalCalendar as { startMonth?: number } | null)?.startMonth).toBe(7);
});

test('onboarding: a time zone that does not exist stops the draft, on its field', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, suffix());
  const hdr = { 'x-draft-token': draftToken };
  await anon.put(`/onboarding/${sessionId}`, {
    headers: hdr,
    data: { patch: { organization: { name: 'Zone Check', timezone: 'Mars/Olympus' }, roles: [{ name: 'Admin', isAdmin: true }] } },
  });
  const { problems } = (await (await anon.get(`/onboarding/${sessionId}/validate`, { headers: hdr })).json()) as { problems: Problem[] };
  expect(problems).toEqual([expect.objectContaining({ section: 'organization', field: 'timezone' })]);
});

// ---- Plan 3.2b: a per-unit KPI created by onboarding belongs to units ------

test('onboarding: a per-unit KPI is given to its units (and the units below them), with its target and an owner', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const { sessionId, draftToken } = await startSession(anon, stamp);
  const hdr = { 'x-draft-token': draftToken };
  const kpi = { category: 'Delivery', scope: 'PER_UNIT', type: 'NUMBER', direction: 'LOWER_IS_BETTER', frequency: 'WEEKLY' };
  expect((await anon.put(`/onboarding/${sessionId}`, {
    headers: hdr,
    data: {
      patch: {
        roles: [{ name: 'Admin', isAdmin: true }],
        orgUnitTypes: [{ name: 'Department' }],
        orgUnits: [
          { name: 'Engineering', type: 'Department' },
          { name: 'Platform', type: 'Department', parent: 'Engineering' },
          { name: 'Sales', type: 'Department' },
        ],
        kpiCategories: [{ name: 'Delivery' }],
        kpis: [
          { ...kpi, name: 'Cycle Time', units: ['engineering'], targetValue: 5 },
          { ...kpi, name: 'Open Bugs' }, // no units named
        ],
      },
    },
  })).status()).toBe(200);

  const done = await anon.post(`/onboarding/${sessionId}/complete`, {
    headers: hdr,
    data: { adminEmail: `admin-${stamp}@onb.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Onb Admin', slug: `onb-${stamp}` },
  });
  expect(done.status()).toBe(201);
  const { accessToken, user } = (await done.json()) as { accessToken: string; user: { id: string } };
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${accessToken}` } });
  const kpis = (await (await api.get('/kpis')).json()) as Array<{ id: string; name: string; ownerUserId: string | null; targetValue: number | null }>;
  type Row = { name: string; inherited: boolean; targetValue: number | null; assignmentId: string };
  const unitsOf = async (name: string) =>
    ((await (await api.get(`/kpis/${kpis.find((k) => k.name === name)!.id}/assignments`)).json()) as { units: Row[] }).units;

  const cycle = await unitsOf('Cycle Time');
  expect(cycle.map((u) => [u.name, u.inherited]).sort()).toEqual([['Engineering', false], ['Platform', true]]);
  expect(cycle.find((u) => u.name === 'Engineering')!.targetValue).toBe(5);
  expect(kpis.find((k) => k.name === 'Cycle Time')).toMatchObject({ ownerUserId: user.id, targetValue: 5 });

  // No units named: every top-level unit holds it, and theirs inherit.
  const bugs = await unitsOf('Open Bugs');
  expect(bugs.map((u) => [u.name, u.inherited]).sort()).toEqual([['Engineering', false], ['Platform', true], ['Sales', false]]);

  // Which means a value can actually be recorded for a unit.
  const recorded = await api.post(`/org-units/kpi-assignments/${cycle.find((u) => u.name === 'Platform')!.assignmentId}/data`, {
    data: { value: 4, periodStart: '2026-11-09T00:00:00.000Z', periodEnd: '2026-11-15T23:59:59.999Z' },
  });
  expect(recorded.status()).toBe(201);
});
