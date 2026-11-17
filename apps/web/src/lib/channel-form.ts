import type { NotificationChannel } from './api-client';

/** The notification-channel form as data: what can be made, what is missing, and the request it sends. */

export type ChannelKind = NotificationChannel['kind'];
/** Kinds offered when adding a channel. SMS is left out: it needs a paid provider this product does not use. */
export type NewChannelKind = Exclude<ChannelKind, 'SMS'>;

export const CHANNEL_KINDS: ReadonlyArray<{ value: NewChannelKind; label: string; about: string }> = [
  { value: 'EMAIL', label: 'Email', about: 'Sends each alert to the addresses below.' },
  { value: 'SLACK', label: 'Slack', about: 'Posts to a Slack incoming-webhook URL.' },
  { value: 'TEAMS', label: 'Microsoft Teams', about: 'Posts a card to a Teams workflow webhook URL.' },
  { value: 'WEBHOOK', label: 'Webhook', about: 'Sends the alert as JSON to your own URL.' },
  { value: 'IN_APP', label: 'In the app', about: 'Records the alert as an in-app notification. Nothing to set up.' },
];

export const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = {
  EMAIL: 'Email',
  SLACK: 'Slack',
  TEAMS: 'Microsoft Teams',
  WEBHOOK: 'Webhook',
  IN_APP: 'In the app',
  SMS: 'SMS (not connected)',
};

export interface ChannelForm {
  name: string;
  kind: ChannelKind;
  /** Comma- or line-separated addresses (email). */
  recipients: string;
  /** Webhook URL (Slack, Teams, webhook). */
  url: string;
}

export const EMPTY_CHANNEL_FORM: ChannelForm = { name: '', kind: 'EMAIL', recipients: '', url: '' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const needsUrl = (kind: ChannelKind): boolean => kind === 'SLACK' || kind === 'TEAMS' || kind === 'WEBHOOK';

export function splitRecipients(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * The first thing wrong with the form, or null. When editing, a blank
 * recipients or URL box means "keep what is saved" and is not a problem.
 */
export function channelFormProblem(form: ChannelForm, editing = false): string | null {
  if (form.name.trim().length < 2) return 'Give the channel a name.';
  if (form.kind === 'EMAIL') {
    const recipients = splitRecipients(form.recipients);
    if (recipients.length === 0) return editing ? null : 'Add at least one email address.';
    const bad = recipients.find((r) => !EMAIL.test(r));
    if (bad) return `"${bad}" is not an email address.`;
  }
  if (needsUrl(form.kind)) {
    const url = form.url.trim();
    if (url === '') return editing ? null : 'Add the URL this channel posts to.';
    if (!/^https:\/\/\S+$/i.test(url)) return 'The URL must start with https://';
  }
  return null;
}

/** The config for the kind, or undefined when there is nothing typed to replace the saved one with. */
function channelConfig(form: ChannelForm): Record<string, unknown> | undefined {
  if (form.kind === 'EMAIL') {
    const recipients = splitRecipients(form.recipients);
    return recipients.length > 0 ? { recipients } : undefined;
  }
  if (needsUrl(form.kind)) {
    const url = form.url.trim();
    if (url === '') return undefined;
    return form.kind === 'WEBHOOK' ? { url } : { webhookUrl: url };
  }
  return undefined;
}

export function channelCreateBody(form: ChannelForm) {
  return { name: form.name.trim(), kind: form.kind, config: channelConfig(form) ?? {} };
}

/** Only what changed: the name, and where it sends if something new was typed. */
export function channelEditBody(channel: Pick<NotificationChannel, 'name'>, form: ChannelForm): { name?: string; config?: Record<string, unknown> } {
  const config = channelConfig(form);
  const name = form.name.trim();
  return { ...(name !== channel.name ? { name } : {}), ...(config ? { config } : {}) };
}

/** The form opened on an existing channel: its name, and blank boxes for a new destination. */
export function channelEditForm(channel: Pick<NotificationChannel, 'name' | 'kind' | 'target'>): ChannelForm {
  // Email addresses are not a secret, so they are shown to be edited; a webhook URL is, so its box starts empty.
  return { name: channel.name, kind: channel.kind, recipients: channel.kind === 'EMAIL' ? (channel.target ?? '') : '', url: '' };
}
