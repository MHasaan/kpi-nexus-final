/**
 * Invitation flow integration test — P1 full happy-path exit criterion.
 *
 * Admin invites a user → dev-mode response carries the plaintext token
 * → invitee POSTs /auth/accept-invitation with a password → invitee can
 * log in normally → /auth/me reflects the assigned role.
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

async function registerAdminOrg(): Promise<{ token: string; userId: string; orgId: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await http<{
    accessToken: string;
    user: { id: string };
    organization: { id: string };
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `invite-org-${stamp}`,
      slug: `invite-org-${stamp}`,
      adminEmail: `admin-${stamp}@invite.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Invite Admin',
    }),
  });
  if (reg.status !== 201 || !reg.body) {
    throw new Error(`register failed (${reg.status})`);
  }
  return {
    token: reg.body.accessToken,
    userId: reg.body.user.id,
    orgId: reg.body.organization.id,
  };
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable — invitation flow skipped`);
  }
});

describe('Invitation flow (spec §3.2 + §5.7) — full happy-path', () => {
  test('admin invites → invitee accepts with password → can log in → /auth/me reflects role', async () => {
    if (!apiAvailable) return;

    const admin = await registerAdminOrg();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inviteeEmail = `invitee-${stamp}@invite.test.local`;

    // Find the seeded "Employee" role to assign to the invitee
    const roles = await http<Array<{ id: string; name: string }>>('/roles', {
      token: admin.token,
    });
    const employeeRole = (roles.body ?? []).find((r) => r.name === 'Employee');
    expect(employeeRole).toBeDefined();

    // Invite — dev-mode returns inviteToken in the response
    const invite = await http<{
      user: { id: string; email: string; status: string };
      inviteToken: string;
      acceptUrl: string;
    }>('/users', {
      method: 'POST',
      token: admin.token,
      body: JSON.stringify({
        email: inviteeEmail,
        fullName: 'Invited User',
        roleId: employeeRole!.id,
      }),
    });
    expect(invite.status).toBe(201);
    expect(invite.body?.user.status).toBe('INVITED');
    expect(invite.body?.user.email).toBe(inviteeEmail);
    expect(invite.body?.inviteToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(invite.body?.acceptUrl).toMatch(/^http.*\/accept-invitation\?token=/);

    const inviteToken = invite.body!.inviteToken;
    const inviteeId = invite.body!.user.id;

    // Invitee can NOT log in yet (no password)
    const earlyLogin = await http<{ message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: inviteeEmail, password: 'anything' }),
    });
    expect(earlyLogin.status).toBe(401);

    // Accept the invitation with a fresh password
    const acceptPassword = 'invitee-password-1';
    const accept = await http<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string; roleId: string | null };
    }>('/auth/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken, password: acceptPassword }),
    });
    expect(accept.status).toBe(200);
    expect(accept.body?.accessToken).toBeTruthy();
    expect(accept.body?.user.id).toBe(inviteeId);
    expect(accept.body?.user.email).toBe(inviteeEmail);
    expect(accept.body?.user.roleId).toBe(employeeRole!.id);

    // Replaying the same invitation token → 401 (single-use)
    const replay = await http('/auth/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken, password: acceptPassword }),
    });
    expect(replay.status).toBe(401);

    // Invitee can now log in normally
    const login = await http<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: inviteeEmail, password: acceptPassword }),
    });
    expect(login.status).toBe(200);

    // /auth/me confirms the user is active + has the right role
    const me = await http<{
      user: { id: string; email: string; roleId: string | null };
    }>('/auth/me', { token: login.body!.accessToken });
    expect(me.status).toBe(200);
    expect(me.body?.user.id).toBe(inviteeId);
    expect(me.body?.user.roleId).toBe(employeeRole!.id);
  });

  test('non-admin cannot invite (USERS_MANAGE required)', async () => {
    if (!apiAvailable) return;
    const admin = await registerAdminOrg();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Invite an Employee
    const roles = await http<Array<{ id: string; name: string }>>('/roles', {
      token: admin.token,
    });
    const employeeRole = (roles.body ?? []).find((r) => r.name === 'Employee')!;
    const employeeEmail = `employee-${stamp}@invite.test.local`;
    const invite = await http<{ inviteToken: string }>('/users', {
      method: 'POST',
      token: admin.token,
      body: JSON.stringify({
        email: employeeEmail,
        fullName: 'Plain Employee',
        roleId: employeeRole.id,
      }),
    });
    const employeePassword = 'employee-pw-1';
    const accept = await http<{ accessToken: string }>('/auth/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token: invite.body!.inviteToken, password: employeePassword }),
    });
    expect(accept.status).toBe(200);
    const employeeToken = accept.body!.accessToken;

    // Employee tries to invite — Employee role has no USERS_MANAGE perm
    const blocked = await http('/users', {
      method: 'POST',
      token: employeeToken,
      body: JSON.stringify({
        email: `noway-${stamp}@invite.test.local`,
        fullName: 'No Way',
      }),
    });
    expect(blocked.status).toBe(403);
  });

  test('refuse duplicate invite email within org', async () => {
    if (!apiAvailable) return;
    const admin = await registerAdminOrg();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `dup-${stamp}@invite.test.local`;

    const first = await http('/users', {
      method: 'POST',
      token: admin.token,
      body: JSON.stringify({ email, fullName: 'First' }),
    });
    expect(first.status).toBe(201);

    const second = await http<{ code: string }>('/users', {
      method: 'POST',
      token: admin.token,
      body: JSON.stringify({ email, fullName: 'Second' }),
    });
    expect(second.status).toBe(409);
    expect(second.body?.code).toBe('CONFLICT');
  });

  test('refuse invite with cross-tenant roleId', async () => {
    if (!apiAvailable) return;
    const orgA = await registerAdminOrg();
    const orgB = await registerAdminOrg();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Get orgB's Employee role id
    const orgBRoles = await http<Array<{ id: string; name: string }>>('/roles', {
      token: orgB.token,
    });
    const orgBEmployeeId = (orgBRoles.body ?? []).find((r) => r.name === 'Employee')!.id;

    // orgA tries to invite a user with orgB's roleId — must reject
    const res = await http<{ code: string }>('/users', {
      method: 'POST',
      token: orgA.token,
      body: JSON.stringify({
        email: `xtenant-${stamp}@invite.test.local`,
        fullName: 'Cross-Tenant Attempt',
        roleId: orgBEmployeeId,
      }),
    });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('VALIDATION_ERROR');
  });

  test('accept-invitation with invalid token → 401', async () => {
    if (!apiAvailable) return;
    const res = await http('/auth/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token: 'definitely-not-a-real-token', password: 'whatever-pw1' }),
    });
    expect(res.status).toBe(401);
  });
});
