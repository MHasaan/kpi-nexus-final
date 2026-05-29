import { describe, expect, it } from 'vitest';

import { parseRecommendation } from './recommendation-parser.js';

const valid = {
  summary: 'Revenue dipped due to churn in the enterprise segment.',
  rootCauseHypotheses: ['Increased competitor discounting', 'Onboarding friction'],
  suggestedActions: [
    { action: 'Launch win-back campaign', rationale: 'Recover at-risk accounts', priority: 'P1' },
    { action: 'Audit onboarding funnel', rationale: 'Reduce early churn', priority: 2 },
  ],
  confidence: 0.82,
};

describe('parseRecommendation (fence strip, structured, graceful fallback)', () => {
  it('parses a well-formed recommendation', () => {
    const r = parseRecommendation(JSON.stringify(valid));
    expect(r.summary).toContain('Revenue dipped');
    expect(r.rootCauseHypotheses).toHaveLength(2);
    expect(r.suggestedActions).toHaveLength(2);
    expect(r.confidence).toBeCloseTo(0.82, 6);
  });

  it('strips ```json fences', () => {
    const r = parseRecommendation('```json\n' + JSON.stringify(valid) + '\n```');
    expect(r.suggestedActions).toHaveLength(2);
  });

  it('normalizes numeric/loose priority to P1..P3', () => {
    const r = parseRecommendation(JSON.stringify(valid));
    expect(r.suggestedActions[0]!.priority).toBe('P1');
    expect(r.suggestedActions[1]!.priority).toBe('P2'); // numeric 2 → P2
  });

  it('falls back to raw text as the summary when JSON is malformed', () => {
    const r = parseRecommendation('Sorry, here is some advice without any json structure.');
    expect(r.summary).toContain('Sorry, here is some advice');
    expect(r.rootCauseHypotheses).toEqual([]);
    expect(r.suggestedActions).toEqual([]);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(1);
  });

  it('clamps confidence into [0,1] and defaults when missing', () => {
    expect(parseRecommendation(JSON.stringify({ summary: 's', confidence: 5 })).confidence).toBe(1);
    expect(parseRecommendation(JSON.stringify({ summary: 's', confidence: -2 })).confidence).toBe(0);
    expect(parseRecommendation(JSON.stringify({ summary: 's' })).confidence).toBeGreaterThan(0);
  });

  it('drops malformed suggested actions (missing action text)', () => {
    const r = parseRecommendation(
      JSON.stringify({ summary: 's', suggestedActions: [{ rationale: 'no action field', priority: 'P1' }, { action: 'Do X' }] }),
    );
    expect(r.suggestedActions).toHaveLength(1);
    expect(r.suggestedActions[0]!.action).toBe('Do X');
    expect(r.suggestedActions[0]!.priority).toBe('P2'); // default when absent
  });
});
