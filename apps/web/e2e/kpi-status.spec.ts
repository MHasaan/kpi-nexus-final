/**
 * KPI status transitions + version history (P2 backlog #2). API-level e2e via
 * Playwright request context — no UI surface for this backend concern.
 * Requires the api at $API_URL (default http://localhost:4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-status skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('KPI lifecycle: versions on create, legal transitions, illegal rejected', async () => {
  test.skip(!apiAvailable, 'api not reachable');

  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Status E2E ${stamp}`,
      slug: `status-${stamp}`,
      adminEmail: `admin-${stamp}@status.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Status Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  // Create → DRAFT, version 1 snapshot exists.
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Lifecycle ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', unit: 'u', aggregationMethod: 'LAST' },
  })).json()) as { id: string; status: string; version: number };
  expect(kpi.status).toBe('DRAFT');

  let versions = (await (await api.get(`/kpis/${kpi.id}/versions`)).json()) as Array<{ version: number }>;
  expect(versions.length).toBe(1);

  // Illegal jump DRAFT → ACTIVE → 422.
  const bad = await api.post(`/kpis/${kpi.id}/transition`, { data: { to: 'ACTIVE' } });
  expect(bad.status()).toBe(422);
  expect(((await bad.json()) as { code: string }).code).toBe('INVALID_STATUS_TRANSITION');

  // Legal path DRAFT → PROPOSED → APPROVED → ACTIVE.
  for (const to of ['PROPOSED', 'APPROVED', 'ACTIVE']) {
    const res = await api.post(`/kpis/${kpi.id}/transition`, { data: { to, reason: `move to ${to}` } });
    expect(res.status()).toBe(201);
    expect(((await res.json()) as { status: string }).status).toBe(to);
  }

  // Version history grew (1 create + 3 transitions = 4).
  versions = (await (await api.get(`/kpis/${kpi.id}/versions`)).json()) as Array<{ version: number }>;
  expect(versions.length).toBe(4);
  expect(versions[0]!.version).toBeGreaterThan(versions[versions.length - 1]!.version); // desc

  // ARCHIVED is terminal: ACTIVE → ARCHIVED ok, then any → 422.
  expect((await api.post(`/kpis/${kpi.id}/transition`, { data: { to: 'ARCHIVED' } })).status()).toBe(201);
  expect((await api.post(`/kpis/${kpi.id}/transition`, { data: { to: 'ACTIVE' } })).status()).toBe(422);
});
