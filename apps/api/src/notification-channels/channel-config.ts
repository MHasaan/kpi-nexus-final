/**
 * What a notification channel needs in its config before it can deliver
 * anything, and how to describe where it sends without revealing a secret.
 * Pure, so the rules can be tested without a database.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 50;

/** The recipients of an EMAIL channel, however the config spells them. */
export function emailRecipients(config: Record<string, unknown>): string[] {
  if (Array.isArray(config.recipients)) return config.recipients.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim());
  const single = config.fromAddress ?? config.to;
  return typeof single === 'string' && single.trim() !== '' ? [single.trim()] : [];
}

/**
 * Why this config cannot be saved for this kind of channel, or null. A channel
 * with nowhere to send used to be saved and then "succeed" at sending nothing.
 */
export function channelConfigProblem(kind: string, config: Record<string, unknown>): string | null {
  switch (kind) {
    case 'EMAIL': {
      const recipients = emailRecipients(config);
      if (recipients.length === 0) return 'Add at least one email address for this channel to send to.';
      if (recipients.length > MAX_RECIPIENTS) return `An email channel can have at most ${MAX_RECIPIENTS} recipients.`;
      const bad = recipients.find((r) => !EMAIL.test(r));
      return bad ? `"${bad}" is not an email address.` : null;
    }
    case 'SLACK':
    case 'TEAMS':
      return typeof config.webhookUrl === 'string' && config.webhookUrl.trim() !== '' ? null : 'Add the webhook URL this channel posts to.';
    case 'WEBHOOK':
      return typeof config.url === 'string' && config.url.trim() !== '' ? null : 'Add the URL this channel posts to.';
    default:
      return null;
  }
}

/**
 * Where a channel sends, for display: the email addresses, or only the host of
 * a webhook URL — the rest of such a URL is the credential.
 */
export function channelTarget(kind: string, config: Record<string, unknown>): string | null {
  if (kind === 'EMAIL') {
    const recipients = emailRecipients(config);
    return recipients.length > 0 ? recipients.join(', ') : null;
  }
  const url = kind === 'WEBHOOK' ? config.url : kind === 'SLACK' || kind === 'TEAMS' ? config.webhookUrl : undefined;
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Why a test through this channel cannot reach anyone even if the adapter reports no error, or null. */
export function channelCannotDeliver(kind: string, config: Record<string, unknown>): string | null {
  if (kind === 'SMS') return 'SMS is not connected: it needs a paid provider, which this installation does not use. Nothing was sent.';
  if (kind === 'IN_APP') return null;
  return channelConfigProblem(kind, config);
}
