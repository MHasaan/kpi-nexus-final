import { describe, expect, test } from 'vitest';

import { adminAccountErrors, finishMessage, firstInvalidField } from './wizard-finish';

const good = { fullName: 'Sara Admin', email: 'sara@acme.test', password: 'correct-horse', confirm: 'correct-horse', slug: 'acme-inc' };

describe('adminAccountErrors', () => {
  test('a complete form has nothing wrong', () => {
    expect(adminAccountErrors(good)).toEqual({});
  });

  test('an empty form: every field says what it needs, but the missing password is one problem, not two', () => {
    expect(adminAccountErrors({ fullName: '', email: '', password: '', confirm: '', slug: '' })).toEqual({
      fullName: 'Enter your full name.',
      email: 'Enter your email.',
      password: 'Choose a password.',
      slug: 'Choose a web address.',
    });
  });

  test('a short password says how long it must be', () => {
    expect(adminAccountErrors({ ...good, password: 'short', confirm: 'short' }).password).toBe('Use at least 8 characters.');
  });

  test('the second password must match the first', () => {
    expect(adminAccountErrors({ ...good, confirm: 'correct-hrose' }).confirm).toBe('The two passwords are not the same.');
    expect(adminAccountErrors({ ...good, confirm: '' }).confirm).toBe('Type the password again.');
  });

  test.each(['Acme Inc', 'acme_inc', '-acme', 'acme-', 'acme--inc', 'ACME'])('"%s" is not a web address', (slug) => {
    expect(adminAccountErrors({ ...good, slug }).slug).toMatch(/lowercase/);
  });

  test.each(['acme', 'acme-inc', 'team-42', '7eleven'])('"%s" is', (slug) => {
    expect(adminAccountErrors({ ...good, slug }).slug).toBeUndefined();
  });

  test('an address that is not an address', () => {
    expect(adminAccountErrors({ ...good, email: 'sara@acme' }).email).toBe('Enter a valid email address.');
  });
});

describe('firstInvalidField', () => {
  test('follows the order of the form', () => {
    expect(firstInvalidField({ slug: 'x', password: 'y' })).toBe('password');
    expect(firstInvalidField({})).toBeNull();
  });
});

describe('finishMessage', () => {
  test('nobody invited: just that it is ready', () => {
    expect(finishMessage('Acme', {})).toEqual({ tone: 'success', title: 'Acme is ready' });
    expect(finishMessage('  ', { invites: [] }).title).toBe('Your organization is ready');
  });

  test('says how many invitations went out', () => {
    expect(finishMessage('Acme', { invites: [{ email: 'a@x.test', invited: true, emailSent: true }] }).description).toBe('One invitation was sent.');
    const three = Array.from({ length: 3 }, (_, i) => ({ email: `p${i}@x.test`, invited: true, emailSent: true }));
    expect(finishMessage('Acme', { invites: three }).description).toBe('3 invitations were sent.');
  });

  test('someone who could not be invited is named, and it is not called a success', () => {
    const message = finishMessage('Acme', {
      invites: [
        { email: 'a@x.test', invited: true, emailSent: true },
        { email: 'b@x.test', invited: false, error: 'boom' },
      ],
    });
    expect(message.tone).toBe('error');
    expect(message.title).toBe('Acme is ready');
    expect(message.description).toBe('b@x.test could not be invited. Open People to invite them again or resend.');
  });

  test('an invitation whose email did not go out is said', () => {
    const message = finishMessage('Acme', { invites: [{ email: 'a@x.test', invited: true, emailSent: false }, { email: 'b@x.test', invited: true, emailSent: false }] });
    expect(message.tone).toBe('error');
    expect(message.description).toContain('2 invitations were created but their emails did not go out.');
  });
});
