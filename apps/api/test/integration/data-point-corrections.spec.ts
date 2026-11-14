/**
 * Correcting a recorded value, live: PATCH /kpis/:id/data/:pointId keeps the
 * old and new value in KPIDataPointHistory (GET …/history), needs a reason,
 * and another tenant cannot correct or read the history of the point (404).
 *
 * Run:
 *   pnpm docker:up && pnpm db:setup
 *   # terminal 1: pnpm --filter @kpi-nexus/api start
 *   # terminal 2: pnpm --filter @kpi-nexus/api test:int -- data-point-corrections
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
      orgName: `corr-${stamp}`,
      slug: `corr-${stamp}`,
      adminEmail: `admin-${stamp}@corr.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'CorrAdmin',
    }),
  });
  if (res.status !== 201 || !res.body) throw new Error(`register failed: ${res.status}`);
  return res.body.accessToken;
}

let tokenA = '';
let tokenB = '';
let kpiId = '';
let pointId = '';

beforeAll(async () => {
  tokenA = await registerOrg('a');
  tokenB = await registerOrg('b');
  const kpi = await http<{ id: string }>('/kpis', {
    method: 'POST',
    token: tokenA,
    body: JSON.stringify({ name: 'Corrected KPI', scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' }),
  });
  kpiId = kpi.body!.id;
  const now = new Date().toISOString();
  const point = await http<{ id: string }>(`/kpis/${kpiId}/data`, { method: 'POST', token: tokenA, body: JSON.stringify({ value: 42, periodStart: now, periodEnd: now }) });
  pointId = point.body!.id;
});

describe('data point corrections', () => {
  test('a correction without a reason, or changing nothing, is refused (400)', async () => {
    expect((await http(`/kpis/${kpiId}/data/${pointId}`, { method: 'PATCH', token: tokenA, body: JSON.stringify({ value: 45 }) })).status).toBe(400);
    expect((await http(`/kpis/${kpiId}/data/${pointId}`, { method: 'PATCH', token: tokenA, body: JSON.stringify({ value: 42, reason: 'same' }) })).status).toBe(400);
  });

  test('the recorder corrects the value; the history keeps old, new and the reason', async () => {
    const res = await http<{ value: number }>(`/kpis/${kpiId}/data/${pointId}`, {
      method: 'PATCH',
      token: tokenA,
      body: JSON.stringify({ value: 45, reason: 'Typed 42 instead of 45' }),
    });
    expect(res.status).toBe(200);
    expect(res.body!.value).toBe(45);
    const data = await http<Array<{ id: string; value: number }>>(`/kpis/${kpiId}/data`, { token: tokenA });
    expect(data.body!.find((p) => p.id === pointId)!.value).toBe(45);
    const history = await http<Array<{ previousValue: number; newValue: number; reason: string }>>(`/kpis/${kpiId}/data/${pointId}/history`, { token: tokenA });
    expect(history.status).toBe(200);
    expect(history.body).toEqual([expect.objectContaining({ previousValue: 42, newValue: 45, reason: 'Typed 42 instead of 45' })]);
  });

  test("another tenant can neither correct the point nor read its history (404)", async () => {
    expect((await http(`/kpis/${kpiId}/data/${pointId}`, { method: 'PATCH', token: tokenB, body: JSON.stringify({ value: 1, reason: 'cross-tenant' }) })).status).toBe(404);
    expect((await http(`/kpis/${kpiId}/data/${pointId}/history`, { token: tokenB })).status).toBe(404);
    const after = await http<Array<{ id: string; value: number }>>(`/kpis/${kpiId}/data`, { token: tokenA });
    expect(after.body!.find((p) => p.id === pointId)!.value).toBe(45);
  });
});
