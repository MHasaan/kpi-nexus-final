import { describe, expect, test } from 'vitest';

import { decideDelivery, muteWindowEnd, readNotificationSettings } from './notification-preferences.js';

const at = (iso: string) => new Date(iso);

describe('readNotificationSettings', () => {
  test('reads what a person saved and ignores anything else', () => {
    expect(readNotificationSettings({ digestMode: 'DAILY', muteStart: '22:00', muteEnd: '07:00', mutedChannelKinds: ['EMAIL'], extra: 1 })).toEqual({
      digestMode: 'DAILY',
      muteStart: '22:00',
      muteEnd: '07:00',
      mutedChannelKinds: ['EMAIL'],
    });
  });

  test('nothing saved, or something unusable, means: send everything at once', () => {
    const none = { digestMode: 'OFF', muteStart: null, muteEnd: null, mutedChannelKinds: [] };
    expect(readNotificationSettings(null)).toEqual(none);
    expect(readNotificationSettings({ digestMode: 'HOURLY', muteStart: '25:99', muteEnd: 7 })).toEqual(none);
    // Half a window is no window.
    expect(readNotificationSettings({ muteStart: '22:00' })).toEqual(none);
  });
});

describe('muteWindowEnd', () => {
  test('inside a daytime window: the end of it, today', () => {
    expect(muteWindowEnd({ muteStart: '12:00', muteEnd: '14:00' }, at('2026-11-18T13:10:00Z'), 'UTC')).toEqual(at('2026-11-18T14:00:00Z'));
  });

  test('outside the window: nothing to wait for', () => {
    expect(muteWindowEnd({ muteStart: '12:00', muteEnd: '14:00' }, at('2026-11-18T14:00:00Z'), 'UTC')).toBeNull();
    expect(muteWindowEnd({ muteStart: '12:00', muteEnd: '14:00' }, at('2026-11-18T11:59:00Z'), 'UTC')).toBeNull();
  });

  test('an overnight window: late evening waits until tomorrow morning, early morning until this morning', () => {
    const night = { muteStart: '22:00', muteEnd: '07:00' };
    expect(muteWindowEnd(night, at('2026-11-18T23:30:00Z'), 'UTC')).toEqual(at('2026-11-19T07:00:00Z'));
    expect(muteWindowEnd(night, at('2026-11-18T03:00:00Z'), 'UTC')).toEqual(at('2026-11-18T07:00:00Z'));
    expect(muteWindowEnd(night, at('2026-11-18T12:00:00Z'), 'UTC')).toBeNull();
  });

  test("the hours are the person's own: 23:30 in Karachi is 18:30 UTC", () => {
    const night = { muteStart: '22:00', muteEnd: '07:00' };
    // 18:30 UTC = 23:30 in Karachi: muted until 07:00 Karachi = 02:00 UTC the next day.
    expect(muteWindowEnd(night, at('2026-11-18T18:30:00Z'), 'Asia/Karachi')).toEqual(at('2026-11-19T02:00:00Z'));
    // 18:30 UTC is not night in UTC.
    expect(muteWindowEnd(night, at('2026-11-18T18:30:00Z'), 'UTC')).toBeNull();
  });

  test('no window set: nothing to wait for', () => {
    expect(muteWindowEnd({ muteStart: null, muteEnd: null }, at('2026-11-18T23:30:00Z'), 'UTC')).toBeNull();
  });
});

describe('decideDelivery', () => {
  const now = at('2026-11-18T23:30:00Z');
  const base = { digestMode: 'OFF' as const, muteStart: null, muteEnd: null, mutedChannelKinds: [] as string[] };

  test('nothing set: send now', () => {
    expect(decideDelivery(base, 'EMAIL', now, 'UTC')).toEqual({ action: 'send' });
  });

  test('a muted kind is not sent at all', () => {
    expect(decideDelivery({ ...base, mutedChannelKinds: ['EMAIL'] }, 'EMAIL', now, 'UTC')).toEqual({ action: 'suppress' });
    expect(decideDelivery({ ...base, mutedChannelKinds: ['SLACK'] }, 'EMAIL', now, 'UTC')).toEqual({ action: 'send' });
  });

  test('a digest collects the email instead of sending it', () => {
    expect(decideDelivery({ ...base, digestMode: 'DAILY' }, 'EMAIL', now, 'UTC')).toEqual({ action: 'digest' });
    expect(decideDelivery({ ...base, digestMode: 'WEEKLY' }, 'EMAIL', now, 'UTC')).toEqual({ action: 'digest' });
  });

  test('inside the mute hours the email waits until they end', () => {
    expect(decideDelivery({ ...base, muteStart: '22:00', muteEnd: '07:00' }, 'EMAIL', now, 'UTC')).toEqual({ action: 'wait', until: at('2026-11-19T07:00:00Z') });
  });

  test('muted wins over digest, and digest over mute hours', () => {
    const all = { digestMode: 'DAILY' as const, muteStart: '22:00', muteEnd: '07:00', mutedChannelKinds: ['EMAIL'] };
    expect(decideDelivery(all, 'EMAIL', now, 'UTC')).toEqual({ action: 'suppress' });
    expect(decideDelivery({ ...all, mutedChannelKinds: [] }, 'EMAIL', now, 'UTC')).toEqual({ action: 'digest' });
  });
});
