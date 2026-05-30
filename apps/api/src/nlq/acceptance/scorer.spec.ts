import { describe, expect, it } from 'vitest';

import { scoreAnswer } from './scorer.js';

const golden = {
  question: 'What is our MRR trend?',
  expectKeywords: ['MRR', 'revenue'],
  expectKpiNames: ['Monthly Recurring Revenue'],
};

describe('scoreAnswer (3 subchecks: keyword, source, non-empty; pass ≥2)', () => {
  it('passes when all three subchecks hold', () => {
    const r = scoreAnswer(
      { answer: 'Our MRR grew 12% last quarter.', sources: [{ kpiId: 'k', name: 'Monthly Recurring Revenue' }] },
      golden,
    );
    expect(r.subchecks.keyword).toBe(true);
    expect(r.subchecks.source).toBe(true);
    expect(r.subchecks.nonEmpty).toBe(true);
    expect(r.passed).toBe(true);
  });

  it('passes with 2 of 3 (keyword + non-empty, source missing)', () => {
    const r = scoreAnswer({ answer: 'Revenue is up.', sources: [] }, golden);
    expect(r.subchecks.source).toBe(false);
    expect(r.passed).toBe(true); // keyword + nonEmpty = 2
  });

  it('fails when only non-empty holds (no keyword, no source)', () => {
    const r = scoreAnswer({ answer: 'I am not sure about that.', sources: [] }, golden);
    expect(r.subchecks.keyword).toBe(false);
    expect(r.passed).toBe(false);
  });

  it('keyword match is case-insensitive', () => {
    const r = scoreAnswer({ answer: 'our mrr is healthy', sources: [] }, golden);
    expect(r.subchecks.keyword).toBe(true);
  });

  it('source match is case-insensitive + substring', () => {
    const r = scoreAnswer(
      { answer: 'no keyword here', sources: [{ kpiId: 'k', name: 'monthly recurring revenue (MRR)' }] },
      golden,
    );
    expect(r.subchecks.source).toBe(true);
  });

  it('treats an empty answer as failing nonEmpty', () => {
    const r = scoreAnswer({ answer: '   ', sources: [] }, golden);
    expect(r.subchecks.nonEmpty).toBe(false);
    expect(r.passed).toBe(false);
  });
});
