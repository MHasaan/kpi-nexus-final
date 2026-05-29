/**
 * Demo data seeding (P2 ops). API-level e2e via Playwright request. Seeds a
 * sample dataset and verifies idempotency. Requires the api at $API_URL.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — demo-data skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('demo-data: seed creates sample KPIs + points, idempotent on re-run', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Demo E2E ${stamp}`,
      slug: `demo-${stamp}`,
      adminEmail: `admin-${stamp}@demo.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Demo Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });

  const seed = await api.post('/demo-data/seed');
  expect(seed.status()).toBe(201);
  const result = (await seed.json()) as { alreadySeeded: boolean; kpis: number; dataPoints: number };
  expect(result.alreadySeeded).toBe(false);
  expect(result.kpis).toBe(4);
  expect(result.dataPoints).toBe(24); // 4 KPIs × 6 months

  // The demo KPIs appear in the catalog.
  const kpis = (await (await api.get('/kpis')).json()) as Array<{ name: string }>;
  expect(kpis.some((k) => k.name === 'Monthly Revenue (demo)')).toBe(true);

  // Re-seeding is a no-op.
  const again = (await (await api.post('/demo-data/seed')).json()) as { alreadySeeded: boolean };
  expect(again.alreadySeeded).toBe(true);
});
