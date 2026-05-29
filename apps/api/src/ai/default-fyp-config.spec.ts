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

  it('defaults NLQ to free Gemini primary with a Claude fallback', () => {
    const c = DEFAULT_FYP_CONFIG.NLQ_PRIMARY;
    expect(c.provider).toBe('GEMINI');
    expect(c.model).toBe('gemini-2.5-flash');
    expect(c.fallback?.provider).toBe('CLAUDE');
  });

  it('routes embeddings to OpenAI by default', () => {
    expect(DEFAULT_FYP_CONFIG.EMBEDDINGS.provider).toBe('OPENAI');
  });
});
