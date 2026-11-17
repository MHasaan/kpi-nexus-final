import { describe, expect, test } from 'vitest';

import { cronProblem, horizonProblem, recipientsProblem } from './form-checks';

describe('cronProblem', () => {
  test('five parts pass', () => {
    expect(cronProblem('0 8 * * 1')).toBeNull();
    expect(cronProblem('  */15 9-17 * * MON-FRI ')).toBeNull();
  });

  test('says how many parts there should be, and how many there are', () => {
    expect(cronProblem('0 8 * *')).toMatch(/five parts.*This one has 4/);
    expect(cronProblem('')).toMatch(/Type a schedule/);
  });

  test('names the part that is wrong', () => {
    expect(cronProblem('0 8 * * every-monday!')).toBe('"every-monday!" is not a valid part of a schedule.');
  });
});

describe('horizonProblem', () => {
  test('a whole number from 1 to 365', () => {
    expect(horizonProblem('14')).toBeNull();
    expect(horizonProblem('365')).toBeNull();
    expect(horizonProblem('')).toMatch(/whole number/);
    expect(horizonProblem('2.5')).toMatch(/whole number/);
    expect(horizonProblem('soon')).toMatch(/whole number/);
    expect(horizonProblem('0')).toMatch(/between 1 and 365/);
    expect(horizonProblem('400')).toMatch(/between 1 and 365/);
  });
});

describe('recipientsProblem', () => {
  test('at least one, each a real address', () => {
    expect(recipientsProblem(['a@acme.test', ' '])).toBeNull();
    expect(recipientsProblem(['', '  '])).toMatch(/at least one/);
    expect(recipientsProblem(['a@acme.test', 'bob'])).toBe('"bob" is not an email address.');
  });
});
