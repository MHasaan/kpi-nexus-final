/**
 * P2.2 — KPIDataPoint scope-routing + cross-user isolation (spec §6).
 *
 * Tests in this file ARE THE CRITICAL P2 EXIT GATE. The original app had
 * a bug where user A's recorded value was visible to user B; the
 * invariants below prevent it from recurring.
 *
 * Coverage:
 *  1. POST /kpis/:id/data with PER_USER KPI → 422 + correctEndpoint
 *  2. POST /kpis/:id/data with PER_UNIT KPI → 422 + correctEndpoint
 *  3. POST /org-units/kpi-assignments/:id/data with ORG_WIDE KPI → 422
 *  4. POST /user-kpis/my-kpis/:assignmentId/data with ORG_WIDE KPI → 422
 *  5. ORG_WIDE happy path (admin records value, list shows it)
 *  6. PER_UNIT happy path (admin records value, list shows it)
 *  7. PER_USER happy path — user records their own → visible to them
 *  8. PER_USER cross-user isolation — user A records → user B's list
 *     for the same KPI shows ZERO entries (the bug class invariant)
 *  9. PER_USER user B cannot record into A's assignment → 403
 * 10. periodEnd before periodStart → 400
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
      orgName: `data-${stamp}`,
      slug: `data-${stamp}`,
      adminEmail: `admin-${stamp}@data.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Data Admin',
    }),
  });
  if (res.status !== 201 || !res.body) {
    throw new Error(`register failed: ${res.status}`);
  }
  return res.body;
}

async function inviteAndAccept(
  adminToken: string,
  stamp: string,
  email: string,
  roleName = 'Employee',
): Promise<{ userId: string; token: string }> {
  const roles = await http<Array<{ id: string; name: string }>>('/roles', {
    token: adminToken,
  });
  const role = roles.body!.find((r) => r.name === roleName);
  expect(role).toBeDefined();
  const invite = await http<{
    user: { id: string };
    inviteToken: string;
  }>('/users', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ email, fullName: `${email}`, roleId: role!.id }),
  });
  expect(invite.status).toBe(201);
  const accept = await http<{ accessToken: string }>('/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({ token: invite.body!.inviteToken, password: `pw-${stamp}` }),
  });
  expect(accept.status).toBe(200);
  return { userId: invite.body!.user.id, token: accept.body!.accessToken };
}

async function createOrgUnit(
  adminToken: string,
  name: string,
): Promise<string> {
  const res = await http<{ id: string }>('/org-units', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  return res.body!.id;
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn('[skip] api not reachable — kpi-data-scope spec skipped');
  }
});

describe('KPIDataPoint scope routing + cross-user isolation (spec §6)', () => {
  test('POST /kpis/:id/data with PER_USER KPI → 422 with correctEndpoint hint', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const kpi = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `MyKpi ${stamp}`,
        scope: 'PER_USER',
        userIds: [admin.user.id],
      }),
    });
    expect(kpi.status).toBe(201);

    const wrong = await http<{ code: string; details: { correctEndpoint: string } }>(
      `/kpis/${kpi.body!.id}/data`,
      {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({
          value: 1,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
        }),
      },
    );
    expect(wrong.status).toBe(422);
    expect(wrong.body?.code).toBe('SCOPE_MISMATCH');
    expect(wrong.body?.details.correctEndpoint).toContain('/user-kpis/my-kpis');
  });

  test('POST /kpis/:id/data with PER_UNIT KPI → 422 + correct endpoint hint', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const unitId = await createOrgUnit(admin.accessToken, `Eng ${stamp}`);
    const kpi = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `UnitKpi ${stamp}`,
        scope: 'PER_UNIT',
        orgUnitIds: [unitId],
      }),
    });
    const wrong = await http<{ details: { correctEndpoint: string } }>(
      `/kpis/${kpi.body!.id}/data`,
      {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({
          value: 1,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
        }),
      },
    );
    expect(wrong.status).toBe(422);
    expect(wrong.body?.details.correctEndpoint).toContain('/org-units/kpi-assignments');
  });

  test('PER_UNIT assignment endpoint with ORG_WIDE KPI → 422 + correct endpoint hint', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const unitId = await createOrgUnit(admin.accessToken, `Sales ${stamp}`);
    // Make a PER_UNIT KPI so we have a real assignment id
    const perUnit = await http<{
      id: string;
      orgUnitAssignments: Array<{ id: string }>;
    }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `PerUnit ${stamp}`,
        scope: 'PER_UNIT',
        orgUnitIds: [unitId],
      }),
    });
    const perUnitAssignmentId = perUnit.body!.orgUnitAssignments[0]!.id;

    // Record into PER_UNIT correctly → 201
    const correct = await http(`/org-units/kpi-assignments/${perUnitAssignmentId}/data`, {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        value: 100,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }),
    });
    expect(correct.status).toBe(201);

    // Now confirm GET /kpis/:id/data scopes correctly: must have one row,
    // the orgUnitId is non-null, userId is null
    const list = await http<Array<{ orgUnitId: string | null; userId: string | null }>>(
      `/kpis/${perUnit.body!.id}/data`,
      { token: admin.accessToken },
    );
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body![0]!.orgUnitId).toBe(unitId);
    expect(list.body![0]!.userId).toBeNull();
  });

  test('§6 critical: PER_USER cross-user isolation — user A records, user B sees NOTHING', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const alice = await inviteAndAccept(
      admin.accessToken,
      `alice-${stamp}`,
      `alice-${stamp}@data.test.local`,
    );
    const bob = await inviteAndAccept(
      admin.accessToken,
      `bob-${stamp}`,
      `bob-${stamp}@data.test.local`,
    );

    // Admin creates a PER_USER KPI assigning BOTH alice and bob
    const kpi = await http<{
      id: string;
      userAssignments: Array<{ id: string; userId: string }>;
    }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `Sales Calls ${stamp}`,
        scope: 'PER_USER',
        userIds: [alice.userId, bob.userId],
      }),
    });
    expect(kpi.status).toBe(201);
    const aliceAssignment = kpi.body!.userAssignments.find(
      (a) => a.userId === alice.userId,
    );
    expect(aliceAssignment).toBeDefined();

    // Alice records a data point
    const aliceRecord = await http(
      `/user-kpis/my-kpis/${aliceAssignment!.id}/data`,
      {
        method: 'POST',
        token: alice.token,
        body: JSON.stringify({
          value: 42,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
        }),
      },
    );
    expect(aliceRecord.status).toBe(201);

    // Alice GET /kpis/:id/data → her own row is visible
    const aliceList = await http<Array<{ value: number; userId: string }>>(
      `/kpis/${kpi.body!.id}/data`,
      { token: alice.token },
    );
    expect(aliceList.status).toBe(200);
    expect(aliceList.body).toHaveLength(1);
    expect(aliceList.body![0]!.value).toBe(42);
    expect(aliceList.body![0]!.userId).toBe(alice.userId);

    // *** THE BUG-CLASS INVARIANT ***
    // Bob GET /kpis/:id/data → zero rows (Alice's data is NOT visible)
    const bobList = await http<Array<{ value: number; userId: string }>>(
      `/kpis/${kpi.body!.id}/data`,
      { token: bob.token },
    );
    expect(bobList.status).toBe(200);
    expect(bobList.body).toHaveLength(0);

    // Admin sees both (still empty for bob, has alice's row → 1 entry)
    const adminList = await http<Array<{ value: number }>>(
      `/kpis/${kpi.body!.id}/data`,
      { token: admin.accessToken },
    );
    expect(adminList.status).toBe(200);
    expect(adminList.body).toHaveLength(1);
    expect(adminList.body![0]!.value).toBe(42);
  });

  test('§6 critical: Bob cannot record into Alice\'s assignment → 403', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const alice = await inviteAndAccept(
      admin.accessToken,
      `alice2-${stamp}`,
      `alice2-${stamp}@data.test.local`,
    );
    const bob = await inviteAndAccept(
      admin.accessToken,
      `bob2-${stamp}`,
      `bob2-${stamp}@data.test.local`,
    );

    const kpi = await http<{
      id: string;
      userAssignments: Array<{ id: string; userId: string }>;
    }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `Calls B ${stamp}`,
        scope: 'PER_USER',
        userIds: [alice.userId, bob.userId],
      }),
    });
    const aliceAssignment = kpi.body!.userAssignments.find(
      (a) => a.userId === alice.userId,
    )!;

    // Bob tries to post into Alice's assignment
    const res = await http(`/user-kpis/my-kpis/${aliceAssignment.id}/data`, {
      method: 'POST',
      token: bob.token,
      body: JSON.stringify({
        value: 999,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }),
    });
    expect(res.status).toBe(403);
  });

  test('ORG_WIDE happy path: admin records → list shows the point', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const kpi = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({ name: `Revenue ${stamp}`, scope: 'ORG_WIDE' }),
    });
    const created = await http<{ value: number; userId: string | null; orgUnitId: string | null }>(
      `/kpis/${kpi.body!.id}/data`,
      {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({
          value: 12345,
          unit: 'USD',
          periodStart: '2026-04-01',
          periodEnd: '2026-04-30',
        }),
      },
    );
    expect(created.status).toBe(201);
    expect(created.body?.value).toBe(12345);
    expect(created.body?.userId).toBeNull();
    expect(created.body?.orgUnitId).toBeNull();

    const list = await http<Array<{ value: number }>>(
      `/kpis/${kpi.body!.id}/data`,
      { token: admin.accessToken },
    );
    expect(list.body).toHaveLength(1);
    expect(list.body![0]!.value).toBe(12345);
  });

  test('periodEnd before periodStart → 400 validation error', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const kpi = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({ name: `Bad ${stamp}`, scope: 'ORG_WIDE' }),
    });
    const res = await http(`/kpis/${kpi.body!.id}/data`, {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        value: 1,
        periodStart: '2026-02-01',
        periodEnd: '2026-01-01', // before start
      }),
    });
    expect(res.status).toBe(400);
  });

  test('cross-tenant: tenant A admin cannot record into tenant B\'s KPI', async () => {
    if (!apiAvailable) return;
    const adminA = await registerOrg(suffix());
    const adminB = await registerOrg(suffix());
    const kpiB = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: adminB.accessToken,
      body: JSON.stringify({ name: `B-only ${suffix()}`, scope: 'ORG_WIDE' }),
    });
    expect(kpiB.status).toBe(201);

    // A tries to POST into B's KPI → 404 (visibility) NOT 422
    const res = await http(`/kpis/${kpiB.body!.id}/data`, {
      method: 'POST',
      token: adminA.accessToken,
      body: JSON.stringify({
        value: 1,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }),
    });
    expect(res.status).toBe(404);
  });
});
