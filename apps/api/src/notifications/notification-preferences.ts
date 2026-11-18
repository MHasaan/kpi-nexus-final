/**
 * What a person's notification preferences do to a notification addressed to
 * them. Pure: no Prisma, no clock of its own.
 *
 *  - a muted kind is not sent at all;
 *  - a digest (daily / weekly) collects the notification instead of sending it;
 *  - inside the mute hours the notification waits until they end.
 */

export type DigestMode = 'OFF' | 'DAILY' | 'WEEKLY';

export interface PersonalNotificationSettings {
  digestMode: DigestMode;
  /** "HH:MM", in the person's own timezone. Both or neither. */
  muteStart: string | null;
  muteEnd: string | null;
  mutedChannelKinds: string[];
}

export const NO_NOTIFICATION_PREFERENCES: PersonalNotificationSettings = {
  digestMode: 'OFF',
  muteStart: null,
  muteEnd: null,
  mutedChannelKinds: [],
};

export type DeliveryDecision = { action: 'send' } | { action: 'suppress' } | { action: 'digest' } | { action: 'wait'; until: Date };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A person's saved preferences (free-form JSON on the user). Anything unusable is ignored. */
export function readNotificationSettings(stored: unknown): PersonalNotificationSettings {
  if (!stored || typeof stored !== 'object') return NO_NOTIFICATION_PREFERENCES;
  const s = stored as Record<string, unknown>;
  const time = (value: unknown): string | null => (typeof value === 'string' && TIME.test(value) ? value : null);
  const start = time(s.muteStart);
  const end = time(s.muteEnd);
  const window = start !== null && end !== null && start !== end;
  return {
    digestMode: s.digestMode === 'DAILY' || s.digestMode === 'WEEKLY' ? s.digestMode : 'OFF',
    muteStart: window ? start : null,
    muteEnd: window ? end : null,
    mutedChannelKinds: Array.isArray(s.mutedChannelKinds) ? s.mutedChannelKinds.filter((k): k is string => typeof k === 'string') : [],
  };
}

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutes since midnight at `now`, on the wall clock of `timezone`. */
function wallMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/**
 * When the mute hours that contain `now` end, or null when `now` is outside
 * them (or none are set). The hours are on the person's own clock.
 */
export function muteWindowEnd(settings: Pick<PersonalNotificationSettings, 'muteStart' | 'muteEnd'>, now: Date, timezone: string): Date | null {
  if (!settings.muteStart || !settings.muteEnd) return null;
  const start = minutesOf(settings.muteStart);
  const end = minutesOf(settings.muteEnd);
  const current = wallMinutes(now, timezone);
  const inside = start < end ? current >= start && current < end : current >= start || current < end;
  if (!inside) return null;
  // Minutes from now until the window's end, going forward on the clock.
  const wait = (end - current + 24 * 60) % (24 * 60);
  const until = new Date(now.getTime() + wait * 60_000);
  until.setUTCSeconds(0, 0);
  return until;
}

/** What to do with a notification of `kind` addressed to a person with these preferences. */
export function decideDelivery(settings: PersonalNotificationSettings, kind: string, now: Date, timezone: string): DeliveryDecision {
  if (settings.mutedChannelKinds.includes(kind)) return { action: 'suppress' };
  if (settings.digestMode !== 'OFF') return { action: 'digest' };
  const until = muteWindowEnd(settings, now, timezone);
  return until ? { action: 'wait', until } : { action: 'send' };
}
