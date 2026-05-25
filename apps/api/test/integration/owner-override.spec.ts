/**
 * Owner-override integration test (spec §5.4 step 6).
 *
 * Verifies that a non-admin Employee (who lacks USERS_VIEW) can still
 * GET /users/<their own id> via the owner-override path, while still
 * being denied for other users' ids and for the /users list endpoint.
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
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
    // 204 / no body
  }
  return { status: res.status, body };
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn('[skip] api not reachable — owner-override spec skipped');
  }
});

describe('Owner override (spec §5.4 step 6) — self-access to /users/:id', () => {
  test('Employee can GET their own /users/:id without USERS_VIEW, but not someone else\'s', async () => {
    if (!apiAvailable) return;

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const adminEmail = `admin-${stamp}@owner.test.local`;
    const adminPw = 'correct-horse-battery-staple';

    // 1. Admin registers
    const reg = await http<{
      accessToken: string;
      user: { id: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        orgName: `owner-${stamp}`,
        slug: `owner-${stamp}`,
        adminEmail,
        adminPassword: adminPw,
        adminFullName: 'Owner Admin',
      }),
    });
    expect(reg.status).toBe(201);
    const adminToken = reg.body!.accessToken;
    const adminId = reg.body!.user.id;

    // 2. Find the Employee role
    const roles = await http<Array<{ id: string; name: string }>>('/roles', {
      token: adminToken,
    });
    const employeeRole = roles.body!.find((r) => r.name === 'Employee');
    expect(employeeRole).toBeDefined();

    // 3. Admin invites two Employees: alice and bob
    const aliceEmail = `alice-${stamp}@owner.test.local`;
    const bobEmail = `bob-${stamp}@owner.test.local`;
    const alicePw = 'alice-password-1';
    const bobPw = 'bob-password-1';

    const aliceInvite = await http<{
      user: { id: string };
      inviteToken: string;
    }>('/users', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        email: aliceEmail,
        fullName: 'Alice Employee',
        roleId: employeeRole!.id,
      }),
    });
    expect(aliceInvite.status).toBe(201);
    const aliceId = aliceInvite.body!.user.id;
    const aliceInviteToken = aliceInvite.body!.inviteToken;

    const bobInvite = await http<{
      user: { id: string };
      inviteToken: string;
    }>('/users', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        email: bobEmail,
        fullName: 'Bob Employee',
        roleId: employeeRole!.id,
      }),
    });
    expect(bobInvite.status).toBe(201);
    const bobId = bobInvite.body!.user.id;

    // 4. Alice accepts her invite → signs in
    const aliceAccept = await http<{ accessToken: string }>(
      '/auth/accept-invitation',
      {
        method: 'POST',
        body: JSON.stringify({ token: aliceInviteToken, password: alicePw }),
      },
    );
    expect(aliceAccept.status).toBe(200);
    const aliceToken = aliceAccept.body!.accessToken;

    // 5. As Alice (Employee, no USERS_VIEW), GET her OWN /users/:id → 200
    const selfRes = await http<{ id: string; email: string }>(
      `/users/${aliceId}`,
      { token: aliceToken },
    );
    expect(selfRes.status).toBe(200);
    expect(selfRes.body?.id).toBe(aliceId);
    expect(selfRes.body?.email).toBe(aliceEmail);

    // 6. As Alice, GET Bob's /users/:id → 403 (no owner match, no permission)
    const otherRes = await http(`/users/${bobId}`, { token: aliceToken });
    expect(otherRes.status).toBe(403);

    // 7. As Alice, GET admin's /users/:id → 403 (admin is not Alice either)
    const adminRes = await http(`/users/${adminId}`, { token: aliceToken });
    expect(adminRes.status).toBe(403);

    // 8. As Alice, GET /users list → 403 (no owner override on list endpoint)
    const listRes = await http('/users', { token: aliceToken });
    expect(listRes.status).toBe(403);

    // 9. As Admin, GET any /users/:id → 200 (admin bypass)
    const adminAsAdmin = await http<{ id: string }>(`/users/${aliceId}`, {
      token: adminToken,
    });
    expect(adminAsAdmin.status).toBe(200);
  });
});
