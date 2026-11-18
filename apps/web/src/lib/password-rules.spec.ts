import { describe, expect, it } from 'vitest';

import { ApiError } from './api-client';
import { passwordPolicyProblem, passwordRefusal } from './password-rules';

describe('passwordRefusal (plan 6.5)', () => {
  it('names each rule the password broke — the API sends them as objects, which used to print as "[object Object]"', () => {
    const err = new ApiError(400, 'Password does not meet policy', 'VALIDATION_ERROR', {
      violations: [
        { field: 'password', message: 'must be at least 12 characters' },
        { field: 'password', message: 'must contain a digit' },
      ],
    });
    expect(passwordRefusal(err, 'fallback')).toBe('The password must be at least 12 characters and must contain a digit.');
  });

  it('falls back to the API message when no rules are listed, and to the given text for anything else', () => {
    expect(passwordRefusal(new ApiError(404, 'Link expired'), 'fallback')).toBe('Link expired');
    expect(passwordRefusal(new Error('boom'), 'fallback')).toBe('fallback');
  });
});

describe('passwordPolicyProblem (plan 6.5)', () => {
  it('accepts a whole-number length from 6 to 128 and a whole-number age of 0 or more', () => {
    expect(passwordPolicyProblem({ minLength: 8, maxAgeDays: 0 })).toBeNull();
    expect(passwordPolicyProblem({ minLength: 128, maxAgeDays: 365 })).toBeNull();
  });

  it('names the field that is wrong — a blank field arrives as 0 or NaN', () => {
    expect(passwordPolicyProblem({ minLength: 0, maxAgeDays: 0 })).toContain('Minimum length');
    expect(passwordPolicyProblem({ minLength: Number.NaN, maxAgeDays: 0 })).toContain('Minimum length');
    expect(passwordPolicyProblem({ minLength: 7.5, maxAgeDays: 0 })).toContain('Minimum length');
    expect(passwordPolicyProblem({ minLength: 8, maxAgeDays: -1 })).toContain('Max age');
    expect(passwordPolicyProblem({ minLength: 8, maxAgeDays: Number.NaN })).toContain('Max age');
  });
});
