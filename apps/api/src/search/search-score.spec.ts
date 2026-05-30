import { describe, expect, test } from 'vitest';

import { scoreMatch } from './search-score.js';

describe('scoreMatch', () => {
  test('exact match → 1.0', () => {
    expect(scoreMatch('Revenue', 'revenue')).toBe(1.0);
  });
  test('prefix match → 0.8', () => {
    expect(scoreMatch('Revenue Growth', 'rev')).toBe(0.8);
  });
  test('substring match → 0.5', () => {
    expect(scoreMatch('Monthly Revenue', 'venue')).toBe(0.5);
  });
  test('no match → 0', () => {
    expect(scoreMatch('Churn', 'revenue')).toBe(0);
  });
  test('is case-insensitive and trims', () => {
    expect(scoreMatch('CHURN', '  churn ')).toBe(1.0);
  });
  test('empty query → 0', () => {
    expect(scoreMatch('anything', '')).toBe(0);
  });
});
