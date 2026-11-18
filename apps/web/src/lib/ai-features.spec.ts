/**
 * AI settings listed each feature by its internal key ("NLQ_PRIMARY",
 * "ONBOARDING_SUGGEST"), which tells an administrator nothing about what they
 * are choosing a model for.
 */
import { ALL_AI_FEATURES } from '@kpi-nexus/contracts';
import { describe, expect, test } from 'vitest';

import { aiFeatureInfo } from './ai-features';

describe('aiFeatureInfo', () => {
  test('every feature has a name in words and says what it does', () => {
    for (const feature of ALL_AI_FEATURES) {
      const info = aiFeatureInfo(feature);
      expect(info.name, feature).not.toMatch(/_/);
      expect(info.name, feature).not.toBe(feature);
      expect(info.does.length, feature).toBeGreaterThan(10);
    }
  });
  test('names are told apart', () => {
    const names = ALL_AI_FEATURES.map((f) => aiFeatureInfo(f).name);
    expect(new Set(names).size).toBe(names.length);
  });
  test('the page a feature belongs to is in its name', () => {
    expect(aiFeatureInfo('NLQ_PRIMARY').name).toBe('Ask');
    expect(aiFeatureInfo('ONBOARDING_ASSISTANT').name).toBe('Setup wizard: assistant');
  });
  test('a feature this page does not know is still shown, in words', () => {
    expect(aiFeatureInfo('SOME_NEW_FEATURE')).toEqual({ name: 'Some new feature', does: '' });
  });
});
