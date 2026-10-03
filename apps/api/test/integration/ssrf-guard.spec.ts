/**
 * SSRF guard at create time (audit BE-016) — live api.
 *
 * Tenant-supplied target URLs (outbound webhooks, notification channels,
 * REST/GraphQL connectors) must be rejected with 400 when they point at
 * internal addresses; public URLs are accepted. Delivery-time checks are
 * covered by src/outbound/outbound-fetch.spec.ts.
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

async function up() {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function call(method: string, path: string, body: unknown, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

const INTERNAL = ['http://127.0.0.1:9000/hook', 'http://169.254.169.254/latest/meta-data/', 'http://localhost:6379/', 'http://10.0.0.8/x', 'file:///etc/passwd'];
const PUBLIC = 'https://93.184.216.34/hook';

const apiUp = await up();
if (!apiUp) console.warn('[skip] api not reachable — SSRF guard tests skipped');

describe.skipIf(!apiUp)('Outbound URLs are validated at create time (BE-016)', () => {
  let token: string;
  let kpiId: string;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reg = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgName: `SSRF ${stamp}`, slug: `ssrf-${stamp}`, adminEmail: `ssrf-${stamp}@int.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'SSRF Admin' }),
    });
    token = ((await reg.json()) as { accessToken: string }).accessToken;
    kpiId = (await call('POST', '/kpis', { name: `SSRF KPI ${stamp}` }, token)).body.id as string;
  });

  test.each(INTERNAL)('webhook → %s is rejected with 400', async (url) => {
    const res = await call('POST', '/webhooks', { name: 'Hook', url, events: ['alert.created'] }, token);
    expect(res.status).toBe(400);
  });

  test.each(INTERNAL)('WEBHOOK channel → %s is rejected with 400', async (url) => {
    const res = await call('POST', '/notification-channels', { name: 'Chan', kind: 'WEBHOOK', config: { url } }, token);
    expect(res.status).toBe(400);
  });

  test('SLACK channel webhookUrl pointing inside is rejected with 400', async () => {
    const res = await call('POST', '/notification-channels', { name: 'Slack', kind: 'SLACK', config: { webhookUrl: 'http://127.0.0.1:8000/' } }, token);
    expect(res.status).toBe(400);
  });

  test.each(INTERNAL)('REST connector → %s is rejected with 400', async (url) => {
    const res = await call('POST', '/connectors', { name: 'Conn', type: 'REST', config: { url, valuePath: 'v', kpiId } }, token);
    expect(res.status).toBe(400);
  });

  test('public URLs are still accepted everywhere', async () => {
    expect((await call('POST', '/webhooks', { name: 'Hook', url: PUBLIC, events: ['alert.created'] }, token)).status).toBe(201);
    expect((await call('POST', '/notification-channels', { name: 'Chan', kind: 'WEBHOOK', config: { url: PUBLIC } }, token)).status).toBe(201);
    const conn = await call('POST', '/connectors', { name: 'Conn', type: 'REST', config: { url: PUBLIC, valuePath: 'v', kpiId } }, token);
    expect(conn.status).toBe(201);
    // …and can't be switched to an internal URL afterwards.
    const upd = await call('PATCH', `/connectors/${conn.body.id as string}`, { config: { url: 'http://127.0.0.1:5432/', valuePath: 'v', kpiId } }, token);
    expect(upd.status).toBe(400);
  });
});
