/**
 * P8 Integrations & Extensibility — API-level e2e (Playwright request). Covers
 * the hermetic exit criteria against the running api:
 *   1. API key scope enforcement — KPI_DATA_ENTRY key can POST /ingest but is
 *      403 on POST /kpis
 *   2. Inbound email → comment on the addressed KPI
 *   3. Connector create + manual run pipeline (logs an IngestionJob)
 *   4. Plugin install + enable/disable
 * (Slack/Jira live OAuth round-trips are covered by unit tests + are manual.)
 * Requires the api at $API_URL.
 */
import { type APIRequestContext, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — p8-integrations skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminCtx(): Promise<{ ctx: APIRequestContext; stamp: string }> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = await anon.post('/auth/register', {
    data: {
      orgName: `P8 ${stamp}`,
      slug: `p8-${stamp}`,
      adminEmail: `admin-${stamp}@p8.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'P8 Admin',
    },
  });
  expect(reg.status()).toBe(201);
  const { accessToken } = (await reg.json()) as { accessToken: string };
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${accessToken}` } });
  return { ctx, stamp };
}

async function createKpi(ctx: APIRequestContext, name: string): Promise<string> {
  const res = await ctx.post('/kpis', {
    data: { name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('API key scope: KPI_DATA_ENTRY can POST /ingest but is 403 on POST /kpis', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx, stamp } = await adminCtx();
  const kpiId = await createKpi(ctx, `Ingest KPI ${stamp}`);

  // Mint an API key scoped to data entry only.
  const mint = await ctx.post('/api-keys', { data: { name: 'ingest-key', scopes: ['KPI_DATA_ENTRY'] } });
  expect(mint.status()).toBe(201);
  const minted = (await mint.json()) as { secret?: string; plaintext?: string; key?: string };
  const secret = minted.secret ?? minted.plaintext ?? minted.key;
  expect(secret).toBeTruthy();

  const keyCtx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${secret}` } });

  // Allowed: POST /ingest.
  const ingest = await keyCtx.post('/ingest', {
    data: { source: 'e2e', rows: [{ kpiId, value: 42 }, { kpiId, value: 43 }] },
  });
  expect(ingest.status()).toBe(200);
  expect(((await ingest.json()) as { status: string }).status).toBe('SUCCEEDED');

  // Forbidden: POST /kpis (needs KPI_CREATE, not granted).
  const forbidden = await keyCtx.post('/kpis', {
    data: { name: 'should fail', scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST' },
  });
  expect(forbidden.status()).toBe(403);
});

test('inbound email → comment on the addressed KPI', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx, stamp } = await adminCtx();
  const kpiId = await createKpi(ctx, `Email KPI ${stamp}`);
  const adminEmail = `admin-${stamp}@p8.test.local`;

  // Public webhook (dev: no EMAIL_INBOUND_SECRET → passthrough).
  const anon = await request.newContext({ baseURL: API_URL });
  const res = await anon.post('/webhooks/inbound/email', {
    data: { to: `inbound+kpi-${kpiId}@mail.host`, from: adminEmail, subject: 'note', text: 'Looks off this month\n> quoted' },
  });
  expect(res.status()).toBe(200);

  const comments = (await (await ctx.get(`/comments?entityType=kpi&entityId=${kpiId}`)).json()) as Array<{ body: string }>;
  expect(comments.some((c) => c.body === 'Looks off this month')).toBe(true);
});

test('connector: create + manual run logs an IngestionJob', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx, stamp } = await adminCtx();
  const kpiId = await createKpi(ctx, `Connector KPI ${stamp}`);

  const created = await ctx.post('/connectors', {
    data: { name: 'GH stars', type: 'REST', config: { url: 'https://api.github.com/repos/nodejs/node', valuePath: 'stargazers_count', kpiId } },
  });
  expect(created.status()).toBe(201);
  const connector = (await created.json()) as { id: string };

  // Run now — status depends on network, but the run pipeline must log a job
  // and stamp lastRunStatus regardless of the external fetch outcome.
  const run = await ctx.post(`/connectors/${connector.id}/run`);
  expect(run.status()).toBe(200);
  expect(['SUCCEEDED', 'PARTIAL', 'FAILED']).toContain(((await run.json()) as { status: string }).status);

  const runs = (await (await ctx.get(`/connectors/${connector.id}/runs`)).json()) as unknown[];
  expect(runs.length).toBeGreaterThanOrEqual(1);
});

test('plugin: install → list → disable → uninstall', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const { ctx } = await adminCtx();

  const install = await ctx.post('/plugins', {
    data: { name: 'Burndown widget', type: 'WIDGET', version: '1.0.0', entryUrl: 'https://cdn.test/burndown.html' },
  });
  expect(install.status()).toBe(201);
  const plugin = (await install.json()) as { id: string; isEnabled: boolean };
  expect(plugin.isEnabled).toBe(true);

  const list = (await (await ctx.get('/plugins')).json()) as Array<{ id: string }>;
  expect(list.some((p) => p.id === plugin.id)).toBe(true);

  const disabled = await ctx.patch(`/plugins/${plugin.id}`, { data: { isEnabled: false } });
  expect(((await disabled.json()) as { isEnabled: boolean }).isEnabled).toBe(false);

  expect((await ctx.delete(`/plugins/${plugin.id}`)).status()).toBe(204);
});
