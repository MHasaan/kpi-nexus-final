import { z } from 'zod';

/**
 * Canonical AI vocabulary for KPI Nexus. Locked per spec §7.
 *
 * This is the single source of truth shared by `packages/ai` (provider
 * abstraction) and the Prisma schema (`AiProviderKey`, `AiCallStatus`,
 * `CircuitBreakerMode` enums). The literal string values MUST stay byte-for-byte
 * identical to the Prisma enum members or the router/registry will mis-resolve
 * providers. Adding a provider or feature requires coordinated updates across:
 * this file, the Prisma enums, the provider registry, and DEFAULT_FYP_CONFIG.
 */

/** The four supported model vendors. */
export const AiProviderKey = {
  CLAUDE: 'CLAUDE',
  GEMINI: 'GEMINI',
  OPENAI: 'OPENAI',
  OLLAMA: 'OLLAMA',
} as const;

export type AiProviderKey = (typeof AiProviderKey)[keyof typeof AiProviderKey];

export const AiProviderKeySchema = z.nativeEnum(AiProviderKey);

export const ALL_AI_PROVIDER_KEYS: readonly AiProviderKey[] = Object.values(AiProviderKey);

/**
 * The 11 AI features. Each maps to a primary/fallback provider+model in
 * DEFAULT_FYP_CONFIG and can be overridden per-org via AiFeatureConfig.
 */
export const AiFeature = {
  ONBOARDING_GENERATOR: 'ONBOARDING_GENERATOR',
  ONBOARDING_ASSISTANT: 'ONBOARDING_ASSISTANT',
  ONBOARDING_SUGGEST: 'ONBOARDING_SUGGEST',
  ONBOARDING_EXPLAIN: 'ONBOARDING_EXPLAIN',
  KPI_SUGGESTIONS: 'KPI_SUGGESTIONS',
  NLQ_PRIMARY: 'NLQ_PRIMARY',
  NLQ_TOOLS: 'NLQ_TOOLS',
  INSIGHTS: 'INSIGHTS',
  RECOMMENDATIONS: 'RECOMMENDATIONS',
  ANOMALY_EXPLANATIONS: 'ANOMALY_EXPLANATIONS',
  EMBEDDINGS: 'EMBEDDINGS',
} as const;

export type AiFeature = (typeof AiFeature)[keyof typeof AiFeature];

export const AiFeatureSchema = z.nativeEnum(AiFeature);

export const ALL_AI_FEATURES: readonly AiFeature[] = Object.values(AiFeature);

export const AI_FEATURE_COUNT = 11 as const;

/** Outcome of a single AI provider call, persisted to AiCallLog. */
export const AiCallStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SUPPRESSED: 'SUPPRESSED',
} as const;

export type AiCallStatus = (typeof AiCallStatus)[keyof typeof AiCallStatus];

export const AiCallStatusSchema = z.nativeEnum(AiCallStatus);

/**
 * Budget circuit-breaker behaviour when a per-org cap is hit.
 * - FAIL_CLOSED: refuse the call (HTTP 402-shaped error).
 * - FALLBACK: try the (typically free) fallback provider instead.
 */
export const CircuitBreakerMode = {
  FAIL_CLOSED: 'FAIL_CLOSED',
  FALLBACK: 'FALLBACK',
} as const;

export type CircuitBreakerMode = (typeof CircuitBreakerMode)[keyof typeof CircuitBreakerMode];

export const CircuitBreakerModeSchema = z.nativeEnum(CircuitBreakerMode);
