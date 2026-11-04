import { afterEach, describe, expect, test, vi } from 'vitest';

// The web suite runs in node env; ./api-client reads the access token from
// localStorage on each call, so stub a window with a token present.
const store: Record<string, string> = { 'kpi-nexus.access-token': 'tok-123' };
const localStorageMock = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => {
    store[key] = value;
  },
  removeItem: (key: string): void => {
    delete store[key];
  },
  clear: (): void => {
    for (const k of Object.keys(store)) delete store[k];
  },
};
vi.stubGlobal('window', { localStorage: localStorageMock });
vi.stubGlobal('localStorage', localStorageMock);

import { listAiConfigs, resetAiFeatureConfig, updateAiFeatureConfig } from './api-client';

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Re-stub window/localStorage for the next test (unstubAllGlobals removed them).
  vi.stubGlobal('window', { localStorage: localStorageMock });
  vi.stubGlobal('localStorage', localStorageMock);
});

describe('AI feature config api-client helpers', () => {
  test('listAiConfigs GETs /ai/configs', async () => {
    const fetchMock = mockFetch([{ feature: 'INSIGHTS', provider: 'GEMINI', model: 'm', isOverride: false }]);
    const rows = await listAiConfigs();
    expect(rows).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/ai/configs');
    // GET — no explicit method passed through the wrapper
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
  });

  test('updateAiFeatureConfig PUTs providerId/model to the feature path', async () => {
    const fetchMock = mockFetch({ feature: 'INSIGHTS', provider: 'CLAUDE', model: 'claude-haiku-4-5', isOverride: true });
    const res = await updateAiFeatureConfig('INSIGHTS', {
      providerId: 'CLAUDE',
      model: 'claude-haiku-4-5',
    });
    expect(res.isOverride).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/ai/configs/INSIGHTS');
    const ri = init as RequestInit;
    expect(ri.method).toBe('PUT');
    expect(JSON.parse(ri.body as string)).toEqual({
      providerId: 'CLAUDE',
      model: 'claude-haiku-4-5',
    });
  });

  test('updateAiFeatureConfig URL-encodes the feature name', async () => {
    const fetchMock = mockFetch({ feature: 'A/B', provider: 'GEMINI', model: 'm', isOverride: true });
    await updateAiFeatureConfig('A/B', { providerId: 'GEMINI', model: 'm' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/ai/configs/A%2FB');
  });

  test('resetAiFeatureConfig DELETEs the feature path', async () => {
    const fetchMock = mockFetch({ reverted: true });
    await resetAiFeatureConfig('INSIGHTS');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/ai/configs/INSIGHTS');
    expect((init as RequestInit).method).toBe('DELETE');
  });
});
