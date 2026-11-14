/**
 * Scheduled connector runs, live. Connector.schedule used to be stored but
 * never run. Here a connector scheduled every minute is never triggered by
 * hand, yet it runs: within ~70s it has a lastRunAt and a logged run.
 *
 * The target is a public page that isn't JSON (example.com), so the run is
 * logged as FAILED — what matters is that the schedule fired. CI runs this
 * against the API alone and against API + separate worker (RUN_QUEUE_WORKERS=false).
 *
 * Run:
 *   pnpm docker:up && pnpm db:setup
 *   # terminal 1: pnpm --filter @kpi-nexus/api start
 *   # terminal 2: pnpm --filter @kpi-nexus/api test:int -- connector-schedule
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function http<T = unknown>(url: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) headers.set('content-type', 'application/json');
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

interface Connector {
  id: string;
  schedule: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

let token = '';

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await http<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      orgName: `conn-sched-${stamp}`,
      slug: `conn-sched-${stamp}`,
      adminEmail: `admin-${stamp}@conn-sched.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'ConnSchedAdmin',
    }),
  });
  if (res.status !== 201 || !res.body) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  token = res.body.accessToken;
});

const config = { url: 'https://example.com/', valuePath: 'value', kpiId: 'not-a-kpi' };

describe('connector schedules', () => {
  test('a schedule the scheduler cannot run is refused (400), including seconds-level cron', async () => {
    for (const schedule of ['every morning', '* * * * * *']) {
      const res = await http('/connectors', { method: 'POST', token, body: JSON.stringify({ name: 'Bad', type: 'REST', config, schedule }) });
      expect(res.status, schedule).toBe(400);
    }
  });

  test('a connector scheduled every minute runs without a manual trigger', { timeout: 100_000 }, async () => {
    const created = await http<Connector>('/connectors', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'Every minute', type: 'REST', config, schedule: '* * * * *' }),
    });
    expect(created.status).toBe(201);
    const id = created.body!.id;
    expect(created.body!.lastRunAt).toBeNull();

    const deadline = Date.now() + 80_000;
    let latest: Connector | null = null;
    while (Date.now() < deadline) {
      latest = (await http<Connector>(`/connectors/${id}`, { token })).body;
      if (latest?.lastRunAt) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    expect(latest?.lastRunAt, 'the schedule never fired').not.toBeNull();
    expect(latest?.lastRunStatus).toBe('FAILED');

    const runs = await http<Array<{ source: { connectorId?: string } }>>(`/connectors/${id}/runs`, { token });
    expect(runs.body!.some((r) => r.source.connectorId === id)).toBe(true);

    // Clearing the schedule makes it manual-only; deleting removes it.
    const cleared = await http<Connector>(`/connectors/${id}`, { method: 'PATCH', token, body: JSON.stringify({ schedule: null }) });
    expect(cleared.status).toBe(200);
    expect(cleared.body!.schedule).toBeNull();
    expect((await http(`/connectors/${id}`, { method: 'DELETE', token })).status).toBe(204);
  });
});
