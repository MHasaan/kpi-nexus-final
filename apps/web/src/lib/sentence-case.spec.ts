import { describe, expect, it } from 'vitest';

import { inSentence } from './sentence-case';

describe('inSentence (QA-L16)', () => {
  it('lowercases an ordinary label', () => {
    expect(inSentence('Dashboard')).toBe('dashboard');
    expect(inSentence('Team Member')).toBe('team member');
  });

  it('keeps an acronym, with or without a plural ending', () => {
    expect(inSentence('KPI')).toBe('KPI');
    expect(inSentence('KPIs')).toBe('KPIs');
    expect(inSentence('OKR')).toBe('OKR');
    expect(inSentence('Key KPI')).toBe('key KPI');
  });

  it('a single capital is not an acronym', () => {
    expect(inSentence('A Goal')).toBe('a goal');
  });
});
