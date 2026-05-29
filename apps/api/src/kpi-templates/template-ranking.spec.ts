import { describe, expect, it } from 'vitest';

import {
  type RankableTemplate,
  popularityBonus,
  rankTemplates,
  scoreTemplate,
} from './template-ranking.js';

function tmpl(over: Partial<RankableTemplate>): RankableTemplate {
  return {
    name: 'Sample',
    description: null,
    tags: [],
    popularity: 0,
    function: null,
    industry: null,
    scorecardQuadrant: null,
    ...over,
  };
}

describe('scoreTemplate', () => {
  it('scores by best matching signal in priority order', () => {
    expect(scoreTemplate(tmpl({ name: 'Revenue' }), 'revenue')).toBe(1000); // exact
    expect(scoreTemplate(tmpl({ name: 'Revenue Growth' }), 'revenue')).toBe(500); // prefix
    expect(scoreTemplate(tmpl({ name: 'Net Revenue' }), 'revenue')).toBe(200); // contains
    expect(scoreTemplate(tmpl({ name: 'X', tags: ['revenue'] }), 'revenue')).toBe(150); // tag exact
    expect(scoreTemplate(tmpl({ name: 'X', tags: ['revenue-ttm'] }), 'revenue')).toBe(75); // tag prefix
    expect(scoreTemplate(tmpl({ name: 'X', description: 'tracks revenue' }), 'revenue')).toBe(50); // desc
  });

  it('is case-insensitive and returns 0 for no match or blank search', () => {
    expect(scoreTemplate(tmpl({ name: 'Revenue' }), 'REVENUE')).toBe(1000);
    expect(scoreTemplate(tmpl({ name: 'Revenue' }), 'churn')).toBe(0);
    expect(scoreTemplate(tmpl({ name: 'Revenue' }), '   ')).toBe(0);
  });

  it('prefers the higher signal when multiple fields match', () => {
    // name contains (200) beats tag exact (150) for the same query
    const t = tmpl({ name: 'Monthly Revenue', tags: ['revenue'] });
    expect(scoreTemplate(t, 'revenue')).toBe(200);
  });
});

describe('popularityBonus', () => {
  it('caps at 25 and floors at 0', () => {
    expect(popularityBonus(0)).toBe(0);
    expect(popularityBonus(10)).toBe(10);
    expect(popularityBonus(25)).toBe(25);
    expect(popularityBonus(9999)).toBe(25);
    expect(popularityBonus(-5)).toBe(0);
  });
});

describe('rankTemplates', () => {
  const data: RankableTemplate[] = [
    tmpl({ name: 'Revenue', function: 'finance', industry: 'saas', scorecardQuadrant: 'FINANCIAL', popularity: 5 }),
    tmpl({ name: 'Revenue Growth Rate', function: 'finance', popularity: 50 }),
    tmpl({ name: 'Customer Churn', function: 'support', tags: ['retention'], popularity: 30 }),
    tmpl({ name: 'NPS', function: 'support', description: 'net promoter score', popularity: 80 }),
  ];

  it('orders by popularity then name when no search term', () => {
    const r = rankTemplates(data, {});
    expect(r.map((t) => t.name)).toEqual(['NPS', 'Revenue Growth Rate', 'Customer Churn', 'Revenue']);
  });

  it('filters by function (exact, case-insensitive)', () => {
    const r = rankTemplates(data, { function: 'FINANCE' });
    expect(r.map((t) => t.name).sort()).toEqual(['Revenue', 'Revenue Growth Rate']);
  });

  it('filters by industry and quadrant', () => {
    expect(rankTemplates(data, { industry: 'saas' }).map((t) => t.name)).toEqual(['Revenue']);
    expect(rankTemplates(data, { scorecardQuadrant: 'financial' }).map((t) => t.name)).toEqual(['Revenue']);
  });

  it('ranks by relevance when searching, dropping non-matches', () => {
    const r = rankTemplates(data, { search: 'revenue' });
    // exact "Revenue" (1000) before prefix "Revenue Growth Rate" (500); churn/NPS dropped
    expect(r.map((t) => t.name)).toEqual(['Revenue', 'Revenue Growth Rate']);
  });

  it('uses popularity only to break ties within the same relevance tier', () => {
    const tie: RankableTemplate[] = [
      tmpl({ name: 'Alpha Metric', popularity: 1 }),
      tmpl({ name: 'Beta Metric', popularity: 99 }),
    ];
    // both "contains" (200); Beta's capped +25 popularity outranks Alpha's +1
    const r = rankTemplates(tie, { search: 'metric' });
    expect(r.map((t) => t.name)).toEqual(['Beta Metric', 'Alpha Metric']);
  });

  it('combines filter + search', () => {
    const r = rankTemplates(data, { function: 'support', search: 'churn' });
    expect(r.map((t) => t.name)).toEqual(['Customer Churn']);
  });
});
