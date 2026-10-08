import { describe, expect, it, vi } from 'vitest';

import { AiProviderError } from '../types.js';
import { GeminiProvider } from './gemini.js';

const OK_BODY = {
  candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 },
};

/**
 * A fetch stub whose response depends on which `key=` is in the URL, so we can
 * simulate per-key quota exhaustion. `statusByKey` maps key → HTTP status; any
 * key not listed returns 200.
 */
function keyAwareFetch(statusByKey: Record<string, number>) {
  return vi.fn(async (url: string) => {
    const key = new URL(url).searchParams.get('key') ?? '';
    const status = statusByKey[key] ?? 200;
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      json: async () => OK_BODY,
      text: async () => JSON.stringify(ok ? OK_BODY : { error: `status ${status}` }),
    };
  }) as unknown as typeof fetch;
}

const req = { model: 'gemini-2.5-flash', messages: [{ role: 'user' as const, content: 'hi' }] };
const keysOf = (fetchImpl: typeof fetch): string[] =>
  (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => new URL(c[0] as string).searchParams.get('key')!);

describe('GeminiProvider intra-request key failover', () => {
  it('retries the SAME request with the next key when one returns 429 (quota used up)', async () => {
    const fetchImpl = keyAwareFetch({ k1: 429 }); // k1 exhausted, k2 fine
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    const r = await p.complete(req);
    expect(r.content).toBe('ok'); // succeeded via k2
    const used = keysOf(fetchImpl);
    expect(used[0]).toBe('k1');
    expect(used[1]).toBe('k2'); // failover advanced within the one request
  });

  it('cycles through every key and throws (retryable) only when all are exhausted', async () => {
    const fetchImpl = keyAwareFetch({ k1: 429, k2: 429, k3: 429 });
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2', 'k3'], fetchImpl });
    await expect(p.complete(req)).rejects.toMatchObject({ retryable: true, statusCode: 429 });
    expect(new Set(keysOf(fetchImpl))).toEqual(new Set(['k1', 'k2', 'k3'])); // all tried
  });

  it('rotates past an invalid key (401) to a working one', async () => {
    const fetchImpl = keyAwareFetch({ k1: 401 });
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    const r = await p.complete(req);
    expect(r.content).toBe('ok');
    expect(keysOf(fetchImpl)).toEqual(['k1', 'k2']);
  });

  it('does NOT burn the rest of the pool on a request-level 400 (bad request)', async () => {
    const fetchImpl = keyAwareFetch({ k1: 400, k2: 400, k3: 400 });
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2', 'k3'], fetchImpl });
    await expect(p.complete(req)).rejects.toMatchObject({ retryable: false, statusCode: 400 });
    expect(keysOf(fetchImpl)).toHaveLength(1); // stopped after the first key
  });

  it('parks an exhausted key so the NEXT request skips it', async () => {
    const fetchImpl = keyAwareFetch({ k1: 429 });
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    await p.complete(req); // k1 429 → parked, k2 serves
    (fetchImpl as unknown as ReturnType<typeof vi.fn>).mockClear();
    await p.complete(req); // should go straight to k2 (k1 parked)
    expect(keysOf(fetchImpl)[0]).toBe('k2');
  });

  it('applies the same failover to embeddings', async () => {
    const embedOk = { embeddings: [{ values: [0.1, 0.2] }] };
    const fetchImpl = vi.fn(async (url: string) => {
      const key = new URL(url).searchParams.get('key') ?? '';
      const status = key === 'k1' ? 429 : 200;
      return {
        ok: status === 200,
        status,
        json: async () => embedOk,
        text: async () => '{}',
      };
    }) as unknown as typeof fetch;
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    const vecs = await p.embed({ texts: ['x'], model: 'gemini-text-embedding-004' });
    expect(vecs).toEqual([[0.1, 0.2]]);
    expect(keysOf(fetchImpl)).toEqual(['k1', 'k2']);
  });

  it('still throws non-retryable when there are no keys', async () => {
    const p = new GeminiProvider({ apiKeys: [], fetchImpl: keyAwareFetch({}) });
    await expect(p.complete(req)).rejects.toBeInstanceOf(AiProviderError);
  });
});

// BE-026: some keys answer `404 NOT_FOUND: models/gemini-2.5-flash is no longer
// available to new users` while other keys in the pool still serve it. A 404
// was treated as request-level, so whenever the round-robin landed on such a
// key the whole call failed (~1 in 4 AI requests).
describe('GeminiProvider — model unavailable for one key (404) (BE-026)', () => {
  it('fails over past a key that 404s for the model, to a key that serves it', async () => {
    const fetchImpl = keyAwareFetch({ k1: 404 });
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    const r = await p.complete(req);
    expect(r.content).toBe('ok');
    expect(keysOf(fetchImpl)).toEqual(['k1', 'k2']);
  });

  it('remembers (key, model): later requests for that model skip the key…', async () => {
    const fetchImpl = keyAwareFetch({ k1: 404 });
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    await p.complete(req);
    (fetchImpl as unknown as ReturnType<typeof vi.fn>).mockClear();
    await p.complete(req);
    await p.complete(req);
    expect(keysOf(fetchImpl)).toEqual(['k2', 'k2']);
  });

  it('…but the key is still used for OTHER models', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url);
      const bad = u.searchParams.get('key') === 'k1' && u.pathname.includes('gemini-2.5-flash:');
      return {
        ok: !bad,
        status: bad ? 404 : 200,
        json: async () => OK_BODY,
        text: async () => (bad ? '{"error":"model no longer available"}' : JSON.stringify(OK_BODY)),
      };
    }) as unknown as typeof fetch;
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    await p.complete(req); // k1 404 for flash → k2
    (fetchImpl as unknown as ReturnType<typeof vi.fn>).mockClear();
    await p.complete({ ...req, model: 'gemini-2.5-flash-lite' });
    await p.complete({ ...req, model: 'gemini-2.5-flash-lite' });
    expect(keysOf(fetchImpl)).toContain('k1');
  });

  it('a model no key can serve still fails — after trying each key once — with the provider message', async () => {
    const fetchImpl = keyAwareFetch({ k1: 404, k2: 404 });
    const p = new GeminiProvider({ apiKeys: ['k1', 'k2'], fetchImpl });
    const err = await p.complete(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ statusCode: 404 });
    expect((err as Error).message).toContain('status 404');
    expect(keysOf(fetchImpl)).toHaveLength(2);
  });
});
