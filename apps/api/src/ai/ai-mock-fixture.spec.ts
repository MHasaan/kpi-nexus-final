/**
 * Guards the E2E AI fixture (test/fixtures/ai-mock-response.json). CI serves it
 * as AI_MOCK_RESPONSE, so every AI feature's parser must accept it — if a
 * parser's contract changes, this fails here instead of as a confusing E2E red.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { parseKpiSuggestions } from '../kpi-suggestions/kpi-suggestion-parser.js';
import { parseGeneratedOrg } from '../onboarding-ai/parse-generated-org.js';
import { parseRecommendation } from '../recommendations/recommendation-parser.js';

const raw = readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'ai-mock-response.json'), 'utf8');

describe('E2E AI mock fixture', () => {
  test('KPI suggestions parser yields valid suggestions', () => {
    const s = parseKpiSuggestions(raw, 3);
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.name && x.type && x.direction)).toBe(true);
  });

  test('recommendation parser yields structured content (not the prose fallback)', () => {
    const r = parseRecommendation(raw);
    expect(r.summary).toMatch(/expected band/);
    expect(r.rootCauseHypotheses).toHaveLength(2);
    expect(r.suggestedActions.map((a) => a.priority)).toEqual(['P1', 'P2']);
  });

  test('onboarding generator yields an org with ≥3 roles and ≥3 KPIs', () => {
    const org = parseGeneratedOrg(raw);
    expect(org.organization?.name).toBe('Mock Co');
    expect(org.roles?.length).toBeGreaterThanOrEqual(3);
    expect(org.kpis?.length).toBeGreaterThanOrEqual(3);
  });
});
