/** The administrator's own account, as the last step of setup holds it. */
export interface AdminAccountForm {
  fullName: string;
  email: string;
  password: string;
  confirm: string;
  slug: string;
}

export type AdminAccountErrors = Partial<Record<keyof AdminAccountForm, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** What the default password policy asks for (a new organisation has no policy of its own yet). */
export const PASSWORD_MIN_LENGTH = 8;

/** What is wrong with the account form, by field. Empty = ready to send. */
export function adminAccountErrors(form: AdminAccountForm): AdminAccountErrors {
  const errors: AdminAccountErrors = {};
  const name = form.fullName.trim();
  if (name.length < 2) errors.fullName = 'Enter your full name.';
  else if (name.length > 160) errors.fullName = 'That name is too long (160 characters at most).';

  const email = form.email.trim();
  if (!email) errors.email = 'Enter your email.';
  else if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.';

  if (form.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = form.password ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : 'Choose a password.';
  } else if (form.password.length > 200) {
    errors.password = 'That password is too long (200 characters at most).';
  }
  // Only compare once there is something to compare with: a missing password is one problem, not two.
  if (!errors.password && form.confirm !== form.password) {
    errors.confirm = form.confirm ? 'The two passwords are not the same.' : 'Type the password again.';
  }

  const slug = form.slug.trim();
  if (!slug) errors.slug = 'Choose a web address.';
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.slug = 'Use lowercase letters, numbers and single dashes, like acme-inc.';
  else if (slug.length > 120) errors.slug = 'That address is too long (120 characters at most).';
  return errors;
}

/** The first field with something wrong, in the order they appear on the form. */
export function firstInvalidField(errors: AdminAccountErrors): keyof AdminAccountForm | null {
  return (['fullName', 'email', 'password', 'confirm', 'slug'] as const).find((f) => errors[f]) ?? null;
}

export interface FinishOutcome {
  invites?: ReadonlyArray<{ email: string; invited: boolean; emailSent?: boolean; error?: string }>;
  welcomeEmailSent?: boolean;
}

export interface FinishMessage {
  tone: 'success' | 'error';
  title: string;
  description?: string;
}

/**
 * What to tell someone who has just finished setup. Success is the
 * organisation existing; an invitation that failed or did not go out is said
 * plainly, with what to do about it, because the organisation is not undone
 * for it.
 */
export function finishMessage(orgName: string, outcome: FinishOutcome): FinishMessage {
  const invites = outcome.invites ?? [];
  const failed = invites.filter((i) => !i.invited);
  const unsent = invites.filter((i) => i.invited && i.emailSent === false);
  const sent = invites.length - failed.length - unsent.length;
  const title = `${orgName.trim() || 'Your organization'} is ready`;

  if (failed.length > 0 || unsent.length > 0) {
    const parts: string[] = [];
    if (failed.length > 0) {
      parts.push(`${failed.length === 1 ? `${failed[0]!.email} could not be invited` : `${failed.length} people could not be invited (${failed.map((f) => f.email).join(', ')})`}.`);
    }
    if (unsent.length > 0) {
      parts.push(`${unsent.length === 1 ? 'One invitation was created but its email' : `${unsent.length} invitations were created but their emails`} did not go out.`);
    }
    parts.push('Open People to invite them again or resend.');
    return { tone: 'error', title, description: parts.join(' ') };
  }
  if (sent > 0) return { tone: 'success', title, description: `${sent === 1 ? 'One invitation was' : `${sent} invitations were`} sent.` };
  return { tone: 'success', title };
}
