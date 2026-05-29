import { describe, expect, it } from 'vitest';

import {
  AI_FEATURE_COUNT,
  ALL_AI_FEATURES,
  ALL_AI_PROVIDER_KEYS,
  AiCallStatus,
  AiCallStatusSchema,
  AiFeature,
  AiFeatureSchema,
  AiProviderKey,
  AiProviderKeySchema,
  CircuitBreakerMode,
  CircuitBreakerModeSchema,
} from './ai.js';

describe('AI contracts (locked vocabulary, source of truth for packages/ai + Prisma)', () => {
  it('locks the four provider keys', () => {
    expect(ALL_AI_PROVIDER_KEYS).toEqual(['CLAUDE', 'GEMINI', 'OPENAI', 'OLLAMA']);
  });

  it('locks exactly 11 AI features', () => {
    expect(AI_FEATURE_COUNT).toBe(11);
    expect(ALL_AI_FEATURES).toHaveLength(11);
  });

  it('includes every feature referenced by DEFAULT_FYP_CONFIG', () => {
    for (const f of [
      'ONBOARDING_GENERATOR',
      'ONBOARDING_ASSISTANT',
      'ONBOARDING_SUGGEST',
      'ONBOARDING_EXPLAIN',
      'KPI_SUGGESTIONS',
      'NLQ_PRIMARY',
      'NLQ_TOOLS',
      'INSIGHTS',
      'RECOMMENDATIONS',
      'ANOMALY_EXPLANATIONS',
      'EMBEDDINGS',
    ] as const) {
      expect(ALL_AI_FEATURES).toContain(f);
    }
  });

  it('exposes const maps matching their literal types', () => {
    expect(AiProviderKey.GEMINI).toBe('GEMINI');
    expect(AiFeature.NLQ_PRIMARY).toBe('NLQ_PRIMARY');
    expect(AiCallStatus.SUPPRESSED).toBe('SUPPRESSED');
    expect(CircuitBreakerMode.FAIL_CLOSED).toBe('FAIL_CLOSED');
  });

  it('parses valid values and rejects unknown ones via zod', () => {
    expect(AiProviderKeySchema.parse('CLAUDE')).toBe('CLAUDE');
    expect(() => AiProviderKeySchema.parse('MISTRAL')).toThrow();
    expect(AiFeatureSchema.parse('INSIGHTS')).toBe('INSIGHTS');
    expect(() => AiFeatureSchema.parse('NOT_A_FEATURE')).toThrow();
    expect(AiCallStatusSchema.parse('FAILED')).toBe('FAILED');
    expect(CircuitBreakerModeSchema.parse('FALLBACK')).toBe('FALLBACK');
  });
});
