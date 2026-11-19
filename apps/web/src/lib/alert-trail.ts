import type { EscalationLevelInput } from './api-client';
import { humanize } from './labels';

/**
 * An alert's trail in words: who a rule's steps reach, and how each
 * notification went. The page said "Level 1 · after 0m · 0 channels · 0 roles ·
 * 1 users" and listed an email to a person as "In-app".
 */

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** A rule's steps as stored (`escalationRule.levels`, typed unknown). Anything that is not a list gives none. */
export function narrowLevels(levels: unknown): EscalationLevelInput[] {
  if (!Array.isArray(levels)) return [];
  return levels.map((raw) => {
    const level = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      delayMinutes: typeof level.delayMinutes === 'number' && Number.isFinite(level.delayMinutes) ? level.delayMinutes : 0,
      channelIds: strings(level.channelIds),
      notifyRoleIds: strings(level.notifyRoleIds),
      notifyUserIds: strings(level.notifyUserIds),
    };
  });
}

export interface TrailDelivery {
  channelId: string | null;
  targetUserId: string | null;
  /** How a notification addressed to a person went: EMAIL, SLACK… Null for a channel's or the in-app one. */
  kind?: string | null;
  /** Why a waiting one has not gone: DIGEST or MUTE_HOURS. */
  held?: string | null;
  status: string;
}

export interface TrailNames {
  people: ReadonlyArray<{ id: string; fullName: string }>;
  channels: ReadonlyArray<{ id: string; name: string }>;
}

const WAYS: Readonly<Record<string, string>> = { EMAIL: 'Email', SLACK: 'Slack', TEAMS: 'Teams', WEBHOOK: 'Webhook', SMS: 'Text message' };

/** One notification: what it was and to whom, and what became of it. */
export function deliveryLine(delivery: TrailDelivery, names: TrailNames): { what: string; state: string } {
  let what: string;
  if (delivery.channelId) {
    const channel = names.channels.find((c) => c.id === delivery.channelId)?.name;
    what = channel ? `The ${channel} channel` : 'A channel';
  } else if (delivery.targetUserId) {
    const person = names.people.find((p) => p.id === delivery.targetUserId)?.fullName ?? 'one person';
    const way = delivery.kind ? (WAYS[delivery.kind] ?? humanize(delivery.kind)) : 'Notification';
    what = `${way} to ${person}`;
  } else {
    what = 'Shown in the app';
  }

  let state: string;
  if (delivery.status === 'SENT') state = 'Sent';
  else if (delivery.status === 'FAILED') state = 'Failed';
  else if (delivery.status === 'SUPPRESSED') state = 'Not sent (held back)';
  else if (delivery.held === 'DIGEST') state = 'Kept for their digest';
  else if (delivery.held === 'MUTE_HOURS') state = 'Waiting for their mute hours to end';
  else state = 'Waiting to be sent';
  return { what, state };
}
