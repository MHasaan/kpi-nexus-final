/**
 * Org-unit KPIs (P2 Module 13). API-level e2e via Playwright request. Covers
 * assign with descendant inheritance cascade, override (nearest-ancestor wins),
 * and unassign. Requires the api at $API_URL (default localhost:4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — org-unit-kpis skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Api = import('@playwright/test').APIRequestContext;
interface UnitKpi { kpiId: string; inherited: boolean; inheritedFromUnitId: string | null }

async function makeUnit(api: Api, name: string, parentUnitId?: string): Promise<string> {
  const res = await api.post('/org-units', { data: { name, ...(parentUnitId ? { parentUnitId } : {}) } });
  return ((await res.json()) as { id: string }).id;
}

async function unitKpis(api: Api, unitId: string): Promise<UnitKpi[]> {
  return (await (await api.get(`/org-units/${unitId}/kpis`)).json()) as UnitKpi[];
}

test('org-unit-kpis: assign cascades to descendants, override + unassign re-resolve', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `UnitKpi E2E ${stamp}`,
      slug: `unitkpi-${stamp}`,
      adminEmail: `admin-${stamp}@unitkpi.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'UnitKpi Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  // Tree: P → C → GC
  const P = await makeUnit(api, `Parent ${stamp}`);
  const C = await makeUnit(api, `Child ${stamp}`, P);
  const GC = await makeUnit(api, `Grandchild ${stamp}`, C);

  // PER_UNIT KPI (creation requires orgUnitIds) + an ORG_WIDE KPI.
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Unit KPI ${stamp}`, scope: 'PER_UNIT', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'SUM', orgUnitIds: [P] },
  })).json()) as { id: string };
  const orgWide = (await (await api.post('/kpis', {
    data: { name: `Org KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  // Assign at P → cascades inherited rows to C and GC.
  expect((await api.post(`/org-units/${P}/kpis`, { data: { kpiId: kpi.id, targetValue: 50 } })).status()).toBe(201);

  expect((await unitKpis(api, P)).find((r) => r.kpiId === kpi.id)!.inherited).toBe(false); // direct
  const cRow = (await unitKpis(api, C)).find((r) => r.kpiId === kpi.id)!;
  expect(cRow.inherited).toBe(true);
  expect(cRow.inheritedFromUnitId).toBe(P);
  expect((await unitKpis(api, GC)).find((r) => r.kpiId === kpi.id)!.inheritedFromUnitId).toBe(P);

  // Assigning the ORG_WIDE KPI to a unit is refused (422).
  const bad = await api.post(`/org-units/${P}/kpis`, { data: { kpiId: orgWide.id } });
  expect(bad.status()).toBe(422);

  // Override at C → C becomes direct; GC now inherits from C (nearest).
  expect((await api.post(`/org-units/${C}/kpis/${kpi.id}/override`)).status()).toBe(200);
  expect((await unitKpis(api, C)).find((r) => r.kpiId === kpi.id)!.inherited).toBe(false);
  expect((await unitKpis(api, GC)).find((r) => r.kpiId === kpi.id)!.inheritedFromUnitId).toBe(C);

  // Unassign at P → P loses its row; C still direct; GC still inherits from C.
  expect((await api.delete(`/org-units/${P}/kpis/${kpi.id}`)).status()).toBe(204);
  expect((await unitKpis(api, P)).find((r) => r.kpiId === kpi.id)).toBeUndefined();
  expect((await unitKpis(api, C)).find((r) => r.kpiId === kpi.id)!.inherited).toBe(false);
  expect((await unitKpis(api, GC)).find((r) => r.kpiId === kpi.id)!.inheritedFromUnitId).toBe(C);
});
