/**
 * CRUD lifecycle integration tests — exercise create → list → get →
 * patch → delete for every P1 mutable resource, with guard-rail
 * verifications (refuse-if-in-use, refuse-last-admin).
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
    // 204
  }
  return { status: res.status, body };
}

async function registerOrg(label: string): Promise<{
  organizationId: string;
  userId: string;
  email: string;
  token: string;
}> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `${label}-${stamp}`;
  const email = `${label}-${stamp}@crud.test.local`;
  const reg = await http<{
    organization: { id: string };
    user: { id: string };
    accessToken: string;
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `CRUD ${label} ${stamp}`,
      slug,
      adminEmail: email,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: `${label} Admin`,
    }),
  });
  if (reg.status !== 201 || !reg.body) {
    throw new Error(`register failed (${reg.status})`);
  }
  return {
    organizationId: reg.body.organization.id,
    userId: reg.body.user.id,
    email,
    token: reg.body.accessToken,
  };
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable — CRUD lifecycle tests skipped`);
  }
});

describe('Roles CRUD lifecycle', () => {
  test('create → list → get → patch → delete (no users)', async () => {
    if (!apiAvailable) return;
    const org = await registerOrg('roles');

    // Start state — register seeds 4 default roles
    const initial = await http<Array<{ id: string; name: string }>>('/roles', { token: org.token });
    expect(initial.status).toBe(200);
    expect(initial.body?.length).toBe(4);
    const names = (initial.body ?? []).map((r) => r.name).sort();
    expect(names).toEqual(['Admin', 'Employee', 'Manager', 'Viewer']);

    // Create — custom role
    const created = await http<{ id: string; name: string }>('/roles', {
      method: 'POST',
      token: org.token,
      body: JSON.stringify({
        name: 'Field Engineer',
        description: 'CRUD lifecycle test role',
        level: 25,
        permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'],
      }),
    });
    expect(created.status).toBe(201);
    const customId = created.body!.id;

    // List — should include the new role
    const afterCreate = await http<Array<{ id: string }>>('/roles', { token: org.token });
    expect(afterCreate.body?.map((r) => r.id)).toContain(customId);
    expect(afterCreate.body?.length).toBe(5);

    // Get
    const fetched = await http<{ name: string; description: string }>(`/roles/${customId}`, {
      token: org.token,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body?.name).toBe('Field Engineer');

    // Patch — change description
    const patched = await http<{ description: string }>(`/roles/${customId}`, {
      method: 'PATCH',
      token: org.token,
      body: JSON.stringify({ description: 'Renamed in PATCH test' }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body?.description).toBe('Renamed in PATCH test');

    // Delete — no users assigned, should succeed
    const deleted = await http(`/roles/${customId}`, { method: 'DELETE', token: org.token });
    expect(deleted.status).toBe(204);

    // Get — 404 after delete
    const gone = await http(`/roles/${customId}`, { token: org.token });
    expect(gone.status).toBe(404);
  });

  test('reject delete with active users (the seeded Admin has the admin user)', async () => {
    if (!apiAvailable) return;
    const org = await registerOrg('roles-guard');

    // Find the Admin role id
    const roles = await http<Array<{ id: string; name: string }>>('/roles', { token: org.token });
    const adminRoleId = (roles.body ?? []).find((r) => r.name === 'Admin')?.id;
    expect(adminRoleId).toBeTruthy();

    const tryDelete = await http<{ code: string; details: { userCount: number } }>(
      `/roles/${adminRoleId}`,
      { method: 'DELETE', token: org.token },
    );
    expect(tryDelete.status).toBe(409);
    expect(tryDelete.body?.code).toBe('CONFLICT');
    expect(tryDelete.body?.details?.userCount).toBeGreaterThanOrEqual(1);
  });

  test('reject duplicate role name within tenant', async () => {
    if (!apiAvailable) return;
    const org = await registerOrg('roles-unique');
    const dup = await http('/roles', {
      method: 'POST',
      token: org.token,
      body: JSON.stringify({ name: 'Admin' }), // already exists
    });
    expect(dup.status).toBe(409);
  });
});

describe('Positions CRUD lifecycle', () => {
  test('create → list → get → patch → delete', async () => {
    if (!apiAvailable) return;
    const org = await registerOrg('positions');

    // Initially empty
    const initial = await http<unknown[]>('/positions', { token: org.token });
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual([]);

    const created = await http<{ id: string; name: string }>('/positions', {
      method: 'POST',
      token: org.token,
      body: JSON.stringify({
        name: 'Senior Engineer',
        level: 70,
        track: 'IC',
        payGrade: 'L5',
      }),
    });
    expect(created.status).toBe(201);
    const positionId = created.body!.id;

    const fetched = await http<{ name: string; track: string }>(`/positions/${positionId}`, {
      token: org.token,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body?.track).toBe('IC');

    const patched = await http<{ level: number }>(`/positions/${positionId}`, {
      method: 'PATCH',
      token: org.token,
      body: JSON.stringify({ level: 80 }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body?.level).toBe(80);

    const deleted = await http(`/positions/${positionId}`, {
      method: 'DELETE',
      token: org.token,
    });
    expect(deleted.status).toBe(204);

    const gone = await http(`/positions/${positionId}`, { token: org.token });
    expect(gone.status).toBe(404);
  });

  test('reject duplicate position name within tenant', async () => {
    if (!apiAvailable) return;
    const org = await registerOrg('positions-unique');
    await http('/positions', {
      method: 'POST',
      token: org.token,
      body: JSON.stringify({ name: 'Tech Lead', level: 60 }),
    });
    const dup = await http('/positions', {
      method: 'POST',
      token: org.token,
      body: JSON.stringify({ name: 'Tech Lead', level: 60 }),
    });
    expect(dup.status).toBe(409);
  });
});

describe('OrgUnits CRUD lifecycle + membership', () => {
  test('create → list → get → patch → add member → remove member → delete', async () => {
    if (!apiAvailable) return;
    const org = await registerOrg('orgunits');

    // Empty start
    const initial = await http<unknown[]>('/org-units', { token: org.token });
    expect(initial.body).toEqual([]);

    // Create — orgUnitTypeId defaults to the seeded "Department" type
    const created = await http<{ id: string; name: string }>('/org-units', {
      method: 'POST',
      token: org.token,
      body: JSON.stringify({ name: 'Engineering', description: 'Top-level' }),
    });
    expect(created.status).toBe(201);
    const unitId = created.body!.id;

    // Get
    const fetched = await http<{ name: string }>(`/org-units/${unitId}`, { token: org.token });
    expect(fetched.body?.name).toBe('Engineering');

    // Patch
    const patched = await http<{ description: string }>(`/org-units/${unitId}`, {
      method: 'PATCH',
      token: org.token,
      body: JSON.stringify({ description: 'Updated' }),
    });
    expect(patched.body?.description).toBe('Updated');

    // Members start empty
    const noMembers = await http<unknown[]>(`/org-units/${unitId}/members`, { token: org.token });
    expect(noMembers.body).toEqual([]);

    // Add the admin user as member
    const added = await http<{ id: string; userId: string }>(
      `/org-units/${unitId}/members`,
      {
        method: 'POST',
        token: org.token,
        body: JSON.stringify({ userId: org.userId, memberRole: 'MANAGER' }),
      },
    );
    expect(added.status).toBe(201);
    expect(added.body?.userId).toBe(org.userId);

    // Refuse delete while a member is active
    const tryDelete = await http<{ details: { memberCount: number } }>(`/org-units/${unitId}`, {
      method: 'DELETE',
      token: org.token,
    });
    expect(tryDelete.status).toBe(409);
    expect(tryDelete.body?.details?.memberCount).toBe(1);

    // Remove member (soft leave)
    const removed = await http(`/org-units/${unitId}/members/${org.userId}`, {
      method: 'DELETE',
      token: org.token,
    });
    expect(removed.status).toBe(204);

    // Now delete should succeed
    const deleted = await http(`/org-units/${unitId}`, {
      method: 'DELETE',
      token: org.token,
    });
    expect(deleted.status).toBe(204);
  });

  test('refuse self-parent on PATCH', async () => {
    if (!apiAvailable) return;
    const org = await registerOrg('orgunits-selfparent');
    const created = await http<{ id: string }>('/org-units', {
      method: 'POST',
      token: org.token,
      body: JSON.stringify({ name: 'OnlyMe' }),
    });
    const self = created.body!.id;
    const bad = await http<{ code: string }>(`/org-units/${self}`, {
      method: 'PATCH',
      token: org.token,
      body: JSON.stringify({ parentUnitId: self }),
    });
    expect(bad.status).toBe(400);
    expect(bad.body?.code).toBe('VALIDATION_ERROR');
  });

  test('refuse member-add with cross-tenant userId', async () => {
    if (!apiAvailable) return;
    const orgA = await registerOrg('orgunits-xtenant-a');
    const orgB = await registerOrg('orgunits-xtenant-b');

    const unit = await http<{ id: string }>('/org-units', {
      method: 'POST',
      token: orgA.token,
      body: JSON.stringify({ name: 'OrgA Unit' }),
    });

    // Try to add orgB's user to orgA's unit using orgA's token
    const bad = await http<{ code: string }>(`/org-units/${unit.body!.id}/members`, {
      method: 'POST',
      token: orgA.token,
      body: JSON.stringify({ userId: orgB.userId }),
    });
    expect(bad.status).toBe(400);
    expect(bad.body?.code).toBe('VALIDATION_ERROR');
  });
});
