/**
 * Plan 2.5 (UI-010 / UI-016): an invitation could not carry a manager, could not
 * be sent again when the email never arrived, and could not be withdrawn; and an
 * archived person could not be brought back.
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
const post = <T>(url: string, token: string | undefined, body?: unknown) =>
  http<T>(url, { method: 'POST', token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** One throwaway password for every account these tests create. */
const PASSWORD = 'correct-horse-battery-staple';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function registerOrg(tag: string): Promise<{ token: string; adminId: string }> {
  const stamp = suffix();
  const reg = await post<{ accessToken: string; user: { id: string } }>('/auth/register', undefined, {
    orgName: `${tag} ${stamp}`,
    slug: `${tag}-${stamp}`,
    adminEmail: `admin-${stamp}@${tag}.test.local`,
    adminPassword: PASSWORD,
    adminFullName: `${tag} Admin`,
  });
  expect(reg.status).toBe(201);
  return { token: reg.body!.accessToken, adminId: reg.body!.user.id };
}

type Invite = { user: { id: string; managerId: string | null; status: string }; inviteToken: string; emailSent: boolean };
type User = { id: string; status: string; email: string; managerId: string | null };

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
});

describe('invite lifecycle', () => {
  test('an invitation can name the manager; a manager from another organisation is refused', async () => {
    if (!apiAvailable) return;
    const a = await registerOrg('invmgr');
    const b = await registerOrg('invmgrb');
    const stamp = suffix();

    const withManager = await post<Invite>('/users', a.token, {
      email: `report-${stamp}@invmgr.test.local`,
      fullName: 'New Report',
      managerId: a.adminId,
    });
    expect(withManager.status).toBe(201);
    expect(withManager.body?.user.managerId).toBe(a.adminId);

    const foreign = await post<{ code: string }>('/users', a.token, {
      email: `foreign-${stamp}@invmgr.test.local`,
      fullName: 'Foreign Manager',
      managerId: b.adminId,
    });
    expect(foreign.status).toBe(400);
  });

  test('resend replaces the link: the old one stops working, the new one is accepted', async () => {
    if (!apiAvailable) return;
    const { token } = await registerOrg('invresend');
    const first = await post<Invite>('/users', token, { email: `late-${suffix()}@invresend.test.local`, fullName: 'Late Joiner' });
    expect(first.status).toBe(201);
    const id = first.body!.user.id;

    const again = await post<{ inviteToken: string; emailSent: boolean }>(`/users/${id}/resend-invite`, token);
    expect(again.status).toBe(200);
    expect(again.body?.inviteToken).toBeTruthy();
    expect(again.body?.inviteToken).not.toBe(first.body!.inviteToken);

    const stale = await post('/auth/accept-invitation', undefined, { token: first.body!.inviteToken, password: PASSWORD });
    expect(stale.status).toBe(401);
    const fresh = await post('/auth/accept-invitation', undefined, { token: again.body!.inviteToken, password: PASSWORD });
    expect(fresh.status).toBe(200);

    // Now active: there is nothing left to resend or cancel.
    const resendActive = await post<{ code: string }>(`/users/${id}/resend-invite`, token);
    expect(resendActive.status).toBe(400);
    expect(resendActive.body?.code).toBe('NOT_INVITED');
    const cancelActive = await post<{ code: string }>(`/users/${id}/cancel-invite`, token);
    expect(cancelActive.status).toBe(400);
    expect(cancelActive.body?.code).toBe('NOT_INVITED');
  });

  test('cancel withdraws the invitation: the link dies and the address can be invited again', async () => {
    if (!apiAvailable) return;
    const { token } = await registerOrg('invcancel');
    const email = `oops-${suffix()}@invcancel.test.local`;
    const first = await post<Invite>('/users', token, { email, fullName: 'Wrong Person' });
    const id = first.body!.user.id;

    const cancel = await post(`/users/${id}/cancel-invite`, token);
    expect(cancel.status).toBe(204);

    const dead = await post('/auth/accept-invitation', undefined, { token: first.body!.inviteToken, password: PASSWORD });
    expect(dead.status).toBe(401);
    const gone = await http<User>(`/users/${id}`, { token });
    expect(gone.body?.status).toBe('PURGED');
    expect(gone.body?.email).not.toBe(email);

    const reinvite = await post<Invite>('/users', token, { email, fullName: 'Right Person' });
    expect(reinvite.status).toBe(201);
  });

  test('restore brings an archived person back, as they were', async () => {
    if (!apiAvailable) return;
    const { token } = await registerOrg('invrestore');
    const invited = await post<Invite>('/users', token, { email: `back-${suffix()}@invrestore.test.local`, fullName: 'Comes Back' });
    const id = invited.body!.user.id;
    const accepted = await post<{ accessToken: string }>('/auth/accept-invitation', undefined, {
      token: invited.body!.inviteToken,
      password: PASSWORD,
    });
    expect(accepted.status).toBe(200);

    // Not archived yet: nothing to restore.
    const early = await post<{ code: string }>(`/users/${id}/restore`, token);
    expect(early.status).toBe(400);
    expect(early.body?.code).toBe('NOT_ARCHIVED');

    expect((await post(`/users/${id}/offboard`, token, {})).status).toBe(200);
    expect((await http<User>(`/users/${id}`, { token })).body?.status).toBe('ARCHIVED');

    const restored = await post<User>(`/users/${id}/restore`, token);
    expect(restored.status).toBe(200);
    expect(restored.body?.status).toBe('ACTIVE');

    // Someone archived before they ever accepted goes back to invited.
    const never = await post<Invite>('/users', token, { email: `never-${suffix()}@invrestore.test.local`, fullName: 'Never Joined' });
    expect((await post(`/users/${never.body!.user.id}/offboard`, token, {})).status).toBe(200);
    const back = await post<User>(`/users/${never.body!.user.id}/restore`, token);
    expect(back.body?.status).toBe('INVITED');
  });

  test('another organisation cannot resend, cancel or restore', async () => {
    if (!apiAvailable) return;
    const a = await registerOrg('invxa');
    const b = await registerOrg('invxb');
    const inA = await post<Invite>('/users', a.token, { email: `x-${suffix()}@invxa.test.local`, fullName: 'Person A' });
    const id = inA.body!.user.id;
    for (const action of ['resend-invite', 'cancel-invite', 'restore']) {
      expect((await post(`/users/${id}/${action}`, b.token)).status, action).toBe(404);
    }
    expect((await http<User>(`/users/${id}`, { token: a.token })).body?.status).toBe('INVITED');
  });
});
