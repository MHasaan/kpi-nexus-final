import { describe, expect, test } from 'vitest';

import {
  checkPasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
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
