import type { AiFeature, AiProviderKey } from '@kpi-nexus/contracts';

/**
 * Default provider+model routing for each AI feature when an org has not set an
 * explicit AiFeatureConfig. Tuned for the FYP free tier: Gemini flash is the
 * primary for nearly everything (zero marginal cost), with paid Claude as the
 * quality fallback on the features that benefit most. Embeddings go to OpenAI's
 * cheap embedding model, falling back to Gemini's.
 */
export interface FeatureRoute {
  provider: AiProviderKey;
  model: string;
  fallback?: { provider: AiProviderKey; model: string };
}

export const DEFAULT_FYP_CONFIG: Record<AiFeature, FeatureRoute> = {
  ONBOARDING_GENERATOR: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    fallback: { provider: 'CLAUDE', model: 'claude-haiku-4-5' },
  },
  ONBOARDING_ASSISTANT: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    fallback: { provider: 'GEMINI', model: 'gemini-2.5-flash-lite' },
  },
  ONBOARDING_SUGGEST: { provider: 'GEMINI', model: 'gemini-2.5-flash-lite' },
  ONBOARDING_EXPLAIN: { provider: 'GEMINI', model: 'gemini-2.5-flash-lite' },
  KPI_SUGGESTIONS: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    fallback: { provider: 'CLAUDE', model: 'claude-haiku-4-5' },
  },
  NLQ_PRIMARY: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    fallback: { provider: 'CLAUDE', model: 'claude-haiku-4-5' },
  },
  NLQ_TOOLS: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    fallback: { provider: 'CLAUDE', model: 'claude-haiku-4-5' },
  },
  INSIGHTS: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    fallback: { provider: 'CLAUDE', model: 'claude-haiku-4-5' },
  },
  RECOMMENDATIONS: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash',
    fallback: { provider: 'CLAUDE', model: 'claude-opus-4-7' },
  },
  ANOMALY_EXPLANATIONS: {
    provider: 'GEMINI',
    model: 'gemini-2.5-flash-lite',
    fallback: { provider: 'GEMINI', model: 'gemini-2.5-flash' },
  },
  EMBEDDINGS: {
    provider: 'OPENAI',
    model: 'openai-text-embedding-3-small',
    fallback: { provider: 'GEMINI', model: 'gemini-text-embedding-004' },
  },
};
