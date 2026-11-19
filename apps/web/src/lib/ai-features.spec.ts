/**
 * AI settings listed each feature by its internal key ("NLQ_PRIMARY",
 * "ONBOARDING_SUGGEST"), which tells an administrator nothing about what they
 * are choosing a model for.
 */
import { ALL_AI_FEATURES } from '@kpi-nexus/contracts';
import { describe, expect, test } from 'vitest';

import { aiFeatureInfo, isAiFeatureInUse } from './ai-features';

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

// Two features were listed with a model, a fallback and a cap to set, and no
// part of the product calls either: a choice saved there changed nothing.
describe('isAiFeatureInUse', () => {
  test('a feature nothing calls is not offered', () => {
    expect(isAiFeatureInUse('NLQ_TOOLS')).toBe(false);
    expect(isAiFeatureInUse('ANOMALY_EXPLANATIONS')).toBe(false);
  });
  test('every other feature is', () => {
    const offered = ALL_AI_FEATURES.filter(isAiFeatureInUse);
    expect(offered).toHaveLength(ALL_AI_FEATURES.length - 2);
    expect(offered).toContain('NLQ_PRIMARY');
    expect(isAiFeatureInUse('SOME_NEW_FEATURE')).toBe(true);
  });
  // The claim "nothing calls it" is checked against the API's source, so a
  // feature that gains a caller has to be offered again.
  test('the features left out really have no caller in the API', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const root = new URL('../../../api/src/', import.meta.url);
    const files = (readdirSync(root, { recursive: true }) as string[]).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('default-fyp-config.ts'),
    );
    const source = files.map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n');
    for (const feature of ALL_AI_FEATURES.filter((f) => !isAiFeatureInUse(f))) {
      expect(source, feature).not.toMatch(new RegExp(`['"\`]${feature}['"\`]|AiFeature\\.${feature}\\b`));
    }
  });
});
