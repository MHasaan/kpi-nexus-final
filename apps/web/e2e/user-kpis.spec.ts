/**
 * User KPIs (P2 Module 12). API-level e2e via Playwright request. Covers
 * assign (PER_USER only), listMyKpis, data recording refreshing currentValue +
 * status, scope rejection, and unassign. Requires the api at $API_URL.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — user-kpis skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface MyKpi { assignmentId: string; kpiId: string; targetValue: number | null; currentValue: number | null; status: string | null }

test('user-kpis: assign PER_USER, record → currentValue/status, scope reject, unassign', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `UserKpi E2E ${stamp}`,
      slug: `userkpi-${stamp}`,
      adminEmail: `admin-${stamp}@userkpi.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'UserKpi Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const me = ((await (await api.get('/auth/me')).json()) as { user: { id: string } }).user;

  // PER_USER KPI + an ORG_WIDE KPI.
  const perUser = (await (await api.post('/kpis', {
    data: { name: `Self KPI ${stamp}`, scope: 'PER_USER', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', userIds: [me.id] },
  })).json()) as { id: string };
  const orgWide = (await (await api.post('/kpis', {
    data: { name: `Org KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  // Assign PER_USER KPI to self with a target.
  const assign = await api.post('/user-kpis/assign', { data: { userId: me.id, kpiId: perUser.id, targetValue: 100 } });
  expect(assign.status()).toBe(201);

  // Assigning an ORG_WIDE KPI is refused (422).
  const bad = await api.post('/user-kpis/assign', { data: { userId: me.id, kpiId: orgWide.id, targetValue: 5 } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).code).toBe('SCOPE_MISMATCH');

  // listMyKpis shows the assignment, no value yet.
  let mine = (await (await api.get('/user-kpis/my-kpis')).json()) as MyKpi[];
  const row = mine.find((m) => m.kpiId === perUser.id)!;
  expect(row).toBeTruthy();
  expect(row.targetValue).toBe(100);
  expect(row.currentValue).toBeNull();

  // Record a value via the PER_USER data endpoint → refreshes current + status.
  const rec = await api.post(`/user-kpis/my-kpis/${row.assignmentId}/data`, {
    data: { value: 95, periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-05-01T01:00:00.000Z' },
  });
  expect(rec.status()).toBe(201);

  mine = (await (await api.get('/user-kpis/my-kpis')).json()) as MyKpi[];
  const updated = mine.find((m) => m.kpiId === perUser.id)!;
  expect(updated.currentValue).toBe(95);
  expect(updated.status).toBe('on_track'); // 95/100 = 0.95 ≥ 0.9

  // Unassign → 204, gone from my-kpis.
  expect((await api.delete(`/user-kpis/assignments/${row.assignmentId}`)).status()).toBe(204);
  mine = (await (await api.get('/user-kpis/my-kpis')).json()) as MyKpi[];
  expect(mine.find((m) => m.kpiId === perUser.id)).toBeUndefined();
});
