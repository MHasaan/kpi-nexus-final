/** What the invite API tells us about one invitation (or a resend of it). */
export interface InviteOutcome {
  emailSent?: boolean;
  /** Only present outside production. */
  acceptUrl?: string;
}

export interface InviteFeedback {
  tone: 'success' | 'error';
  title: string;
  description: string;
  /** A link to hand over by other means, when the server gave us one. */
  url: string | null;
}

/**
 * What to tell the person who just invited someone (UI-016). "Sent" only when
 * the mail server took the message; otherwise say it did not go, and what to do
 * about it — never "invite created" with no word on whether anyone was told.
 */
export function inviteFeedback(outcome: InviteOutcome, email: string): InviteFeedback {
  const url = outcome.acceptUrl ?? null;
  if (outcome.emailSent === false) {
    return {
      tone: 'error',
      title: 'Invitation created, but the email was not sent',
      description: url
        ? `${email} has not been told. Share the link below with them yourself.`
        : `${email} has not been told. Check the email settings, then use Resend on their row.`,
      url,
    };
  }
  return {
    tone: 'success',
    title: 'Invitation sent',
    description: `${email} was emailed a one-time link to set a password.`,
    url,
  };
}

/**
 * When an invitation runs out, for the page that accepts it. Nobody is signed
 * in there, so no organisation's date settings apply: the time is written on
 * the reader's own clock, and says which clock that is ("Nov 26, 2026, 1:53 PM
 * GMT+5"). It used to be written in UTC without saying so.
 */
export function inviteExpiryText(expiresAt: string, locale?: string, timeZone?: string): string {
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(at);
}
