import { Logger, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiCompletionRequest } from '@kpi-nexus/ai';
import type { AiProviderRegistry } from '../ai/ai-provider-registry.js';
import type { OnboardingService } from '../onboarding/onboarding.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { OnboardingAiService } from './onboarding-ai.service.js';

/**
 * BE-010: the onboarding co-pilot runs pre-org (anonymous), so besides the
 * per-session limits it must charge a GLOBAL daily cap — but only for real
 * LLM calls, never for requests with a bad draft token.
 */
function setup(opts: { tokenValid?: boolean; denyKey?: (key: string) => boolean } = {}) {
  const complete = vi.fn(async (_req: AiCompletionRequest) => ({
    content: 'An explanation.',
    usage: { inputTokens: 10, outputTokens: 20 },
    actualCost: 0.0001,
  }));
  const registry = { getProvider: vi.fn(async () => ({ complete })) } as unknown as AiProviderRegistry;
  const consume = vi.fn(async (key: string, _limit: number, _windowSec: number, _nowMs: number) => ({
    allowed: !(opts.denyKey?.(key) ?? false),
    remaining: 0,
  }));
  const rateLimit = { consume } as unknown as RateLimitService;
  const onboarding = {
    getDraft: vi.fn(async () => {
      if (opts.tokenValid === false) throw new NotFoundException('Draft not found');
      return { id: 's1', payload: {} };
    }),
  } as unknown as OnboardingService;
  const prisma = {
    onboardingAIInteraction: { create: vi.fn(async () => ({ id: 'i1' })) },
  } as unknown as PrismaService;
  return { service: new OnboardingAiService(prisma, registry, rateLimit, onboarding), consume, complete };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OnboardingAiService — global daily cap (BE-010)', () => {
  it('a bad draft token is rejected before ANY budget is consumed', async () => {
    const { service, consume, complete } = setup({ tokenValid: false });
    await expect(service.explain('s1', 'bogus', 'kpis[0].unit')).rejects.toBeInstanceOf(NotFoundException);
    expect(consume).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns 429 and never calls the provider when the global cap is exhausted', async () => {
    const { service, consume, complete } = setup({ denyKey: (k) => k === 'rl:onboarding-ai:global' });
    await expect(service.explain('s1', 'tok', 'kpis[0].unit')).rejects.toMatchObject({
      status: 429,
      response: { code: 'RATE_LIMITED' },
    });
    expect(consume.mock.calls.map((c) => c[0])).toContain('rl:onboarding-ai:global');
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not charge the global cap when the per-session limit already refused', async () => {
    const { service, consume, complete } = setup({ denyKey: (k) => k.startsWith('onboarding-ai:s1:') });
    await expect(service.explain('s1', 'tok', 'kpis[0].unit')).rejects.toMatchObject({ status: 429 });
    expect(consume.mock.calls.map((c) => c[0])).toEqual(['onboarding-ai:s1:explain']);
    expect(complete).not.toHaveBeenCalled();
  });

  it('charges session then global (configured daily budget), then calls the provider once', async () => {
    vi.stubEnv('RATE_LIMIT_ONBOARDING_AI_GLOBAL_PER_DAY', '42');
    const { service, consume, complete } = setup();
    await expect(service.explain('s1', 'tok', 'kpis[0].unit')).resolves.toMatchObject({ explanation: 'An explanation.' });
    expect(consume.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      ['onboarding-ai:s1:explain', 100, 3600],
      ['rl:onboarding-ai:global', 42, 86_400],
    ]);
    expect(complete).toHaveBeenCalledOnce();
  });
});

// Anonymous callers used to get the raw provider error in the 503 body (e.g.
// "CLAUDE request failed (401): … invalid x-api-key"). The detail belongs in
// the server log, not the response.
describe('OnboardingAiService — provider failures (BE-026)', () => {
  it('503 AI_UNAVAILABLE without provider internals; the detail is logged', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, complete } = setup();
    complete.mockRejectedValue(new Error('CLAUDE request failed (401): invalid x-api-key'));
    const err = (await service.explain('s1', 'tok', 'kpis[0].unit').catch((e: unknown) => e)) as {
      getStatus(): number;
      getResponse(): Record<string, unknown>;
    };
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toEqual({ code: 'AI_UNAVAILABLE', message: 'AI providers unavailable' });
    expect(JSON.stringify(err.getResponse())).not.toContain('x-api-key');
    expect(warn.mock.calls.some((c) => String(c[0]).includes('invalid x-api-key'))).toBe(true);
    warn.mockRestore();
  });
});

// Real Gemini: the assistant's 800-token answer budget was spent on thinking
// (764 of 800 tokens), so the JSON patch came back cut off and was dropped.
// The co-pilot calls providers directly, so it must pass the route's reasoning
// budget itself, as the org-scoped AiRouter does.
describe('OnboardingAiService — reasoning budget', () => {
  it('passes the route reasoning budget on top of the answer budget', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({ content: '[]', usage: { inputTokens: 1, outputTokens: 1 }, actualCost: 0 });
    await service.assistant('s1', 'tok', 'Add a Quality Officer role');
    expect(complete.mock.calls[0]![0]).toMatchObject({ model: 'gemini-3.5-flash', maxTokens: 800, reasoningBudgetTokens: 2048 });
  });

  it('gives the generator its larger reasoning budget', async () => {
    const { service, complete } = setup();
    await service.generate('s1', 'tok', 'B2B SaaS').catch(() => undefined);
    expect(complete.mock.calls[0]![0]).toMatchObject({ maxTokens: 8000, reasoningBudgetTokens: 4096 });
  });
});

// The model can only use real permission keys if the prompts name them.
describe('OnboardingAiService — permission keys in prompts', () => {
  it('the generator and assistant prompts list the canonical permission keys', async () => {
    const { service, complete } = setup();
    complete.mockResolvedValue({ content: '[]', usage: { inputTokens: 1, outputTokens: 1 }, actualCost: 0 });
    await service.generate('s1', 'tok', 'B2B SaaS').catch(() => undefined);
    await service.assistant('s1', 'tok', 'Add a role');
    for (const call of complete.mock.calls) {
      expect(call[0].systemPrompt).toContain('KPI_VIEW');
      expect(call[0].systemPrompt).toContain('BILLING_MANAGE');
    }
  });
});
