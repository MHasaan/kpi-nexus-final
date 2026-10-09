import type { AiFeature, AiProviderKey } from '@kpi-nexus/contracts';

/**
 * Default provider+model routing for each AI feature when an org has not set an
 * explicit AiFeatureConfig. Tuned for the FYP free tier (checked live against
 * the configured keys, 2026-10-09):
 *
 * - Gemini Pro models have a free-tier quota of 0 ("limit: 0"), so they can't
 *   be used; the Flash "thinking" models are the free reasoning option.
 * - gemini-2.5-flash is "no longer available to new users" on newer keys, so
 *   primaries moved to the 3.5 family.
 * - gemini-3.8-flash is newer but often answered 503 "high demand", so it is not
 *   a primary.
 * - No Claude/OpenAI keys are configured, so fallbacks stay on Gemini.
 *
 * Two tiers:
 * - REASONING (questions, insights, recommendations, generation): gemini-3.5-flash
 *   with a reasoning budget, falling back to gemini-3.5-flash-lite.
 * - LIGHT (short explanations / suggestions): gemini-3.5-flash-lite, falling back
 *   to gemini-2.5-flash-lite (neither thinks by default).
 */
export interface FeatureRoute {
  provider: AiProviderKey;
  model: string;
  fallback?: { provider: AiProviderKey; model: string };
  /**
   * Reasoning ("thinking") tokens granted ON TOP of the feature's answer budget
   * (maxTokens). Applies to the primary and the fallback. Without it, thinking
   * models spent the answer budget on reasoning and returned truncated output.
   */
  reasoningBudgetTokens?: number;
}

const REASONING_MODEL = 'gemini-3.5-flash';
const REASONING_FALLBACK = { provider: 'GEMINI', model: 'gemini-3.5-flash-lite' } as const;
const LIGHT_MODEL = 'gemini-3.5-flash-lite';
const LIGHT_FALLBACK = { provider: 'GEMINI', model: 'gemini-2.5-flash-lite' } as const;

const reasoning = (budget = 2048): FeatureRoute => ({
  provider: 'GEMINI',
  model: REASONING_MODEL,
  fallback: { ...REASONING_FALLBACK },
  reasoningBudgetTokens: budget,
});

const light = (): FeatureRoute => ({
  provider: 'GEMINI',
  model: LIGHT_MODEL,
  fallback: { ...LIGHT_FALLBACK },
});

export const DEFAULT_FYP_CONFIG: Record<AiFeature, FeatureRoute> = {
  // Generates a whole organisation (roles, units, KPIs) — the deepest task.
  ONBOARDING_GENERATOR: reasoning(4096),
  ONBOARDING_ASSISTANT: reasoning(),
  ONBOARDING_SUGGEST: light(),
  ONBOARDING_EXPLAIN: light(),
  KPI_SUGGESTIONS: reasoning(),
  NLQ_PRIMARY: reasoning(),
  NLQ_TOOLS: reasoning(),
  INSIGHTS: reasoning(),
  RECOMMENDATIONS: reasoning(),
  ANOMALY_EXPLANATIONS: light(),
  EMBEDDINGS: {
    // Gemini-first (free, and the model the FYP deployment has keys for).
    provider: 'GEMINI',
    model: 'gemini-embedding-001',
    fallback: { provider: 'OPENAI', model: 'openai-text-embedding-3-small' },
  },
};
