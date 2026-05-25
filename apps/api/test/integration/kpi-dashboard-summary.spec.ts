/**
 * P2.7 — GET /kpis/dashboard-summary integration tests.
 *
 * The endpoint returns one row per visible KPI with the latest value +
 * aggregated value over the window. Visibility filtering uses the same
 * helper that lists work through.
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function http<T = unknown>(
  url: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) {
    headers.set('content-type', 'application/json');
  }
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

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  user: { id: string };
}

async function registerOrg(stamp: string): Promise<RegisterResult> {
  const res = await http<RegisterResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `summary-${stamp}`,
      slug: `summary-${stamp}`,
      adminEmail: `admin-${stamp}@summary.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Summary Admin',
    }),
  });
  if (res.status !== 201 || !res.body) {
    throw new Error(`register failed: ${res.status}`);
  }
  return res.body;
}

interface SummaryRow {
  kpiId: string;
  name: string;
  scope: string;
  unit: string | null;
  targetValue: number | null;
  latestValue: number | null;
  latestRecordedAt: string | null;
  aggregatedValue: number | null;
  pointCount: number;
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn('[skip] api not reachable — dashboard-summary skipped');
  }
});

describe('GET /kpis/dashboard-summary', () => {
  test('admin sees ORG_WIDE KPI with latest + aggregated values', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);

    // 1. Create 2 ORG_WIDE KPIs and 1 PER_USER KPI
    const orgWideA = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `Revenue ${stamp}`,
        scope: 'ORG_WIDE',
        type: 'CURRENCY',
        unit: 'USD',
        targetValue: 100000,
        aggregationMethod: 'SUM',
      }),
    });
    const orgWideB = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({
        name: `Conversion ${stamp}`,
        scope: 'ORG_WIDE',
        type: 'PERCENTAGE',
        aggregationMethod: 'AVG',
      }),
    });

    // 2. Record some data points
    for (const value of [10000, 20000, 30000]) {
      await http(`/kpis/${orgWideA.body!.id}/data`, {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({
          value,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
        }),
      });
    }
    for (const value of [2.5, 3.5, 4.5]) {
      await http(`/kpis/${orgWideB.body!.id}/data`, {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({
          value,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
        }),
      });
    }

    // 3. Fetch the dashboard summary
    const res = await http<SummaryRow[]>('/kpis/dashboard-summary', {
      token: admin.accessToken,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const rev = res.body!.find((r) => r.kpiId === orgWideA.body!.id);
    expect(rev).toBeDefined();
    expect(rev!.pointCount).toBe(3);
    expect(rev!.latestValue).toBe(30000); // most recent (last inserted)
    expect(rev!.targetValue).toBe(100000);
    // KPI created with aggregationMethod='SUM' → 10000+20000+30000 = 60000
    expect(rev!.aggregatedValue).toBe(60000);

    const conv = res.body!.find((r) => r.kpiId === orgWideB.body!.id);
    expect(conv).toBeDefined();
    expect(conv!.pointCount).toBe(3);
    expect(conv!.latestValue).toBe(4.5);
  });

  test('cross-tenant: tenant B sees zero summary rows for tenant A KPIs', async () => {
    if (!apiAvailable) return;
    const adminA = await registerOrg(suffix());
    const adminB = await registerOrg(suffix());

    // A creates a KPI + records data
    const k = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: adminA.accessToken,
      body: JSON.stringify({ name: `Secret ${suffix()}`, scope: 'ORG_WIDE' }),
    });
    await http(`/kpis/${k.body!.id}/data`, {
      method: 'POST',
      token: adminA.accessToken,
      body: JSON.stringify({
        value: 1,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      }),
    });

    // B's summary is empty
    const res = await http<SummaryRow[]>('/kpis/dashboard-summary', {
      token: adminB.accessToken,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('window narrows the aggregated value', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);
    const k = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: admin.accessToken,
      body: JSON.stringify({ name: `WindowedKpi ${stamp}`, scope: 'ORG_WIDE' }),
    });

    // 3 points across 3 different months
    for (const [v, ps, pe] of [
      [10, '2026-01-01', '2026-01-31'],
      [20, '2026-02-01', '2026-02-28'],
      [30, '2026-03-01', '2026-03-31'],
    ]) {
      await http(`/kpis/${k.body!.id}/data`, {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({
          value: v,
          periodStart: ps,
          periodEnd: pe,
        }),
      });
    }

    // Full window: pointCount = 3
    const all = await http<SummaryRow[]>('/kpis/dashboard-summary', {
      token: admin.accessToken,
    });
    const allRow = all.body!.find((r) => r.kpiId === k.body!.id);
    expect(allRow?.pointCount).toBe(3);

    // Feb window only: pointCount = 1
    const feb = await http<SummaryRow[]>(
      '/kpis/dashboard-summary?from=2026-02-01&to=2026-02-28',
      { token: admin.accessToken },
    );
    const febRow = feb.body!.find((r) => r.kpiId === k.body!.id);
    expect(febRow?.pointCount).toBe(1);
    expect(febRow?.latestValue).toBe(20);
  });

  test('smoke perf: 20 KPIs × 30 data points each → response under 500ms cold', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const admin = await registerOrg(stamp);

    // Seed 20 KPIs each with 30 data points (600 rows total)
    const kpiIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const k = await http<{ id: string }>('/kpis', {
        method: 'POST',
        token: admin.accessToken,
        body: JSON.stringify({ name: `Seed-${stamp}-${i}`, scope: 'ORG_WIDE' }),
      });
      kpiIds.push(k.body!.id);
    }
    // Parallelize data-point inserts
    await Promise.all(
      kpiIds.flatMap((kpiId, i) =>
        Array.from({ length: 30 }, (_, j) =>
          http(`/kpis/${kpiId}/data`, {
            method: 'POST',
            token: admin.accessToken,
            body: JSON.stringify({
              value: i * 100 + j,
              periodStart: `2026-${String((j % 12) + 1).padStart(2, '0')}-01`,
              periodEnd: `2026-${String((j % 12) + 1).padStart(2, '0')}-28`,
            }),
          }),
        ),
      ),
    );

    // Measure the dashboard summary
    const t0 = Date.now();
    const res = await http<SummaryRow[]>('/kpis/dashboard-summary', {
      token: admin.accessToken,
    });
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(res.body!.length).toBe(20);
    // The real <100ms p95 target lives in P3 with proper benching; here we
    // just verify the endpoint isn't pathologically slow at small scale.
    expect(elapsed).toBeLessThan(500);
    console.info(`[bench] dashboard-summary @ 20 KPIs × 30 pts = ${elapsed}ms`);
  });
});
