export interface SignupEntryErrors {
  email?: string;
  orgName?: string;
}

// Deliberately simple: one @, something either side, a dot in the domain. The
// server and the invitation email are the real test of an address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with the two fields that start sign-up, by field. Empty = fine. */
export function signupEntryErrors(email: string, orgName: string): SignupEntryErrors {
  const errors: SignupEntryErrors = {};
  const e = email.trim();
  const o = orgName.trim();
  if (!e) errors.email = 'Enter your email.';
  else if (!EMAIL.test(e)) errors.email = 'Enter a valid email address, like you@company.com.';
  if (!o) errors.orgName = 'Enter a name for your organization.';
  else if (o.length < 2) errors.orgName = 'The organization name needs at least 2 characters.';
  else if (o.length > 120) errors.orgName = 'The organization name is too long (120 characters at most).';
  return errors;
}
