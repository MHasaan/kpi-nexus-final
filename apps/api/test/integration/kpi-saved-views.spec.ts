/**
 * Saved views on the KPI list, live: create / list / update / delete, a
 * duplicate name is 409, invalid filters are 400, and another tenant neither
 * lists nor changes a view (404).
 *
 * Run:
 *   pnpm docker:up && pnpm db:setup
 *   # terminal 1: pnpm --filter @kpi-nexus/api start
 *   # terminal 2: pnpm --filter @kpi-nexus/api test:int -- kpi-saved-views
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function http<T = unknown>(url: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_URL}${url}`, { ...init, headers });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    // no body (204)
  }
  return { status: res.status, body };
}

async function registerOrg(tag: string): Promise<string> {
  const stamp = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await http<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `views-${stamp}`,
      slug: `views-${stamp}`,
      adminEmail: `admin-${stamp}@views.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'ViewsAdmin',
    }),
  });
  if (res.status !== 201 || !res.body) throw new Error(`register failed: ${res.status}`);
  return res.body.accessToken;
}

interface View {
  id: string;
  name: string;
  filters: Record<string, string>;
  isShared: boolean;
  mine: boolean;
}

let tokenA = '';
let tokenB = '';

beforeAll(async () => {
  tokenA = await registerOrg('a');
  tokenB = await registerOrg('b');
});

describe('KPI saved views', () => {
  test('create, list, rename, delete; duplicates 409; bad filters 400', async () => {
    const bad = await http('/kpi-saved-views', { method: 'POST', token: tokenA, body: JSON.stringify({ name: 'x', filters: { status: 'NOPE' } }) });
    expect(bad.status).toBe(400);

    const created = await http<View>('/kpi-saved-views', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({ name: 'Active', filters: { status: 'ACTIVE', scope: 'ORG_WIDE' }, isShared: true }),
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Active', filters: { status: 'ACTIVE', scope: 'ORG_WIDE' }, isShared: true, mine: true });

    expect((await http('/kpi-saved-views', { method: 'POST', token: tokenA, body: JSON.stringify({ name: 'Active', filters: {} }) })).status).toBe(409);

    const list = await http<View[]>('/kpi-saved-views', { token: tokenA });
    expect(list.body!.map((v) => v.name)).toEqual(['Active']);

    const renamed = await http<View>(`/kpi-saved-views/${created.body!.id}`, { method: 'PATCH', token: tokenA, body: JSON.stringify({ name: 'Active org-wide' }) });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Active org-wide', isShared: true });

    // Another tenant: not listed, cannot change or delete (404).
    expect((await http<View[]>('/kpi-saved-views', { token: tokenB })).body).toEqual([]);
    expect((await http(`/kpi-saved-views/${created.body!.id}`, { method: 'PATCH', token: tokenB, body: JSON.stringify({ name: 'x' }) })).status).toBe(404);
    expect((await http(`/kpi-saved-views/${created.body!.id}`, { method: 'DELETE', token: tokenB })).status).toBe(404);

    expect((await http(`/kpi-saved-views/${created.body!.id}`, { method: 'DELETE', token: tokenA })).status).toBe(204);
    expect((await http<View[]>('/kpi-saved-views', { token: tokenA })).body).toEqual([]);
  });
});
