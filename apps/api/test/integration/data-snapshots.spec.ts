/**
 * KPI snapshots, live: take (with a reason), list, open; an invalid body is
 * 400; another tenant can neither list nor open the snapshot (404).
 *
 * Run:
 *   pnpm docker:up && pnpm db:setup
 *   # terminal 1: pnpm --filter @kpi-nexus/api start
 *   # terminal 2: pnpm --filter @kpi-nexus/api test:int -- data-snapshots
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
    // no body
  }
  return { status: res.status, body };
}

async function registerOrg(tag: string): Promise<string> {
  const stamp = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await http<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `snap-${stamp}`,
      slug: `snap-${stamp}`,
      adminEmail: `admin-${stamp}@snap.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'SnapAdmin',
    }),
  });
  if (res.status !== 201 || !res.body) throw new Error(`register failed: ${res.status}`);
  return res.body.accessToken;
}

let tokenA = '';
let tokenB = '';
let kpiId = '';

beforeAll(async () => {
  tokenA = await registerOrg('a');
  tokenB = await registerOrg('b');
  const kpi = await http<{ id: string }>('/kpis', {
    method: 'POST',
    token: tokenA,
    body: JSON.stringify({ name: 'Snapshotted KPI', scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' }),
  });
  kpiId = kpi.body!.id;
  const now = new Date().toISOString();
  await http(`/kpis/${kpiId}/data`, { method: 'POST', token: tokenA, body: JSON.stringify({ value: 42, periodStart: now, periodEnd: now }) });
});

describe('KPI snapshots', () => {
  test('take, list and open a snapshot; another tenant gets 404', async () => {
    expect((await http(`/kpis/${kpiId}/snapshots`, { method: 'POST', token: tokenA, body: JSON.stringify({ reason: 'x', extra: 1 }) })).status).toBe(400);

    const taken = await http<{ id: string; pointCount: number; reason: string }>(`/kpis/${kpiId}/snapshots`, {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({ reason: 'Before Q4' }),
    });
    expect(taken.status).toBe(201);
    expect(taken.body).toMatchObject({ reason: 'Before Q4', pointCount: 1 });

    const list = await http<Array<{ id: string }>>(`/kpis/${kpiId}/snapshots`, { token: tokenA });
    expect(list.body!.map((s) => s.id)).toEqual([taken.body!.id]);

    const one = await http<{ payload: { kpi: { id: string }; points: Array<{ value: number }> } }>(`/kpis/${kpiId}/snapshots/${taken.body!.id}`, { token: tokenA });
    expect(one.status).toBe(200);
    expect(one.body!.payload.kpi.id).toBe(kpiId);
    expect(one.body!.payload.points.map((p) => p.value)).toEqual([42]);

    expect((await http<unknown[]>(`/kpis/${kpiId}/snapshots`, { token: tokenB })).body).toEqual([]);
    expect((await http(`/kpis/${kpiId}/snapshots/${taken.body!.id}`, { token: tokenB })).status).toBe(404);
  });
});
