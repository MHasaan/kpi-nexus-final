/**
 * Billing (P1 module). API-level e2e via Playwright request. Covers plan status,
 * setPlan, and KPI quota enforcement (402 when a FREE-plan org exceeds its kpis
 * limit). Default orgs are ENTERPRISE (unlimited) so existing flows are
 * unaffected. Requires the api at $API_URL (default localhost:4000).
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
  if (!apiAvailable) console.warn('[skip] api not reachable — billing skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Status { planKey: string; quotas: Array<{ key: string; limit: number; current: number }> }

test('billing: default ENTERPRISE unlimited, FREE plan enforces kpis quota (402)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Billing E2E ${stamp}`,
      slug: `billing-${stamp}`,
      adminEmail: `admin-${stamp}@billing.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Billing Admin',
    },
  })).json()) as { accessToken: string };
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  // Default plan is ENTERPRISE (unlimited).
  const status = (await (await api.get('/billing')).json()) as Status;
  expect(status.planKey).toBe('ENTERPRISE');
  expect(status.quotas.find((q) => q.key === 'kpis')!.limit).toBe(0); // unlimited

  // Switch to FREE (kpis limit 10).
  const setFree = await api.post('/billing/plan', { data: { planKey: 'FREE' } });
  expect(setFree.status()).toBe(201);
  expect(((await setFree.json()) as Status).planKey).toBe('FREE');

  // Create up to the limit (10), then the 11th is rejected with 402.
  const makeKpi = (n: number) =>
    api.post('/kpis', {
      data: { name: `Q KPI ${stamp} ${n}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
    });
  for (let i = 0; i < 10; i++) {
    expect((await makeKpi(i)).status()).toBe(201);
  }
  const over = await makeKpi(10);
  expect(over.status()).toBe(402);
  expect((await over.json()).code).toBe('QUOTA_EXCEEDED');

  // Upgrading back to ENTERPRISE lifts the cap.
  await api.post('/billing/plan', { data: { planKey: 'ENTERPRISE' } });
  expect((await makeKpi(99)).status()).toBe(201);
});
