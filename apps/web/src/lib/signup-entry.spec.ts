import { describe, expect, test } from 'vitest';

import { signupEntryErrors } from './signup-entry';

describe('signupEntryErrors', () => {
  test('a real email and a name pass', () => {
    expect(signupEntryErrors('  you@company.com ', ' Acme Inc. ')).toEqual({});
  });

  test('both missing: each field says what it needs', () => {
    expect(signupEntryErrors('', '   ')).toEqual({
      email: 'Enter your email.',
      orgName: 'Enter a name for your organization.',
    });
  });

  test.each(['plainaddress', 'no@dot', '@nobody.com', 'two words@x.com', 'a@b@c.com'])('%s is not an email', (bad) => {
    expect(signupEntryErrors(bad, 'Acme').email).toMatch(/valid email/);
  });

  test('a one-letter or oversized name is refused', () => {
    expect(signupEntryErrors('a@b.co', 'A').orgName).toMatch(/at least 2/);
    expect(signupEntryErrors('a@b.co', 'x'.repeat(121)).orgName).toMatch(/too long/);
  });
});
