/**
 * MFA integration test — P1 exit criterion (spec §3.2).
 *
 * Drives the full TOTP lifecycle against the live api:
 *   1. Register org → admin token
 *   2. POST /mfa/enroll → secret + recovery codes
 *   3. POST /mfa/confirm with a current TOTP code → mfaEnabled=true
 *   4. Login without mfaCode → 401 MFA_REQUIRED
 *   5. Login with wrong mfaCode → 401 UNAUTHENTICATED
 *   6. Login with a fresh mfaCode → 200 + fresh tokens
 *   7. Login with a recovery code → 200 + code is consumed
 *   8. Same recovery code again → 401 (single-use)
 *   9. POST /mfa/disable with a current TOTP → mfaEnabled=false
 *  10. Login without mfaCode → 200
 *
 * Uses apps/api/src/mfa/totp.ts to mint codes against the issued secret
 * so the test controls timing and doesn't need to read the api log.
 */
import { beforeAll, describe, expect, test } from 'vitest';

import { generateTotp } from '../../src/mfa/totp.js';

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
    // 204
  }
  return { status: res.status, body };
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable at ${API_URL} — MFA flow skipped`);
  }
});

describe('MFA TOTP lifecycle (spec §3.2 + §5.7)', () => {
  test('enroll → confirm → login-gated → recovery-code → disable', async () => {
    if (!apiAvailable) return;

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const adminEmail = `${stamp}@mfa.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    // 1. Register org
    const reg = await http<{ accessToken: string; user: { id: string; email: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          orgName: `mfa-org-${stamp}`,
          slug: `mfa-org-${stamp}`,
          adminEmail,
          adminPassword,
          adminFullName: 'MFA Admin',
        }),
      },
    );
    expect(reg.status).toBe(201);
    expect(reg.body?.accessToken).toBeTruthy();
    const token = reg.body!.accessToken;

    // 2. Enroll — get secret + recovery codes
    const enroll = await http<{
      secret: string;
      otpauthUrl: string;
      recoveryCodes: string[];
    }>('/mfa/enroll', { method: 'POST', token });
    expect(enroll.status).toBe(200);
    expect(enroll.body?.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enroll.body?.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(enroll.body?.recoveryCodes).toHaveLength(10);
    const { secret, recoveryCodes } = enroll.body!;

    // 3. Confirm with a current TOTP code
    const confirmCode = generateTotp(secret);
    const confirm = await http('/mfa/confirm', {
      method: 'POST',
      token,
      body: JSON.stringify({ code: confirmCode, recoveryCodes }),
    });
    expect(confirm.status).toBe(204);

    // 4. Login without mfaCode → MFA_REQUIRED
    const noCode = await http<{ code: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect(noCode.status).toBe(401);
    expect(noCode.body?.code).toBe('MFA_REQUIRED');

    // 5. Login with wrong mfaCode → 401 UNAUTHENTICATED
    const wrongCode = await http<{ code: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        mfaCode: '000000',
      }),
    });
    expect(wrongCode.status).toBe(401);
    expect(wrongCode.body?.code).toBe('UNAUTHENTICATED');

    // 6. Login with a fresh mfaCode → 200
    const freshCode = generateTotp(secret);
    const goodLogin = await http<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        mfaCode: freshCode,
      }),
    });
    expect(goodLogin.status).toBe(200);
    expect(goodLogin.body?.accessToken).toBeTruthy();

    // 7. Login with a recovery code → 200 + code consumed
    const recoveryCode = recoveryCodes[0]!;
    const recoveryLogin = await http<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        mfaCode: recoveryCode,
      }),
    });
    expect(recoveryLogin.status).toBe(200);

    // 8. Same recovery code again → 401 (single-use)
    const replayRecovery = await http('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        mfaCode: recoveryCode,
      }),
    });
    expect(replayRecovery.status).toBe(401);

    // 9. Disable MFA — use a fresh TOTP code
    const disableCode = generateTotp(secret);
    const disable = await http('/mfa/disable', {
      method: 'POST',
      token: goodLogin.body!.accessToken,
      body: JSON.stringify({ code: disableCode }),
    });
    expect(disable.status).toBe(204);

    // 10. Login without mfaCode is now allowed again
    const postDisable = await http<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect(postDisable.status).toBe(200);
    expect(postDisable.body?.accessToken).toBeTruthy();
  });

  test('cannot enroll when MFA is already active', async () => {
    if (!apiAvailable) return;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reg = await http<{ accessToken: string; recoveryCodes?: never }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          orgName: `mfa-dup-${stamp}`,
          slug: `mfa-dup-${stamp}`,
          adminEmail: `${stamp}@mfa-dup.test.local`,
          adminPassword: 'correct-horse-battery-staple',
          adminFullName: 'Dup Admin',
        }),
      },
    );
    const token = reg.body!.accessToken;

    const enroll1 = await http<{ secret: string; recoveryCodes: string[] }>(
      '/mfa/enroll',
      { method: 'POST', token },
    );
    expect(enroll1.status).toBe(200);
    await http('/mfa/confirm', {
      method: 'POST',
      token,
      body: JSON.stringify({
        code: generateTotp(enroll1.body!.secret),
        recoveryCodes: enroll1.body!.recoveryCodes,
      }),
    });

    const enroll2 = await http('/mfa/enroll', { method: 'POST', token });
    expect(enroll2.status).toBe(400);
  });

  test('confirm with wrong TOTP → 401, MFA still not enabled', async () => {
    if (!apiAvailable) return;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const adminEmail = `${stamp}@mfa-bad.test.local`;
    const reg = await http<{ accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        orgName: `mfa-bad-${stamp}`,
        slug: `mfa-bad-${stamp}`,
        adminEmail,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Bad Admin',
      }),
    });
    const token = reg.body!.accessToken;

    await http('/mfa/enroll', { method: 'POST', token });
    const confirmBad = await http('/mfa/confirm', {
      method: 'POST',
      token,
      body: JSON.stringify({ code: '000000', recoveryCodes: ['REC1', 'REC2'] }),
    });
    expect(confirmBad.status).toBe(401);

    // Login without mfaCode should still succeed (MFA never activated)
    const login = await http('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminEmail, password: 'correct-horse-battery-staple' }),
    });
    expect(login.status).toBe(200);
  });
});
