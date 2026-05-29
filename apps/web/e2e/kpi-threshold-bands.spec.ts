/**
 * KPI threshold bands (P2 backlog #4). API-level e2e via Playwright request.
 * Covers CRUD + status resolution against recorded data points.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-threshold-bands skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('threshold bands: CRUD + status resolution from data points', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Bands E2E ${stamp}`,
      slug: `bands-${stamp}`,
      adminEmail: `admin-${stamp}@bands.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Bands Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const kpi = (await (await api.post('/kpis', {
    data: { name: `Band KPI ${stamp}`, scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  // No bands yet → no_bands.
  let status = (await (await api.get(`/kpis/${kpi.id}/threshold-bands/status`)).json()) as { reason: string };
  expect(status.reason).toBe('no_bands');

  // Create 3 bands.
  for (const b of [
    { name: 'critical', upper: 50, color: '#dc2626', order: 0 },
    { name: 'warning', lower: 50, upper: 80, color: '#f59e0b', order: 1 },
    { name: 'good', lower: 80, color: '#16a34a', order: 2, consecutivePointsRequired: 1 },
  ]) {
    expect((await api.post(`/kpis/${kpi.id}/threshold-bands`, { data: b })).status()).toBe(201);
  }
  const bands = (await (await api.get(`/kpis/${kpi.id}/threshold-bands`)).json()) as unknown[];
  expect(bands.length).toBe(3);

  // No data yet → no_data.
  status = (await (await api.get(`/kpis/${kpi.id}/threshold-bands/status`)).json()) as { reason: string };
  expect(status.reason).toBe('no_data');

  // Record a 'good' value → status good.
  await api.post(`/kpis/${kpi.id}/data`, {
    data: { value: 92, periodStart: '2026-05-29T00:00:00.000Z', periodEnd: '2026-05-29T12:00:00.000Z' },
  });
  status = (await (await api.get(`/kpis/${kpi.id}/threshold-bands/status`)).json()) as { band: string };
  expect(status.band).toBe('good');
});
