import { describe, expect, test } from 'vitest';

import {
  checkPasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
  describePasswordPolicy,
  passwordExpired,
  resolvePasswordPolicy,
} from './password-policy.js';

describe('checkPasswordPolicy', () => {
  test('accepts default-compliant password', () => {
    expect(checkPasswordPolicy('correcthorse')).toEqual([]);
  });

  test('rejects too-short password under default policy', () => {
    const violations = checkPasswordPolicy('short');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toMatch(/at least 8/);
  });

  test('layers multiple character-class requirements', () => {
    const violations = checkPasswordPolicy('alllowercase', {
      ...DEFAULT_PASSWORD_POLICY,
      requireUppercase: true,
      requireDigit: true,
      requireSpecial: true,
    });
    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.message).sort()).toEqual(
      [
        'must contain a digit',
        'must contain a special character',
        'must contain an uppercase letter',
      ].sort(),
    );
  });

  test('passes when all required classes are present', () => {
    expect(
      checkPasswordPolicy('Hunter2!', {
        ...DEFAULT_PASSWORD_POLICY,
        minLength: 6,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecial: true,
      }),
    ).toEqual([]);
  });
});

describe('resolvePasswordPolicy', () => {
  test('returns defaults when stored is null', () => {
    expect(resolvePasswordPolicy(null)).toEqual(DEFAULT_PASSWORD_POLICY);
  });

  test('returns defaults when stored is invalid', () => {
    expect(resolvePasswordPolicy({ minLength: 'oops' })).toEqual(DEFAULT_PASSWORD_POLICY);
  });

  test('honors stored overrides', () => {
    const resolved = resolvePasswordPolicy({
      minLength: 12,
      requireUppercase: true,
    });
    expect(resolved.minLength).toBe(12);
    expect(resolved.requireUppercase).toBe(true);
    expect(resolved.requireSpecial).toBe(false);
  });
});

describe('passwordExpired (plan 6.5)', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const policy = (maxAgeDays: number) => ({ ...DEFAULT_PASSWORD_POLICY, maxAgeDays });

  test('a maximum age of 0 never expires a password', () => {
    expect(passwordExpired(policy(0), daysAgo(4000), now)).toBe(false);
  });

  test('a password older than the maximum age has expired', () => {
    expect(passwordExpired(policy(90), daysAgo(91), now)).toBe(true);
    expect(passwordExpired(policy(90), daysAgo(89), now)).toBe(false);
  });

  test('a password with no recorded date has not expired: the clock has not started for it', () => {
    expect(passwordExpired(policy(90), null, now)).toBe(false);
  });
});

describe('describePasswordPolicy (plan 6.5)', () => {
  test('lists what a password needs, in words', () => {
    expect(describePasswordPolicy(DEFAULT_PASSWORD_POLICY)).toEqual(['at least 8 characters']);
    expect(
      describePasswordPolicy({ minLength: 10, requireUppercase: true, requireLowercase: true, requireDigit: true, requireSpecial: true, maxAgeDays: 90 }),
    ).toEqual(['at least 10 characters', 'an uppercase letter', 'a lowercase letter', 'a digit', 'a special character']);
  });
});
