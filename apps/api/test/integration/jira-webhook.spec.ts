/**
 * Jira webhook security (audit BE-014) — live against the api + DB.
 *
 * The webhook used to be a single public route that matched ANY tenant's task
 * by `externalRef contains <issue key>` — an anonymous caller could change task
 * status across tenants. It is now bound to one Jira IntegrationConnection:
 *
 *   POST /integrations/jira/webhook/:connectionId?secret=<webhookSecret>
 *
 * The secret lives in the connection's encrypted tokens (`webhookSecret`), the
 * lookup is scoped to that connection's org, and the issue key must match the
 * task's externalRef exactly (bare key or a `/browse/<KEY>` URL).
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function http<T = unknown>(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function registerOrg(label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await http<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `Jira ${label} ${stamp}`,
      slug: `jira-${label}-${stamp}`,
      adminEmail: `jira-${label}-${stamp}@int.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: `Jira ${label} Admin`,
    }),
  });
  if (reg.status !== 201) throw new Error(`register failed (${reg.status})`);
  return reg.body.accessToken;
}

async function taskStatus(token: string, id: string): Promise<string> {
  const res = await http<{ status: string }>(`/tasks/${id}`, { token });
  return res.body.status;
}

const apiUp = await isApiUp();
if (!apiUp) console.warn('[skip] api not reachable — jira webhook tests skipped');

describe.skipIf(!apiUp)('Jira webhook is authenticated and tenant-scoped (BE-014)', () => {
  const key = `JWH-${Date.now().toString(36).toUpperCase()}`;
  const secret = `whsec-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  let tokenA: string;
  let tokenB: string;
  let taskA: string;
  let taskB: string;
  let connA: string;
  let connNoSecret: string;

  const deliver = (path: string, status = 'Done') =>
    http(path, { method: 'POST', body: JSON.stringify({ issue: { key, fields: { status: { name: status } } } }) });

  beforeAll(async () => {
    tokenA = await registerOrg('a');
    tokenB = await registerOrg('b');
    const mk = (token: string) =>
      http<{ id: string }>('/tasks', { method: 'POST', token, body: JSON.stringify({ title: 'Linked to Jira', externalRef: `https://jira.example.test/browse/${key}` }) });
    taskA = (await mk(tokenA)).body.id;
    taskB = (await mk(tokenB)).body.id;
    connA = (
      await http<{ id: string }>('/integrations', {
        method: 'POST',
        token: tokenA,
        body: JSON.stringify({ provider: 'jira', displayName: 'Jira A', tokens: { webhookSecret: secret } }),
      })
    ).body.id;
    connNoSecret = (
      await http<{ id: string }>('/integrations', {
        method: 'POST',
        token: tokenA,
        body: JSON.stringify({ provider: 'jira', displayName: 'Jira no secret', tokens: { access_token: 'x' } }),
      })
    ).body.id;
  });

  test('legacy global route no longer accepts anonymous updates', async () => {
    const res = await deliver('/integrations/jira/webhook');
    expect(res.status).toBe(404);
    expect(await taskStatus(tokenA, taskA)).toBe('TODO');
    expect(await taskStatus(tokenB, taskB)).toBe('TODO');
  });

  test('wrong secret → 401, nothing changes', async () => {
    const res = await deliver(`/integrations/jira/webhook/${connA}?secret=not-the-secret`);
    expect(res.status).toBe(401);
    expect(await taskStatus(tokenA, taskA)).toBe('TODO');
  });

  test('missing secret → 401', async () => {
    const res = await deliver(`/integrations/jira/webhook/${connA}`);
    expect(res.status).toBe(401);
  });

  test('connection without a configured webhookSecret fails closed → 401', async () => {
    const res = await deliver(`/integrations/jira/webhook/${connNoSecret}?secret=anything`);
    expect(res.status).toBe(401);
  });

  test('unknown connection → 401 (no existence oracle)', async () => {
    const res = await deliver(`/integrations/jira/webhook/does-not-exist?secret=${secret}`);
    expect(res.status).toBe(401);
  });

  test("correct secret updates only the connection org's task", async () => {
    const res = await deliver(`/integrations/jira/webhook/${connA}?secret=${encodeURIComponent(secret)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: true });
    expect(await taskStatus(tokenA, taskA)).toBe('DONE');
    expect(await taskStatus(tokenB, taskB)).toBe('TODO'); // same issue key, other tenant — untouched
  });

  test('issue key must match exactly (no substring matches)', async () => {
    const res = await http(`/integrations/jira/webhook/${connA}?secret=${encodeURIComponent(secret)}`, {
      method: 'POST',
      body: JSON.stringify({ issue: { key: key.slice(0, 5), fields: { status: { name: 'In Progress' } } } }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: false });
    expect(await taskStatus(tokenA, taskA)).toBe('DONE');
  });
});
