/**
 * BE-004 — PEOPLE / ORG / ANALYTICS scopes enforced end to end against the live API.
 *
 * Org layout: Eng > Backend > Platform, and Sales. Mia (custom role "Scoped
 * Manager") manages Backend; Pat is a Backend member; Oscar is in Sales.
 *
 *   parity (role sets nothing)  → Mia sees every person and unit
 *   PEOPLE=UNITS, ORG=UNITS     → Mia sees Backend people + Backend/Platform only;
 *                                  Oscar / Sales are 404s, writes on them refused
 *   membership change           → applies immediately (cache invalidated)
 *   ANALYTICS=SELF              → forecast on a Backend KPI she can view → 404
 *   admin                       → unaffected throughout
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function http<T = unknown>(
  url: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_URL}${url}`, { ...init, headers });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    // 204 / no body
  }
  return { status: res.status, body };
}

const post = <T>(url: string, token: string, body: unknown) =>
  http<T>(url, { method: 'POST', token, body: JSON.stringify(body) });
const patch = <T>(url: string, token: string, body: unknown) =>
  http<T>(url, { method: 'PATCH', token, body: JSON.stringify(body) });

interface World {
  admin: string;
  mia: string;
  roleId: string;
  ids: { mia: string; pat: string; oscar: string; eng: string; backend: string; platform: string; sales: string; kpi: string };
}
let w: World;

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const reg = await post<{ accessToken: string }>('/auth/register', '', {
    orgName: `scope-${stamp}`,
    slug: `scope-${stamp}`,
    adminEmail: `admin-${stamp}@scope.test.local`,
    adminPassword: 'correct-horse-battery-staple',
    adminFullName: 'Scope Admin',
  });
  expect(reg.status).toBe(201);
  const admin = reg.body!.accessToken;

  const role = await post<{ id: string }>('/roles', admin, {
    name: 'Scoped Manager',
    permissions: ['USERS_VIEW', 'USERS_MANAGE', 'GROUPS_VIEW', 'GROUPS_MANAGE', 'KPI_VIEW', 'INSIGHTS_VIEW'],
  });
  expect(role.status).toBe(201);

  const invite = async (name: string, roleId?: string) => {
    const r = await post<{ user: { id: string }; inviteToken: string }>('/users', admin, {
      email: `${name}-${stamp}@scope.test.local`,
      fullName: name,
      ...(roleId ? { roleId } : {}),
    });
    expect(r.status).toBe(201);
    return r.body!;
  };
  const mia = await invite('Mia', role.body!.id);
  const pat = await invite('Pat');
  const oscar = await invite('Oscar');
  const accept = await post<{ accessToken: string }>('/auth/accept-invitation', '', {
    token: mia.inviteToken,
    password: 'mia-password-123',
  });
  expect(accept.status).toBe(200);

  const unit = async (name: string, parentUnitId?: string) => {
    const r = await post<{ id: string }>('/org-units', admin, { name, ...(parentUnitId ? { parentUnitId } : {}) });
    expect(r.status).toBe(201);
    return r.body!.id;
  };
  const eng = await unit('Eng');
  const backend = await unit('Backend', eng);
  const platform = await unit('Platform', backend);
  const sales = await unit('Sales');
  const member = async (unitId: string, userId: string, memberRole = 'MEMBER') =>
    expect((await post(`/org-units/${unitId}/members`, admin, { userId, memberRole })).status).toBe(201);
  await member(backend, mia.user.id, 'MANAGER');
  await member(backend, pat.user.id);
  await member(sales, oscar.user.id);

  // A PER_UNIT KPI assigned to Backend: visible to Mia at KPIS=UNITS.
  const kpi = await post<{ id: string }>('/kpis', admin, {
    name: `Backend latency ${stamp}`,
    scope: 'PER_UNIT',
    type: 'NUMBER',
    direction: 'LOWER_IS_BETTER',
    aggregationMethod: 'LAST',
    orgUnitIds: [backend],
  });
  expect(kpi.status).toBe(201);

  w = {
    admin,
    mia: accept.body!.accessToken,
    roleId: role.body!.id,
    ids: { mia: mia.user.id, pat: pat.user.id, oscar: oscar.user.id, eng, backend, platform, sales, kpi: kpi.body!.id },
  };
}, 60_000);

const setScopes = async (scopeConfig: Record<string, string>) =>
  expect((await patch(`/roles/${w.roleId}`, w.admin, { scopeConfig })).status).toBe(200);
const ids = (rows: Array<{ id: string }> | null) => (rows ?? []).map((r) => r.id).sort();

describe('BE-004: PEOPLE / ORG / ANALYTICS scopes (live API)', () => {
  test('parity: with nothing set, Mia sees every person and every unit', async () => {
    await setScopes({});
    const users = await http<Array<{ id: string }>>('/users', { token: w.mia });
    expect(ids(users.body)).toEqual(expect.arrayContaining([w.ids.mia, w.ids.pat, w.ids.oscar]));
    const units = await http<Array<{ id: string }>>('/org-units', { token: w.mia });
    expect(ids(units.body)).toEqual([w.ids.backend, w.ids.eng, w.ids.platform, w.ids.sales].sort());
  });

  test('PEOPLE=UNITS, ORG=UNITS: lists narrow; out-of-scope reads are 404s', async () => {
    await setScopes({ PEOPLE: 'UNITS', ORG: 'UNITS' });

    const users = await http<Array<{ id: string }>>('/users', { token: w.mia });
    expect(ids(users.body)).toEqual([w.ids.mia, w.ids.pat].sort());
    expect((await http(`/users/${w.ids.pat}`, { token: w.mia })).status).toBe(200);
    expect((await http(`/users/${w.ids.oscar}`, { token: w.mia })).status).toBe(404);
    expect((await http(`/users/${w.ids.mia}`, { token: w.mia })).status).toBe(200); // self

    const units = await http<Array<{ id: string }>>('/org-units', { token: w.mia });
    expect(ids(units.body)).toEqual([w.ids.backend, w.ids.platform].sort()); // her unit + subtree
    expect((await http(`/org-units/${w.ids.sales}`, { token: w.mia })).status).toBe(404);
    expect((await http(`/org-units/${w.ids.sales}/members`, { token: w.mia })).status).toBe(404);
    const backendMembers = await http<Array<{ userId: string }>>(`/org-units/${w.ids.backend}/members`, { token: w.mia });
    expect((backendMembers.body ?? []).map((m) => m.userId).sort()).toEqual([w.ids.mia, w.ids.pat].sort());

    const search = await http<Array<{ type: string; id: string }>>('/search?q=Oscar', { token: w.mia });
    expect((search.body ?? []).filter((r) => r.type === 'user')).toEqual([]);
  });

  test('writes on out-of-scope people and units are refused', async () => {
    await setScopes({ PEOPLE: 'UNITS', ORG: 'UNITS' });
    expect((await post(`/users/${w.ids.oscar}/suspend`, w.mia, {})).status).toBe(404);
    expect((await http(`/users/${w.ids.oscar}/access-profile`, { token: w.mia })).status).toBe(404);
    expect((await patch(`/org-units/${w.ids.sales}`, w.mia, { description: 'x' })).status).toBe(404);
    expect((await post(`/org-units/${w.ids.sales}/members`, w.mia, { userId: w.ids.pat })).status).toBe(404);
    // Oscar is untouched.
    const oscar = await http<{ status: string }>(`/users/${w.ids.oscar}`, { token: w.admin });
    expect(oscar.body!.status).not.toBe('SUSPENDED');
  });

  test('ORG=SELF narrows to her own unit only (no subtree)', async () => {
    await setScopes({ ORG: 'SELF' });
    const units = await http<Array<{ id: string }>>('/org-units', { token: w.mia });
    expect(ids(units.body)).toEqual([w.ids.backend]);
  });

  test('a membership change applies immediately (scope caches are invalidated)', async () => {
    await setScopes({ ORG: 'SELF' });
    expect((await http(`/org-units/${w.ids.sales}`, { token: w.mia })).status).toBe(404);
    const add = await post(`/org-units/${w.ids.sales}/members`, w.admin, { userId: w.ids.mia });
    expect(add.status).toBe(201);
    expect((await http(`/org-units/${w.ids.sales}`, { token: w.mia })).status).toBe(200);
    await http(`/org-units/${w.ids.sales}/members/${w.ids.mia}`, { method: 'DELETE', token: w.admin });
    expect((await http(`/org-units/${w.ids.sales}`, { token: w.mia })).status).toBe(404);
  });

  test('ANALYTICS=SELF: a unit KPI she can view cannot be forecast (404); at ORG the gate passes', async () => {
    await setScopes({ ANALYTICS: 'SELF' });
    expect((await http(`/kpis/${w.ids.kpi}`, { token: w.mia })).status).toBe(200); // still viewable
    expect((await post(`/kpis/${w.ids.kpi}/forecasts`, w.mia, { horizon: 7 })).status).toBe(404);
    await setScopes({});
    // Past the scope gate: no data yet → 422 INSUFFICIENT_DATA (not a 404).
    expect((await post(`/kpis/${w.ids.kpi}/forecasts`, w.mia, { horizon: 7 })).status).not.toBe(404);
  });

  test('admins are unaffected', async () => {
    const users = await http<Array<{ id: string }>>('/users', { token: w.admin });
    expect(ids(users.body)).toEqual(expect.arrayContaining([w.ids.mia, w.ids.pat, w.ids.oscar]));
    const units = await http<Array<{ id: string }>>('/org-units', { token: w.admin });
    expect(ids(units.body)).toHaveLength(4);
  });
});
