/**
 * UI-010: PATCH /users/:id — a person's manager, role and position can be
 * changed after they are invited. Before this, nothing could set a manager at
 * all, so GET /user-kpis/team was empty in every real organisation.
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function http<T = unknown>(url: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_URL}${url}`, { ...init, headers });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    /* no body */
  }
  return { status: res.status, body };
}

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function registerOrg(tag: string): Promise<{ token: string; adminId: string }> {
  const stamp = suffix();
  const reg = await http<{ accessToken: string; user: { id: string } }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `${tag} ${stamp}`,
      slug: `${tag}-${stamp}`,
      adminEmail: `admin-${stamp}@${tag}.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: `${tag} Admin`,
    }),
  });
  expect(reg.status).toBe(201);
  return { token: reg.body!.accessToken, adminId: reg.body!.user.id };
}

async function invite(token: string, name: string): Promise<string> {
  const res = await http<{ user: { id: string } }>('/users', {
    method: 'POST',
    token,
    body: JSON.stringify({ email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}-${suffix()}@people.test.local`, fullName: name }),
  });
  expect(res.status).toBe(201);
  return res.body!.user.id;
}

type User = { id: string; managerId: string | null; positionId: string | null; roleId: string | null; fullName: string };

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
});

describe('PATCH /users/:id', () => {
  test('sets and clears a manager, sets a position, and the change is readable', async () => {
    if (!apiAvailable) return;
    const { token, adminId } = await registerOrg('userupd');
    const lead = await invite(token, 'Lead Person');
    const dev = await invite(token, 'Dev Person');
    const position = await http<{ id: string }>('/positions', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: `Engineer ${suffix()}`, track: 'IC' }),
    });
    expect(position.status).toBe(201);

    const set = await http<User>(`/users/${dev}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ managerId: lead, positionId: position.body!.id, fullName: 'Dev Renamed' }),
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ managerId: lead, positionId: position.body!.id, fullName: 'Dev Renamed' });

    const read = await http<User>(`/users/${dev}`, { token });
    expect(read.body?.managerId).toBe(lead);

    // A loop is refused: the lead cannot report to their own report.
    const loop = await http<{ code: string }>(`/users/${lead}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ managerId: dev }),
    });
    expect(loop.status).toBe(400);
    expect(loop.body?.code).toBe('MANAGER_CYCLE');

    // null clears.
    const cleared = await http<User>(`/users/${dev}`, { method: 'PATCH', token, body: JSON.stringify({ managerId: null }) });
    expect(cleared.status).toBe(200);
    expect(cleared.body?.managerId).toBeNull();

    // Nobody changes their own role, and an empty or unknown-key body is refused.
    const roles = await http<Array<{ id: string; isAdmin: boolean }>>('/roles', { token });
    const nonAdmin = roles.body!.find((r) => !r.isAdmin)!;
    const self = await http<{ code: string }>(`/users/${adminId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ roleId: nonAdmin.id }),
    });
    expect(self.status).toBe(400);
    expect(self.body?.code).toBe('SELF_ROLE_CHANGE');
    expect((await http(`/users/${dev}`, { method: 'PATCH', token, body: JSON.stringify({}) })).status).toBe(400);
    expect((await http(`/users/${dev}`, { method: 'PATCH', token, body: JSON.stringify({ email: 'x@y.z' }) })).status).toBe(400);
  });

  test('a person in another organisation cannot be edited, or used as a manager', async () => {
    if (!apiAvailable) return;
    const a = await registerOrg('userupda');
    const b = await registerOrg('userupdb');
    const inA = await invite(a.token, 'Person A');
    const inB = await invite(b.token, 'Person B');

    const foreignEdit = await http(`/users/${inA}`, { method: 'PATCH', token: b.token, body: JSON.stringify({ fullName: 'Hijacked' }) });
    expect(foreignEdit.status).toBe(404);

    const foreignManager = await http(`/users/${inB}`, { method: 'PATCH', token: b.token, body: JSON.stringify({ managerId: inA }) });
    expect(foreignManager.status).toBe(400);

    const untouched = await http<User>(`/users/${inA}`, { token: a.token });
    expect(untouched.body?.fullName).toBe('Person A');
  });
});
