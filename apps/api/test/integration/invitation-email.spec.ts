/**
 * Invitations are emailed (audit BE-008) — live api + Mailhog.
 *
 * `POST /users` used to create the INVITED user and only return / log the
 * accept link in non-production; nothing was ever sent, so production invitees
 * had no way to join. The accept link must now arrive by email.
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const MAILHOG_URL = process.env.MAILHOG_URL ?? 'http://127.0.0.1:8025';

async function up(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function call(path: string, body: unknown, token?: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

async function waitForMail(to: string, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const data = (await (await fetch(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(to)}`)).json()) as {
      items: Array<{ Content: { Headers: { Subject?: string[] }; Body: string } }>;
    };
    const m = data.items[0];
    if (m) return { subject: m.Content.Headers.Subject?.[0] ?? '', body: m.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=') };
    await new Promise((r) => setTimeout(r, 500));
  }
  return undefined;
}

const ready = (await up(`${API_URL}/health`)) && (await up(`${MAILHOG_URL}/api/v2/messages?limit=1`));
if (!ready) console.warn('[skip] api or mailhog not reachable — invitation email tests skipped');

describe.skipIf(!ready)('Invitations are emailed (BE-008)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orgName = `Invite Mail ${stamp}`;
  const invitee = `invitee-${stamp}@int.test.local`;
  let adminToken: string;
  let mail: { subject: string; body: string } | undefined;

  beforeAll(async () => {
    const reg = await call('/auth/register', {
      orgName,
      slug: `invite-mail-${stamp}`,
      adminEmail: `admin-${stamp}@int.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Inviting Admin',
    });
    if (reg.status !== 201) throw new Error(`register failed (${reg.status})`);
    adminToken = reg.body.accessToken as string;
  });

  test('inviting a user emails them an accept link naming the org', async () => {
    const res = await call('/users', { email: invitee, fullName: 'Invited Person' }, adminToken);
    expect(res.status).toBe(201);
    mail = await waitForMail(invitee);
    expect(mail, 'invitation email should arrive in Mailhog').toBeDefined();
    expect(mail!.subject).toContain(orgName);
    expect(mail!.body).toMatch(/\/accept-invitation\?token=[A-Za-z0-9_-]+/);
  });

  test('the emailed token accepts the invitation and the invitee can sign in', async () => {
    const token = mail?.body.match(/\/accept-invitation\?token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeDefined();
    expect((await call('/auth/accept-invitation', { token, password: 'Invitee-Passw0rd!' })).status).toBe(200);
    expect((await call('/auth/login', { email: invitee, password: 'Invitee-Passw0rd!' })).status).toBe(200);
  });
});
