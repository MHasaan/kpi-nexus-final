/**
 * Password reset end-to-end (audit BE-007) — live api + Mailhog.
 *
 * The reset link used to be written to the API log (token included) and never
 * emailed. Now `request-reset` emails a link to the web app's /reset-password
 * page; the token in that email completes the reset.
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const MAILHOG_URL = process.env.MAILHOG_URL ?? 'http://127.0.0.1:8025';

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

/** Polls Mailhog for the newest message to `to`; returns its decoded body. */
async function waitForMail(to: string, timeoutMs = 15_000): Promise<{ subject: string; body: string } | undefined> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const res = await fetch(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(to)}`);
    const data = (await res.json()) as { items: Array<{ Content: { Headers: { Subject?: string[] }; Body: string } }> };
    const m = data.items[0];
    if (m) {
      const body = m.Content.Body.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
      return { subject: m.Content.Headers.Subject?.[0] ?? '', body };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return undefined;
}

const ready = (await up(`${API_URL}/health`)) && (await up(`${MAILHOG_URL}/api/v2/messages?limit=1`));
if (!ready) console.warn('[skip] api or mailhog not reachable — password reset tests skipped');

describe.skipIf(!ready)('Password reset emails a working link (BE-007)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `reset-${stamp}@int.test.local`;
  const oldPassword = 'correct-horse-battery-staple';
  const newPassword = 'Brand-New-Passw0rd!';
  let token: string | undefined;

  beforeAll(async () => {
    const reg = await post('/auth/register', {
      orgName: `Reset ${stamp}`,
      slug: `reset-${stamp}`,
      adminEmail: email,
      adminPassword: oldPassword,
      adminFullName: 'Reset Admin',
    });
    if (reg.status !== 201) throw new Error(`register failed (${reg.status})`);
  });

  test('request-reset emails a /reset-password link with a token', async () => {
    const res = await post('/auth/password/request-reset', { email });
    expect(res.status).toBe(202);
    const mail = await waitForMail(email);
    expect(mail, 'reset email should arrive in Mailhog').toBeDefined();
    expect(mail!.subject).toMatch(/reset/i);
    token = mail!.body.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token, 'email should contain a /reset-password?token=… link').toBeDefined();
  });

  test('the emailed token completes the reset; new password logs in, old one does not', async () => {
    expect(token).toBeDefined();
    expect((await post('/auth/password/confirm-reset', { token, newPassword })).status).toBe(200);
    expect((await post('/auth/login', { email, password: newPassword })).status).toBe(200);
    expect((await post('/auth/login', { email, password: oldPassword })).status).toBe(401);
  });

  test('the token is single-use', async () => {
    expect((await post('/auth/password/confirm-reset', { token, newPassword: 'Another-Passw0rd!' })).status).toBe(400);
  });

  test('unknown email: same 202, and no email is sent', async () => {
    const ghost = `nobody-${stamp}@int.test.local`;
    expect((await post('/auth/password/request-reset', { email: ghost })).status).toBe(202);
    expect(await waitForMail(ghost, 2_000)).toBeUndefined();
  });
});
