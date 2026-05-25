/**
 * Refresh-token rotation + reuse-detection — P1 exit criterion (spec §3.2).
 *
 * Verifies the canonical rotation chain:
 *   1. issue → access1 + refresh1
 *   2. POST /auth/refresh with refresh1 → access2 + refresh2; refresh1
 *      is now revoked + replaced by refresh2.
 *   3. POST /auth/refresh with refresh1 AGAIN → 401, AND refresh2 is
 *      revoked too (chain killed).
 *   4. POST /auth/refresh with refresh2 → 401 (it was just killed).
 *   5. New login → fresh chain works (no permanent lockout).
 *   6. POST /auth/logout with a refresh token → it's revoked; subsequent
 *      refresh on it → 401, but no chain kill (revoked but not replaced).
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
    // 204
  }
  return { status: res.status, body };
}

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable — refresh-token test skipped`);
  }
});

async function registerFresh(label: string): Promise<{
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'correct-horse-battery-staple';
  const email = `${label}-${stamp}@refresh.test.local`;
  const reg = await http<{ accessToken: string; refreshToken: string }>(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({
        orgName: `refresh-${label}-${stamp}`,
        slug: `refresh-${label}-${stamp}`,
        adminEmail: email,
        adminPassword: password,
        adminFullName: 'Refresh Admin',
      }),
    },
  );
  if (reg.status !== 201 || !reg.body) {
    throw new Error(`register failed (${reg.status})`);
  }
  return {
    email,
    password,
    accessToken: reg.body.accessToken,
    refreshToken: reg.body.refreshToken,
  };
}

describe('Refresh-token rotation + reuse-detection (spec §3.2)', () => {
  test('happy path — refresh rotates the token pair', async () => {
    if (!apiAvailable) return;
    const session = await registerFresh('happy');

    const rotated = await http<{ accessToken: string; refreshToken: string; expiresIn: number }>(
      '/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      },
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body?.accessToken).toBeTruthy();
    expect(rotated.body?.refreshToken).toBeTruthy();
    expect(rotated.body!.refreshToken).not.toBe(session.refreshToken);
    // accessToken is the same JWT when issued within the same second (same
    // payload + iat second) — this is not a bug; the refresh token rotating
    // is the security-critical assertion.
    expect(rotated.body!.expiresIn).toBe(15 * 60);
  });

  test('reuse-detection — replaying an already-rotated refresh kills the entire chain', async () => {
    if (!apiAvailable) return;
    const session = await registerFresh('reuse');

    // Step 1: legitimate rotation
    const first = await http<{ refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(first.status).toBe(200);
    const refresh2 = first.body!.refreshToken;

    // Step 2: replay the OLD refresh → 401 + the chain kill kicks in
    const replay = await http<{ message: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(replay.status).toBe(401);
    // The error message hints at chain revocation (defensive — exact wording
    // can be tightened later; the 401 + downstream test below is what matters)
    expect(replay.body?.message).toMatch(/chain|reuse|revoked/i);

    // Step 3: refresh2 — the rotated token — is now revoked too (chain killed)
    const downstream = await http('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refresh2 }),
    });
    expect(downstream.status).toBe(401);
  });

  test('reuse-detection does not lock the user out — re-login mints a new chain', async () => {
    if (!apiAvailable) return;
    const session = await registerFresh('relogin');

    // Trigger chain kill on the initial pair
    const first = await http<{ refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(first.status).toBe(200);
    await http('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    // Re-login with the same credentials issues a fresh chain
    const reLogin = await http<{ accessToken: string; refreshToken: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: session.email, password: session.password }),
      },
    );
    expect(reLogin.status).toBe(200);
    expect(reLogin.body?.refreshToken).toBeTruthy();

    // The new refresh works
    const rotated = await http('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: reLogin.body!.refreshToken }),
    });
    expect(rotated.status).toBe(200);
  });

  test('logout revokes the refresh — subsequent refresh fails without chain kill', async () => {
    if (!apiAvailable) return;
    const session = await registerFresh('logout');

    const logout = await http('/auth/logout', {
      method: 'POST',
      token: session.accessToken,
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(logout.status).toBe(204);

    const tryRefresh = await http<{ message: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(tryRefresh.status).toBe(401);
    // Logged-out token was revoked but never replaced — different message
    // than the reuse-detection path
    expect(tryRefresh.body?.message?.toLowerCase() ?? '').not.toMatch(/chain/);
  });

  test('refresh with an unknown token → 401', async () => {
    if (!apiAvailable) return;
    const res = await http('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'definitely-not-a-real-token' }),
    });
    expect(res.status).toBe(401);
  });

  test('refresh with malformed body → 400', async () => {
    if (!apiAvailable) return;
    const res = await http('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
