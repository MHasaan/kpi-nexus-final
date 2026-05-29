import type { AiUsage } from './types.js';

/**
 * Per-model price table in USD per million tokens. `cachedInputPerMTok` is the
 * discounted rate for prompt-cache hits (falls back to the full input rate when
 * a provider doesn't distinguish). Wildcard keys like `ollama-*` price a whole
 * family; {@link priceCall} resolves `vendor:model` ids to them.
 *
 * Free-tier models (Gemini, Ollama local) are intentionally $0 so the budget
 * never blocks them. Update rates here when vendor pricing changes — this is the
 * only place cost is computed.
 */
export interface PriceTier {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok?: number;
}

export const PRICING: Record<string, PriceTier> = {
  'claude-opus-4-7': { inputPerMTok: 15, outputPerMTok: 75, cachedInputPerMTok: 1.5 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5, cachedInputPerMTok: 0.1 },
  'gemini-2.5-flash': { inputPerMTok: 0, outputPerMTok: 0 },
  'gemini-2.5-flash-lite': { inputPerMTok: 0, outputPerMTok: 0 },
  'gemini-text-embedding-004': { inputPerMTok: 0, outputPerMTok: 0 },
  'openai-gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10, cachedInputPerMTok: 1.25 },
  'openai-text-embedding-3-small': { inputPerMTok: 0.02, outputPerMTok: 0 },
  'openai-text-embedding-3-large': { inputPerMTok: 0.13, outputPerMTok: 0 },
  'ollama-*': { inputPerMTok: 0, outputPerMTok: 0 },
};

/**
 * Compute the USD cost of one call. Cached tokens are billed at the cached rate
 * and the remaining (uncached) input at the full rate. Unknown models fail open
 * (return 0) rather than throwing — a missing price must never break a feature.
 */
export function priceCall(model: string, usage: Pick<AiUsage, 'inputTokens' | 'outputTokens' | 'cachedTokens'>): number {
  const tier = PRICING[model] ?? PRICING[`${model.split(':')[0]}-*`];
  if (!tier) return 0; // fail-open on unknown model

  const cached = usage.cachedTokens ?? 0;
  const uncachedInput = Math.max(0, usage.inputTokens - cached);
  const inputCost = (uncachedInput / 1_000_000) * tier.inputPerMTok;
  const cachedCost = (cached / 1_000_000) * (tier.cachedInputPerMTok ?? tier.inputPerMTok);
  const outputCost = (usage.outputTokens / 1_000_000) * tier.outputPerMTok;
  return inputCost + cachedCost + outputCost;
}
