/**
 * GDPR offboard + purge (P1 module 8). API-level e2e via Playwright request.
 * Covers offboard (KPI transfer + archive), purge (PII redaction, requires
 * ARCHIVED first), and the self-reparent / not-archived rejections.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — offboard-purge skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Api = import('@playwright/test').APIRequestContext;
interface User { id: string; email: string; fullName: string; status: string }

test('offboard + purge: transfer KPIs, archive, redact PII; reject self-reparent + non-archived purge', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Offboard E2E ${stamp}`,
      slug: `offboard-${stamp}`,
      adminEmail: `admin-${stamp}@offboard.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Offboard Admin',
    },
  })).json()) as { accessToken: string };
  const api: Api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });
  const admin = ((await (await api.get('/auth/me')).json()) as { user: { id: string } }).user;

  // Invite + accept a second user B → ACTIVE.
  const bEmail = `bob-${stamp}@offboard.test.local`;
  const invite = (await (await api.post('/users', { data: { email: bEmail, fullName: 'Bob Builder' } })).json()) as { inviteToken?: string };
  expect(invite.inviteToken).toBeTruthy();
  expect((await anon.post('/auth/accept-invitation', { data: { token: invite.inviteToken, password: 'correct-horse-battery-staple' } })).ok()).toBe(true);

  const users = (await (await api.get('/users')).json()) as User[];
  const bob = users.find((u) => u.email === bEmail)!;
  expect(bob.status).toBe('ACTIVE');

  // KPI owned by Bob.
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Bob KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', ownerUserId: bob.id },
  })).json()) as { id: string };

  // Self-reparent is rejected.
  const selfReparent = await api.post(`/users/${bob.id}/offboard`, { data: { reparentDirectReportsTo: bob.id } });
  expect(selfReparent.status()).toBe(400);

  // Offboard Bob, transferring his KPI to the admin and archiving him.
  const off = await api.post(`/users/${bob.id}/offboard`, { data: { transferKpisTo: admin.id } });
  expect(off.status()).toBe(200);
  const summary = (await off.json()) as { kpisTransferred: number; archived: boolean };
  expect(summary.kpisTransferred).toBe(1);
  expect(summary.archived).toBe(true);

  // The KPI is now owned by the admin.
  const kpiAfter = (await (await api.get(`/kpis/${kpi.id}`)).json()) as { ownerUserId: string | null };
  expect(kpiAfter.ownerUserId).toBe(admin.id);

  // Purging an ACTIVE user (admin) is rejected — must be ARCHIVED first.
  expect((await api.post(`/users/${admin.id}/purge`)).status()).toBe(422);

  // Purge Bob (now ARCHIVED) → PII redacted.
  const purge = await api.post(`/users/${bob.id}/purge`);
  expect(purge.status()).toBe(200);
  expect((await purge.json()).handle).toMatch(/^former-user-[0-9a-f]{12}$/);

  const bobAfter = (await (await api.get(`/users/${bob.id}`)).json()) as User;
  expect(bobAfter.status).toBe('PURGED');
  expect(bobAfter.fullName).toBe('Former User');
});
