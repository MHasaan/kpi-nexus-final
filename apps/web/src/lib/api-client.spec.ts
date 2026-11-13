/**
 * Access-token refresh in the api() wrapper. Access tokens live 15 minutes; the
 * web app used to keep the refresh token but never call POST /auth/refresh, so
 * signed-in users were sent to /login every 15 minutes.
 * Runs in the vitest `node` environment — localStorage and fetch are mocked.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => { store[key] = value; },
  removeItem: (key: string): void => { delete store[key]; },
  clear: (): void => { for (const k of Object.keys(store)) delete store[k]; },
};
vi.stubGlobal('window', { localStorage: localStorageMock });
vi.stubGlobal('localStorage', localStorageMock);

import { ApiError, api, getAccessToken, getRefreshToken, setTokens, subscribeRealtime } from './api-client';

type Call = { url: string; auth: string | null; body: unknown };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fake API: GET /kpis needs `Bearer valid-<n>`; POST /auth/refresh rotates. */
function fakeApi(opts: { refreshOk?: boolean; refreshDelayMs?: number } = {}) {
  const calls: Call[] = [];
  let generation = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, auth: headers.get('authorization'), body });
    if (url.endsWith('/auth/refresh')) {
      if (opts.refreshDelayMs) await new Promise((r) => setTimeout(r, opts.refreshDelayMs));
      if (opts.refreshOk === false) return json(401, { code: 'UNAUTHORIZED', message: 'Refresh token revoked' });
      generation += 1;
      return json(200, { accessToken: `valid-${generation}`, refreshToken: `refresh-${generation}`, expiresIn: 900 });
    }
    const auth = headers.get('authorization') ?? '';
    if (generation > 0 && auth === `Bearer valid-${generation}`) return json(200, [{ id: 'k1' }]);
    return json(401, { code: 'UNAUTHORIZED', message: 'Token expired' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  localStorageMock.clear();
  setTokens('expired', 'refresh-0');
});

describe('api() — access-token refresh', () => {
  test('a 401 refreshes once, stores the new pair and retries the request', async () => {
    const { calls } = fakeApi();
    await expect(api('/kpis')).resolves.toEqual([{ id: 'k1' }]);
    expect(calls.map((c) => c.url.replace(/^https?:\/\/[^/]+/, ''))).toEqual(['/kpis', '/auth/refresh', '/kpis']);
    expect(calls[1]!.body).toEqual({ refreshToken: 'refresh-0' });
    expect(calls[2]!.auth).toBe('Bearer valid-1');
    expect(getAccessToken()).toBe('valid-1');
    expect(getRefreshToken()).toBe('refresh-1');
  });

  test('concurrent 401s share ONE refresh (refresh tokens rotate; reuse would revoke the session)', async () => {
    const { calls } = fakeApi({ refreshDelayMs: 20 });
    const results = await Promise.all([api('/kpis'), api('/kpis'), api('/kpis')]);
    expect(results).toEqual([[{ id: 'k1' }], [{ id: 'k1' }], [{ id: 'k1' }]]);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  test('a failed refresh clears the session and surfaces the original 401', async () => {
    fakeApi({ refreshOk: false });
    const err = await api('/kpis').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  test('no refresh without a refresh token, and never for unauthenticated calls', async () => {
    const { calls } = fakeApi();
    localStorageMock.removeItem('kpi-nexus.refresh-token');
    await expect(api('/kpis')).rejects.toMatchObject({ status: 401 });
    setTokens('expired', 'refresh-0');
    await expect(api('/kpis', { auth: false })).rejects.toMatchObject({ status: 401 });
    expect(calls.some((c) => c.url.endsWith('/auth/refresh'))).toBe(false);
  });

  test('a token another tab already refreshed is used without refreshing again', async () => {
    const seen: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/refresh')) return json(500, {});
        const auth = new Headers(init?.headers).get('authorization');
        seen.push(auth);
        if (auth === 'Bearer from-other-tab') return json(200, [{ id: 'k1' }]);
        // While this request (sent with the expired token) was in flight,
        // another tab refreshed and stored a newer pair.
        setTokens('from-other-tab', 'refresh-other');
        return json(401, { code: 'UNAUTHORIZED', message: 'Token expired' });
      }),
    );
    await expect(api('/kpis')).resolves.toEqual([{ id: 'k1' }]);
    expect(seen).toEqual(['Bearer expired', 'Bearer from-other-tab']);
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).endsWith('/auth/refresh'))).toBe(false);
    expect(getRefreshToken()).toBe('refresh-other');
  });

  test('the retried request is not refreshed again if it still gets a 401', async () => {
    fakeApi();
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith('/auth/refresh')
        ? json(200, { accessToken: 'valid-x', refreshToken: 'refresh-x', expiresIn: 900 })
        : json(401, { code: 'UNAUTHORIZED', message: 'nope' }),
    );
    await expect(api('/kpis')).rejects.toMatchObject({ status: 401 });
    expect(vi.mocked(fetch).mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
  });
});

describe('subscribeRealtime — reconnects after refreshing an expired token', () => {
  test('a 401 on connect refreshes once and reconnects with the new token', async () => {
    const auths: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/refresh')) {
          return json(200, { accessToken: 'fresh', refreshToken: 'refresh-1', expiresIn: 900 });
        }
        const auth = new Headers(init?.headers).get('authorization');
        auths.push(auth);
        if (auth !== 'Bearer fresh') return json(401, { code: 'UNAUTHORIZED', message: 'Token expired' });
        return new Response('event: kpi.updated\ndata: {"id":"k1"}\n\n', { status: 200 });
      }),
    );
    const events: unknown[] = [];
    const stop = subscribeRealtime({}, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    stop();
    expect(auths).toEqual(['Bearer expired', 'Bearer fresh']);
    expect(events[0]).toEqual({ type: 'kpi.updated', payload: { id: 'k1' } });
  });
});
