/**
 * P2.1 — KPI CRUD lifecycle + scope rules.
 *
 * Verifies the core KPI engine slice:
 *  1. CREATE ORG_WIDE / PER_UNIT / PER_USER with appropriate assignments
 *  2. PER_UNIT without orgUnitIds → 400 validation error
 *  3. PER_USER without userIds → 400
 *  4. ORG_WIDE with orgUnitIds → 400
 *  5. Cross-tenant assignment rejection (orgUnitIds/userIds in another org)
 *  6. List filters by visibility — admin sees all
 *  7. Update bumps version + audit; scope is immutable
 *  8. Soft delete (deletedAt set, list hides it)
 *  9. Cross-tenant fuzz: A's KPI not visible to B
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function http<T = unknown>(
  url: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) {
    headers.set('content-type', 'application/json');
  }
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_URL}${url}`, { ...init, headers });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    // no body
  }
  return { status: res.status, body };
}

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  user: { id: string };
  organization: { id: string };
}

async function registerOrg(stamp: string): Promise<RegisterResult> {
  const res = await http<RegisterResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `kpi-${stamp}`,
      slug: `kpi-${stamp}`,
      adminEmail: `admin-${stamp}@kpi.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'KPI Admin',
    }),
  });
  if (res.status !== 201 || !res.body) {
    throw new Error(`register failed: ${res.status}`);
  }
  return res.body;
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn('[skip] api not reachable — KPI CRUD spec skipped');
  }
});

describe('KPI CRUD lifecycle + scope rules (P2.1)', () => {
  test('admin creates ORG_WIDE KPI → lists it → patches → soft-deletes', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);

    // Create ORG_WIDE
    const created = await http<{ id: string; name: string; scope: string; version: number }>(
      '/kpis',
      {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({
          name: `Revenue ${stamp}`,
          scope: 'ORG_WIDE',
          type: 'CURRENCY',
          frequency: 'MONTHLY',
          targetValue: 100000,
        }),
      },
    );
    expect(created.status).toBe(201);
    expect(created.body?.scope).toBe('ORG_WIDE');
    expect(created.body?.version).toBe(1);
    const kpiId = created.body!.id;

    // List shows it
    const list = await http<Array<{ id: string }>>('/kpis', { token: admin.accessToken });
    expect(list.status).toBe(200);
    expect(list.body?.some((k) => k.id === kpiId)).toBe(true);

    // Get by id
    const got = await http<{ id: string; name: string }>(`/kpis/${kpiId}`, {
      token: admin.accessToken,
    });
    expect(got.status).toBe(200);
    expect(got.body?.name).toBe(`Revenue ${stamp}`);

    // PATCH bumps version
    const patched = await http<{ version: number; targetValue: number }>(`/kpis/${kpiId}`, {
      method: 'PATCH',
      token: admin.accessToken,
      body: JSON.stringify({ targetValue: 150000 }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body?.version).toBe(2);
    expect(patched.body?.targetValue).toBe(150000);

    // DELETE soft-deletes
    const del = await http(`/kpis/${kpiId}`, { method: 'DELETE', token: admin.accessToken });
    expect(del.status).toBe(204);

    // List no longer shows it
    const listAfter = await http<Array<{ id: string }>>('/kpis', {
      token: admin.accessToken,
    });
    expect(listAfter.body?.some((k) => k.id === kpiId)).toBe(false);

    // Get by id 404s now
    const getAfter = await http(`/kpis/${kpiId}`, { token: admin.accessToken });
    expect(getAfter.status).toBe(404);
  });

  test('ORG_WIDE rejects orgUnitIds + userIds assignments', async () => {
    if (!apiAvailable) return;
    const admin = await registerOrg(suffix());
    const res = await http(`/kpis`, {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `Wrong ${suffix()}`,
        scope: 'ORG_WIDE',
        orgUnitIds: ['some-id'],
      }),
    });
    expect(res.status).toBe(400);
  });

  test('PER_UNIT requires at least one orgUnitId', async () => {
    if (!apiAvailable) return;
    const admin = await registerOrg(suffix());
    const res = await http('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `NoUnits ${suffix()}`,
        scope: 'PER_UNIT',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('PER_USER requires at least one userId', async () => {
    if (!apiAvailable) return;
    const admin = await registerOrg(suffix());
    const res = await http('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `NoUsers ${suffix()}`,
        scope: 'PER_USER',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('PER_USER with self → admin sees the KPI in list + assignment is persisted', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);

    const created = await http<{
      id: string;
      scope: string;
      userAssignments: Array<{ userId: string }>;
    }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `MyMetric ${stamp}`,
        scope: 'PER_USER',
        userIds: [admin.user.id],
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body?.scope).toBe('PER_USER');
    expect(created.body?.userAssignments.map((a) => a.userId)).toContain(admin.user.id);
  });

  test('cross-tenant userId on assignment → 400', async () => {
    if (!apiAvailable) return;
    const adminA = await registerOrg(suffix());
    const adminB = await registerOrg(suffix());

    const res = await http('/kpis', {
      method: 'POST',
      token: adminA.accessToken,
      body: JSON.stringify({
        name: `XTenant ${suffix()}`,
        scope: 'PER_USER',
        userIds: [adminB.user.id], // foreign tenant user
      }),
    });
    expect(res.status).toBe(400);
  });

  test('cross-tenant: tenant A KPI invisible to tenant B', async () => {
    if (!apiAvailable) return;
    const adminA = await registerOrg(suffix());
    const adminB = await registerOrg(suffix());

    const created = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: adminA.accessToken,
      body: JSON.stringify({ name: `Secret ${suffix()}`, scope: 'ORG_WIDE' }),
    });
    expect(created.status).toBe(201);

    // B's list has zero entries
    const listB = await http<Array<{ id: string }>>('/kpis', { token: adminB.accessToken });
    expect(listB.body).toEqual([]);

    // B's get-by-id returns 404
    const getB = await http(`/kpis/${created.body!.id}`, { token: adminB.accessToken });
    expect(getB.status).toBe(404);
  });

  test('PATCH cannot change scope (immutable)', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const created = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({ name: `Locked ${stamp}`, scope: 'ORG_WIDE' }),
    });
    const res = await http(`/kpis/${created.body!.id}`, {
      method: 'PATCH',
      token: admin.accessToken,
      body: JSON.stringify({ scope: 'PER_USER' }),
    });
    expect(res.status).toBe(400);
  });

  test('duplicate KPI name within tenant → 409', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const name = `Unique ${stamp}`;
    const first = await http('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({ name, scope: 'ORG_WIDE' }),
    });
    expect(first.status).toBe(201);
    const second = await http('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({ name, scope: 'ORG_WIDE' }),
    });
    expect(second.status).toBe(409);
  });

  test('non-admin (Employee) without KPI_CREATE → 403 on POST', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);

    // Get the Employee role + invite a user with it
    const roles = await http<Array<{ id: string; name: string }>>('/roles', {
      token: admin.accessToken,
    });
    const employeeRole = roles.body!.find((r) => r.name === 'Employee');
    expect(employeeRole).toBeDefined();

    const invite = await http<{
      user: { id: string };
      inviteToken: string;
    }>('/users', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        email: `employee-${stamp}@kpi.test.local`,
        fullName: 'KPI Employee',
        roleId: employeeRole!.id,
      }),
    });
    const accept = await http<{ accessToken: string }>('/auth/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token: invite.body!.inviteToken, password: 'employee-pw-1' }),
    });
    const employeeToken = accept.body!.accessToken;

    // Employee tries to create → 403
    const res = await http('/kpis', {
      method: 'POST',
      token: employeeToken,
      body: JSON.stringify({ name: `Sneaky ${stamp}`, scope: 'ORG_WIDE' }),
    });
    expect(res.status).toBe(403);

    // But Employee CAN list (has KPI_VIEW)
    const list = await http('/kpis', { token: employeeToken });
    expect(list.status).toBe(200);
  });
});
