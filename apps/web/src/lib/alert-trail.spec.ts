/**
 * Flow walk (alerts): the alert page's trail said "Level 1 · after 0m ·
 * 0 channels · 0 roles · 1 users", and under it "In-app  SENT" twice — one of
 * which was an email to a person. Each line now says who, and how.
 */
import { describe, expect, test } from 'vitest';

import { deliveryLine, narrowLevels } from './alert-trail';

const names = { people: [{ id: 'u1', fullName: 'Ada Admin' }], channels: [{ id: 'c1', name: 'Ops email' }] };
const delivery = (extra: Record<string, unknown>) => ({ channelId: null, targetUserId: null, kind: null, held: null, status: 'SENT', ...extra });

describe('deliveryLine', () => {
  test('says how it went and to whom', () => {
    expect(deliveryLine(delivery({}), names)).toEqual({ what: 'Shown in the app', state: 'Sent' });
    expect(deliveryLine(delivery({ targetUserId: 'u1', kind: 'EMAIL' }), names)).toEqual({ what: 'Email to Ada Admin', state: 'Sent' });
    expect(deliveryLine(delivery({ channelId: 'c1' }), names)).toEqual({ what: 'The Ops email channel', state: 'Sent' });
  });
  test('a person or channel whose name is not known is still said to be one', () => {
    expect(deliveryLine(delivery({ targetUserId: 'gone', kind: 'EMAIL' }), names).what).toBe('Email to one person');
    expect(deliveryLine(delivery({ channelId: 'gone' }), names).what).toBe('A channel');
    expect(deliveryLine(delivery({ targetUserId: 'u1', kind: 'SLACK' }), names).what).toBe('Slack to Ada Admin');
  });
  test('says why something has not gone yet, or that it failed', () => {
    expect(deliveryLine(delivery({ targetUserId: 'u1', kind: 'EMAIL', status: 'PENDING', held: 'DIGEST' }), names).state).toBe('Kept for their digest');
    expect(deliveryLine(delivery({ targetUserId: 'u1', kind: 'EMAIL', status: 'PENDING', held: 'MUTE_HOURS' }), names).state).toBe('Waiting for their mute hours to end');
    expect(deliveryLine(delivery({ status: 'PENDING' }), names).state).toBe('Waiting to be sent');
    expect(deliveryLine(delivery({ status: 'FAILED' }), names).state).toBe('Failed');
    expect(deliveryLine(delivery({ status: 'SUPPRESSED' }), names).state).toBe('Not sent (held back)');
  });
});

describe('narrowLevels', () => {
  test('reads a rule\'s steps as stored, and drops what is not a step', () => {
    expect(narrowLevels([{ delayMinutes: 30, channelIds: ['c1'], notifyRoleIds: ['r1'], notifyUserIds: ['u1', 7] }, null, 'x'])).toEqual([
      { delayMinutes: 30, channelIds: ['c1'], notifyRoleIds: ['r1'], notifyUserIds: ['u1'] },
      { delayMinutes: 0, channelIds: [], notifyRoleIds: [], notifyUserIds: [] },
      { delayMinutes: 0, channelIds: [], notifyRoleIds: [], notifyUserIds: [] },
    ]);
    expect(narrowLevels('nonsense')).toEqual([]);
  });
});
