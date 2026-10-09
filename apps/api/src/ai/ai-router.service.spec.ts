import { Logger } from '@nestjs/common';
import { AiProviderError, AiProviderNotConfiguredError, type IAiProvider } from '@kpi-nexus/ai';
import type { AiProviderKey } from '@kpi-nexus/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AiBudgetExceededError, AiProviderUnavailableError } from './ai-errors.js';
import { AiRouterService, type RouterDeps } from './ai-router.service.js';

/** Minimal provider stub that returns a fixed completion or throws. */
function stubProvider(key: AiProviderKey, impl: Partial<IAiProvider> = {}): IAiProvider {
  return {
    key,
    complete: vi.fn(async () => ({
      content: `${key} says hi`,
      finishReason: 'stop' as const,
      usage: { inputTokens: 10, outputTokens: 5 },
      actualCost: key === 'GEMINI' ? 0 : 0.02,
    })),
    completeWithTools: vi.fn(async () => ({
      content: '',
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1 },
      actualCost: 0,
    })),
    stream: async function* () {},
    embed: vi.fn(async () => [[0.1]]),
    capabilities: () => ({ tools: true, streaming: true, embeddings: true, promptCaching: false }),
    ping: async () => ({ ok: true, latencyMs: 1 }),
    ...impl,
  } as IAiProvider;
}

function makeDeps(overrides: Partial<RouterDeps> = {}): { deps: RouterDeps; log: unknown[]; debited: number[] } {
  const log: unknown[] = [];
  const debited: number[] = [];
  const deps: RouterDeps = {
    registry: {
      getProvider: (k) => stubProvider(k),
    },
    budget: {
      evaluate: async () => ({ allowed: true, mode: 'FAIL_CLOSED' }),
      debit: async (c) => {
        debited.push(c);
      },
    },
    callLog: {
      record: async (e) => {
        log.push(e);
      },
    },
    resolveConfig: async () => ({
      provider: 'GEMINI',
      model: 'gemini-2.5-flash',
      fallback: { provider: 'CLAUDE', model: 'claude-haiku-4-5' },
    }),
    ...overrides,
  };
  return { deps, log, debited };
}

describe('AiRouterService fallback chain', () => {
  it('happy path: calls the primary, debits cost, logs SUCCESS', async () => {
    const { deps, log, debited } = makeDeps();
    const router = new AiRouterService(deps);
    const r = await router.complete('NLQ_PRIMARY', { messages: [{ role: 'user', content: 'hi' }] });

    expect(r.content).toBe('GEMINI says hi');
    expect(debited).toEqual([0]); // gemini free
    expect(log).toHaveLength(1);
    expect((log[0] as { status: string; providerKey: string }).status).toBe('SUCCESS');
    expect((log[0] as { providerKey: string }).providerKey).toBe('GEMINI');
  });

  it('falls back to the secondary provider when the primary throws a retryable error', async () => {
    const { deps, log } = makeDeps({
      registry: {
        getProvider: (k) =>
          k === 'GEMINI'
            ? stubProvider(k, {
                complete: vi.fn(async () => {
                  throw new AiProviderError('rate limited', 'GEMINI', true, 429);
                }),
              })
            : stubProvider(k),
      },
    });
    const router = new AiRouterService(deps);
    const r = await router.complete('NLQ_PRIMARY', { messages: [{ role: 'user', content: 'hi' }] });

    expect(r.content).toBe('CLAUDE says hi'); // fallback used
    // one FAILED (gemini) + one SUCCESS (claude)
    expect(log.map((e) => (e as { status: string }).status)).toEqual(['FAILED', 'SUCCESS']);
  });

  it('throws AiProviderUnavailableError when every provider fails', async () => {
    const { deps } = makeDeps({
      registry: {
        getProvider: (k) =>
          stubProvider(k, {
            complete: vi.fn(async () => {
              throw new AiProviderError('boom', k, true, 500);
            }),
          }),
      },
    });
    const router = new AiRouterService(deps);
    await expect(
      router.complete('NLQ_PRIMARY', { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it('throws AiBudgetExceededError (402) in FAIL_CLOSED mode without trying fallback', async () => {
    const primary = vi.fn();
    const { deps } = makeDeps({
      budget: {
        evaluate: async () => ({ allowed: false, reason: 'DAILY_CAP', mode: 'FAIL_CLOSED' }),
        debit: async () => {},
      },
      registry: { getProvider: (k) => stubProvider(k, { complete: primary as never }) },
    });
    const router = new AiRouterService(deps);
    await expect(
      router.complete('NLQ_PRIMARY', { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(AiBudgetExceededError);
    expect(primary).not.toHaveBeenCalled(); // never hit a provider
  });

  it('in FALLBACK mode, a budget-blocked primary skips to the (free) fallback', async () => {
    let calls = 0;
    const { deps } = makeDeps({
      budget: {
        // block the first (paid primary) candidate, allow the free fallback
        evaluate: async (cost: number) =>
          cost > 0
            ? { allowed: false, reason: 'DAILY_CAP' as const, mode: 'FALLBACK' as const }
            : { allowed: true, mode: 'FALLBACK' as const },
        debit: async () => {},
      },
      resolveConfig: async () => ({
        provider: 'CLAUDE', // paid primary
        model: 'claude-haiku-4-5',
        fallback: { provider: 'GEMINI', model: 'gemini-2.5-flash' }, // free fallback
      }),
      registry: {
        getProvider: (k) =>
          stubProvider(k, {
            complete: vi.fn(async () => {
              calls += 1;
              return {
                content: `${k} says hi`,
                finishReason: 'stop' as const,
                usage: { inputTokens: 1, outputTokens: 1 },
                actualCost: k === 'GEMINI' ? 0 : 0.02,
              };
            }),
          }),
      },
    });
    const router = new AiRouterService(deps);
    const r = await router.complete('NLQ_PRIMARY', { messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('GEMINI says hi');
    expect(calls).toBe(1); // only the fallback provider was actually invoked
  });

  it('embed routes through the resolved provider', async () => {
    const { deps } = makeDeps({
      resolveConfig: async () => ({ provider: 'OPENAI', model: 'openai-text-embedding-3-small' }),
    });
    const router = new AiRouterService(deps);
    const vectors = await router.embed('EMBEDDINGS', { texts: ['x'], model: '' });
    expect(vectors).toEqual([[0.1]]);
  });
});

// BE-026: provider errors were invisible (call log kept only a status code, no
// log line), and fallbacks to a provider with no key made doomed 401 calls.
describe('AiRouterService — failure diagnostics (BE-026)', () => {
  it('logs each failed attempt with the provider message, and records NOT_CONFIGURED for a keyless fallback', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { deps, log } = makeDeps({
      registry: {
        getProvider: (k) => {
          if (k === 'CLAUDE') throw new AiProviderNotConfiguredError('CLAUDE');
          return stubProvider(k, {
            complete: vi.fn(async () => {
              throw new AiProviderError('GEMINI request failed (404): model no longer available', 'GEMINI', false, 404);
            }),
          });
        },
      },
    });
    const router = new AiRouterService(deps);
    await expect(router.complete('INSIGHTS', { messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(
      AiProviderUnavailableError,
    );
    expect(log.map((e) => (e as { errorCode?: string }).errorCode)).toEqual(['404', 'NOT_CONFIGURED']);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('INSIGHTS') && l.includes('gemini-2.5-flash') && l.includes('model no longer available'))).toBe(true);
    expect(lines.some((l) => l.includes('CLAUDE') && l.includes('not configured'))).toBe(true);
    warn.mockRestore();
  });
});

describe('AiRouterService reasoning budget', () => {
  it("passes the route's reasoning budget to the provider (primary and fallback)", async () => {
    const seen: Array<{ model?: string; reasoningBudgetTokens?: number }> = [];
    const failing = stubProvider('GEMINI', {
      complete: vi.fn(async (req) => {
        seen.push({ model: req.model, reasoningBudgetTokens: req.reasoningBudgetTokens });
        if (req.model === 'gemini-3.5-flash') throw new AiProviderError('overloaded', 'GEMINI', true, 503);
        return { content: 'ok', finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1 }, actualCost: 0 };
      }),
    });
    const { deps } = makeDeps({
      registry: { getProvider: () => failing },
      resolveConfig: async () => ({
        provider: 'GEMINI',
        model: 'gemini-3.5-flash',
        fallback: { provider: 'GEMINI', model: 'gemini-3.5-flash-lite' },
        reasoningBudgetTokens: 2048,
      }),
    });
    const r = await new AiRouterService(deps).complete('INSIGHTS', { messages: [{ role: 'user', content: 'why?' }], maxTokens: 400 });
    expect(r.content).toBe('ok');
    expect(seen).toEqual([
      { model: 'gemini-3.5-flash', reasoningBudgetTokens: 2048 },
      { model: 'gemini-3.5-flash-lite', reasoningBudgetTokens: 2048 },
    ]);
  });

  it('a caller-supplied budget wins over the route default', async () => {
    const p = stubProvider('GEMINI');
    const { deps } = makeDeps({
      registry: { getProvider: () => p },
      resolveConfig: async () => ({ provider: 'GEMINI', model: 'gemini-3.5-flash', reasoningBudgetTokens: 2048 }),
    });
    await new AiRouterService(deps).complete('INSIGHTS', { messages: [{ role: 'user', content: 'x' }], reasoningBudgetTokens: 64 });
    expect(vi.mocked(p.complete).mock.calls[0]![0].reasoningBudgetTokens).toBe(64);
  });
});
