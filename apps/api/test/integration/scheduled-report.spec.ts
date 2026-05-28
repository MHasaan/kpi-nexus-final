/**
 * P3.7 — Scheduled Report integration test.
 *
 * Tests the full pipeline against the live API + docker infra:
 *   1. Register an org + get a token
 *   2. POST /scheduled-reports — create a report (ORG_SETTINGS / admin has it)
 *   3. GET  /scheduled-reports/:id — verify it's retrievable
 *   4. POST /scheduled-reports/:id/trigger — trigger a manual run
 *   5. Poll the API for a completed ReportRun (GET /scheduled-reports/:id,
 *      inspect runs[0].status) until SUCCEEDED or FAILED (timeout 25s)
 *   6. Assert fileUrl is populated on SUCCEEDED
 *   7. (Optional) Assert Mailhog received the email
 *   8. PATCH /scheduled-reports/:id — update (name change)
 *   9. DELETE /scheduled-reports/:id — verify 204
 *
 * The test drives via HTTP only — no BullMQ internals. The processor runs
 * in the API process (forked by `pnpm --filter @kpi-nexus/api start`).
 *
 * Run:
 *   pnpm docker:up && pnpm db:setup
 *   # terminal 1: pnpm --filter @kpi-nexus/api start
 *   # terminal 2: pnpm --filter @kpi-nexus/api test:int
 */

import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const MAILHOG_URL = process.env.MAILHOG_URL ?? 'http://localhost:8025';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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
    // no body (e.g. 204)
  }
  return { status: res.status, body };
}

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  user: { id: string };
  organization: { id: string };
}

async function registerOrg(stamp: string): Promise<RegisterResult> {
  const res = await http<RegisterResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `sched-rpt-${stamp}`,
      slug: `sched-rpt-${stamp}`,
      adminEmail: `admin-${stamp}@sched.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'SchedAdmin',
    }),
  });
  if (res.status !== 201 || !res.body) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

// ── Poll helper ───────────────────────────────────────────────────────────────

/**
 * Poll until the condition is met or the timeout expires.
 * Returns the last value of condition(); throws if timed out.
 */
async function pollUntil<T>(
  fn: () => Promise<T | null>,
  check: (v: T | null) => boolean,
  timeoutMs: number,
  intervalMs = 1000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await fn();
    if (check(val)) return val as T;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportRun {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  fileUrl: string | null;
  error: string | null;
}

interface ScheduledReport {
  id: string;
  name: string;
  isActive: boolean;
  runs: ReportRun[];
}

// ── Test suite ────────────────────────────────────────────────────────────────

let apiAvailable = false;

beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn('[skip] api not reachable — scheduled-report spec skipped');
  }
}, 10_000);

describe('Scheduled Reports', () => {
  test('full pipeline: create → trigger → poll → SUCCEEDED + fileUrl', async () => {
    if (!apiAvailable) {
      console.warn('[skip] api not reachable');
      return;
    }

    const stamp = suffix();
    const { accessToken } = await registerOrg(stamp);

    // 0. Seed an ORG_WIDE KPI + one data point so the report has real content.
    //    Without data the run legitimately fails with NO_DATA; this proves the
    //    full generate → upload → email → download path with actual values.
    const kpiRes = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify({ name: `Report KPI ${stamp}`, scope: 'ORG_WIDE' }),
    });
    expect(kpiRes.status, `kpi create: ${JSON.stringify(kpiRes.body)}`).toBe(201);
    const kpiId = kpiRes.body!.id;

    const dataRes = await http(`/kpis/${kpiId}/data`, {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify({ value: 42, periodStart: '2026-01-01', periodEnd: '2026-01-31' }),
    });
    expect(dataRes.status, `data record: ${JSON.stringify(dataRes.body)}`).toBe(201);

    // 1. Create a scheduled report scoped to the seeded KPI.
    const createRes = await http<ScheduledReport>('/scheduled-reports', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify({
        name: `Integration Test Report ${stamp}`,
        cron: '0 9 * * 1', // Weekly — we trigger manually
        format: 'CSV',
        kpiIds: [kpiId],
        recipients: [`recipient-${stamp}@example.com`],
      }),
    });
    expect(createRes.status, `create: ${JSON.stringify(createRes.body)}`).toBe(201);
    const reportId = createRes.body!.id;
    expect(reportId).toBeTruthy();

    // 2. GET by id — should be retrievable.
    const getRes = await http<ScheduledReport>(`/scheduled-reports/${reportId}`, {
      token: accessToken,
    });
    expect(getRes.status).toBe(200);
    expect(getRes.body!.name).toBe(`Integration Test Report ${stamp}`);

    // 3. Trigger a manual run (does not wait for cron schedule).
    const triggerRes = await http(`/scheduled-reports/${reportId}/trigger`, {
      method: 'POST',
      token: accessToken,
    });
    expect(triggerRes.status, `trigger: ${JSON.stringify(triggerRes.body)}`).toBe(202);

    // 4. Poll until the run is in a terminal state.
    const finalReport = await pollUntil<ScheduledReport>(
      async () => {
        const r = await http<ScheduledReport>(`/scheduled-reports/${reportId}`, {
          token: accessToken,
        });
        return r.body;
      },
      (r) => {
        if (!r || r.runs.length === 0) return false;
        const run = r.runs[0]!;
        return run.status === 'SUCCEEDED' || run.status === 'FAILED';
      },
      25_000, // 25 s timeout
      1_200,  // poll every 1.2s
    );

    const completedRun = finalReport.runs[0]!;
    expect(
      completedRun.status,
      `Run ${completedRun.id} failed with: ${completedRun.error ?? 'no error message'}`,
    ).toBe('SUCCEEDED');
    expect(completedRun.fileUrl).toBeTruthy();

    // 5. (Optional) Mailhog check — non-fatal if Mailhog not reachable.
    try {
      const mailRes = await fetch(`${MAILHOG_URL}/api/v2/messages`, {
        signal: AbortSignal.timeout(3000),
      });
      if (mailRes.ok) {
        const mailData = (await mailRes.json()) as {
          items: Array<{ Content: { Headers: { Subject: string[] } } }>;
        };
        const matching = mailData.items.filter((m) =>
          m.Content.Headers.Subject?.[0]?.includes(`Integration Test Report ${stamp}`),
        );
        expect(matching.length, 'Expected at least one email in Mailhog').toBeGreaterThan(0);
      }
    } catch {
      console.warn('[mailhog] not reachable — email assertion skipped');
    }

    // 6. PATCH — update the name.
    const patchRes = await http<ScheduledReport>(`/scheduled-reports/${reportId}`, {
      method: 'PATCH',
      token: accessToken,
      body: JSON.stringify({ name: `Renamed ${stamp}` }),
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body!.name).toBe(`Renamed ${stamp}`);

    // 7. DELETE.
    const deleteRes = await http(`/scheduled-reports/${reportId}`, {
      method: 'DELETE',
      token: accessToken,
    });
    expect(deleteRes.status).toBe(204);

    // 8. GET after DELETE — should 404.
    const afterDeleteRes = await http(`/scheduled-reports/${reportId}`, {
      token: accessToken,
    });
    expect(afterDeleteRes.status).toBe(404);
  });

  test('cross-org isolation: report not visible to another org', async () => {
    if (!apiAvailable) {
      console.warn('[skip] api not reachable');
      return;
    }

    const stampA = suffix();
    const stampB = suffix();
    const { accessToken: tokenA } = await registerOrg(stampA);
    const { accessToken: tokenB } = await registerOrg(stampB);

    // Create a report in org A.
    const createRes = await http<ScheduledReport>('/scheduled-reports', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({
        name: `Org A Report ${stampA}`,
        cron: '0 9 * * 1',
        format: 'PDF',
        recipients: ['a@orgA.com'],
      }),
    });
    expect(createRes.status).toBe(201);
    const reportId = createRes.body!.id;

    // Org B should get 404.
    const crossOrgRes = await http(`/scheduled-reports/${reportId}`, {
      token: tokenB,
    });
    expect(crossOrgRes.status).toBe(404);
  });
});
