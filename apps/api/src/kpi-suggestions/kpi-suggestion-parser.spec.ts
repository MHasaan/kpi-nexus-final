import { describe, expect, it } from 'vitest';

import { parseKpiSuggestions } from './kpi-suggestion-parser.js';

const valid = {
  suggestions: [
    {
      name: 'Monthly Recurring Revenue',
      description: 'Total predictable monthly revenue',
      type: 'CURRENCY',
      direction: 'HIGHER_IS_BETTER',
      scorecardQuadrant: 'FINANCIAL',
      frequency: 'MONTHLY',
      unit: 'USD',
      suggestedTarget: 100000,
      rationale: 'Core SaaS health metric',
    },
  ],
};

describe('parseKpiSuggestions (strip fences, validate enums, drop invalid, clamp)', () => {
  it('parses a clean suggestions object', () => {
    const out = parseKpiSuggestions(JSON.stringify(valid), 5);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Monthly Recurring Revenue', type: 'CURRENCY', unit: 'USD' });
  });

  it('strips ```json fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(valid) + '\n```';
    expect(parseKpiSuggestions(fenced, 5)).toHaveLength(1);
  });

  it('returns [] on malformed JSON (fallback, never throws)', () => {
    expect(parseKpiSuggestions('the model rambled without json', 5)).toEqual([]);
    expect(parseKpiSuggestions('', 5)).toEqual([]);
  });

  it('drops a suggestion with an invalid enum value', () => {
    const bad = {
      suggestions: [
        { ...valid.suggestions[0], type: 'NOT_A_TYPE' },
        valid.suggestions[0],
      ],
    };
    const out = parseKpiSuggestions(JSON.stringify(bad), 5);
    expect(out).toHaveLength(1); // the bad one dropped
  });

  it('drops a suggestion missing name or description', () => {
    const bad = { suggestions: [{ type: 'NUMBER', direction: 'HIGHER_IS_BETTER' }] };
    expect(parseKpiSuggestions(JSON.stringify(bad), 5)).toEqual([]);
  });

  it('clamps the returned count to the requested count (max 10)', () => {
    const many = {
      suggestions: Array.from({ length: 20 }, (_, i) => ({
        ...valid.suggestions[0],
        name: `KPI ${i}`,
      })),
    };
    expect(parseKpiSuggestions(JSON.stringify(many), 3)).toHaveLength(3);
    expect(parseKpiSuggestions(JSON.stringify(many), 50)).toHaveLength(10); // hard cap 10
  });

  it('accepts a bare array without the {suggestions} wrapper', () => {
    expect(parseKpiSuggestions(JSON.stringify(valid.suggestions), 5)).toHaveLength(1);
  });

  it('drops an invalid frequency/quadrant but keeps valid required fields', () => {
    const bad = {
      suggestions: [{ name: 'X', description: 'd', type: 'NUMBER', direction: 'NEUTRAL', frequency: 'HOURLY' }],
    };
    // invalid frequency → suggestion dropped
    expect(parseKpiSuggestions(JSON.stringify(bad), 5)).toEqual([]);
  });
});
