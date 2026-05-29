/**
 * KPI cascades (P2 calc-engine foundations, plan Module 10). API-level e2e via
 * Playwright request. Covers attach/detach CRUD, tree assembly, and cycle +
 * self-edge rejection. Requires the api at $API_URL (default localhost:4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-cascades skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function makeKpi(api: import('@playwright/test').APIRequestContext, name: string): Promise<string> {
  const res = await api.post('/kpis', {
    data: { name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'SUM' },
  });
  return ((await res.json()) as { id: string }).id;
}

test('cascades: CRUD + tree + cycle/self-edge rejection', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Cascade E2E ${stamp}`,
      slug: `cascade-${stamp}`,
      adminEmail: `admin-${stamp}@cascade.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Cascade Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const parent = await makeKpi(api, `Total ${stamp}`);
  const childA = await makeKpi(api, `A ${stamp}`);
  const childB = await makeKpi(api, `B ${stamp}`);

  // Attach two children to the parent.
  expect((await api.post('/kpi-cascades', { data: { parentKpiId: parent, childKpiId: childA, method: 'SUM', weight: 1 } })).status()).toBe(201);
  const second = await api.post('/kpi-cascades', { data: { parentKpiId: parent, childKpiId: childB, method: 'SUM', weight: 2 } });
  expect(second.status()).toBe(201);
  const secondId = ((await second.json()) as { id: string }).id;

  // Tree shows the parent with 2 children.
  const tree = (await (await api.get('/kpi-cascades/all')).json()) as Array<{ parentKpiId: string; children: unknown[] }>;
  const node = tree.find((n) => n.parentKpiId === parent)!;
  expect(node).toBeTruthy();
  expect(node.children.length).toBe(2);

  // Self-edge rejected.
  expect((await api.post('/kpi-cascades', { data: { parentKpiId: childA, childKpiId: childA } })).status()).toBe(400);

  // Cycle rejected: childA is already a leaf under parent; making parent a child of childA cycles.
  const cycle = await api.post('/kpi-cascades', { data: { parentKpiId: childA, childKpiId: parent } });
  expect(cycle.status()).toBe(400);
  expect((await cycle.json()).code).toBe('CASCADE_CYCLE');

  // Detach one edge → 204, tree drops to 1 child.
  expect((await api.delete(`/kpi-cascades/${secondId}`)).status()).toBe(204);
  const tree2 = (await (await api.get('/kpi-cascades/all')).json()) as Array<{ parentKpiId: string; children: unknown[] }>;
  expect(tree2.find((n) => n.parentKpiId === parent)!.children.length).toBe(1);
});
