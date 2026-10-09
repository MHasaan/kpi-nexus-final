import { ALL_AI_FEATURES } from '@kpi-nexus/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_FYP_CONFIG } from './default-fyp-config.js';

describe('DEFAULT_FYP_CONFIG', () => {
  it('has an entry for every AI feature', () => {
    for (const feature of ALL_AI_FEATURES) {
      expect(DEFAULT_FYP_CONFIG[feature]).toBeDefined();
      expect(DEFAULT_FYP_CONFIG[feature].provider).toBeTruthy();
      expect(DEFAULT_FYP_CONFIG[feature].model).toBeTruthy();
    }
  });

  it('reasoning features use a free thinking model with its own reasoning budget', () => {
    for (const f of ['NLQ_PRIMARY', 'NLQ_TOOLS', 'INSIGHTS', 'RECOMMENDATIONS', 'KPI_SUGGESTIONS', 'ONBOARDING_ASSISTANT', 'ONBOARDING_GENERATOR'] as const) {
      const c = DEFAULT_FYP_CONFIG[f];
      expect(c).toMatchObject({ provider: 'GEMINI', model: 'gemini-3.5-flash' });
      expect(c.fallback).toEqual({ provider: 'GEMINI', model: 'gemini-3.5-flash-lite' });
      expect(c.reasoningBudgetTokens).toBeGreaterThan(0);
    }
  });

  it('light features use flash-lite with no reasoning budget', () => {
    for (const f of ['ONBOARDING_SUGGEST', 'ONBOARDING_EXPLAIN', 'ANOMALY_EXPLANATIONS'] as const) {
      expect(DEFAULT_FYP_CONFIG[f]).toMatchObject({ model: 'gemini-3.5-flash-lite' });
      expect(DEFAULT_FYP_CONFIG[f].reasoningBudgetTokens).toBeUndefined();
    }
  });

  it('never routes to a retired 2.5-flash primary or a zero-quota Pro model', () => {
    for (const c of Object.values(DEFAULT_FYP_CONFIG)) {
      expect(c.model).not.toMatch(/^gemini-2\.5-flash$|pro/);
    }
  });

  it('routes embeddings to Gemini by default (free, FYP has keys)', () => {
    expect(DEFAULT_FYP_CONFIG.EMBEDDINGS.provider).toBe('GEMINI');
    expect(DEFAULT_FYP_CONFIG.EMBEDDINGS.model).toBe('gemini-embedding-001');
  });
});
