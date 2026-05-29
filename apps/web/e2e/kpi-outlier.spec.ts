/**
 * KPI outlier flagging (P2 Module 6). API-level e2e via Playwright request.
 * Records a stable baseline series, then a wild value, and asserts the wild
 * data point is flagged isOutlier=true while the baseline points are not.
 * Requires the api at $API_URL (default localhost:4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — kpi-outlier skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('outlier: wild value flagged, baseline values not', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Outlier E2E ${stamp}`,
      slug: `outlier-${stamp}`,
      adminEmail: `admin-${stamp}@outlier.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Outlier Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const kpi = (await (await api.post('/kpis', {
    data: { name: `Outlier KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  const record = (value: number) =>
    api.post(`/kpis/${kpi.id}/data`, {
      data: { value, periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-05-01T01:00:00.000Z' },
    });

  // Build a solid stable history (10 points) so the sample stddev is realistic.
  for (const v of [10, 11, 9, 10, 12, 8, 10, 11, 9, 10]) await record(v);
  // Control: an in-range value recorded against the full history → NOT flagged.
  await record(10.5);
  // Wild value → flagged.
  await record(1000);

  const points = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{ value: number; isOutlier: boolean }>;
  expect(points.find((p) => p.value === 1000)!.isOutlier).toBe(true);
  expect(points.find((p) => p.value === 10.5)!.isOutlier).toBe(false);
});
