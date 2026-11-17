import { describe, expect, test } from 'vitest';

import { directoryTab, successorCandidates, userActions } from './user-directory';

describe('directoryTab', () => {
  test('invited, active and suspended people are under Active', () => {
    for (const s of ['INVITED', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED']) expect(directoryTab(s), s).toBe('active');
  });
  test('only archived people are under Archived — a suspension is not a departure', () => {
    expect(directoryTab('ARCHIVED')).toBe('archived');
    expect(directoryTab('SUSPENDED')).not.toBe('archived');
  });
  test('purged and deleted people are in neither list', () => {
    expect(directoryTab('PURGED')).toBeNull();
    expect(directoryTab('DELETED')).toBeNull();
  });
});

describe('userActions', () => {
  test('an invitation can be resent or cancelled, not archived or suspended', () => {
    expect(userActions('INVITED')).toEqual(['edit', 'resend', 'cancel-invite']);
  });
  test('an active person can be suspended or archived', () => {
    expect(userActions('ACTIVE')).toEqual(['edit', 'suspend', 'archive']);
  });
  test('a suspended person can be reactivated or archived', () => {
    expect(userActions('SUSPENDED')).toEqual(['edit', 'reactivate', 'archive']);
  });
  test('an archived person can be restored or purged, not edited', () => {
    expect(userActions('ARCHIVED')).toEqual(['restore', 'purge']);
  });
  test('nothing can be done to someone purged', () => {
    expect(userActions('PURGED')).toEqual([]);
  });
});

describe('successorCandidates', () => {
  const people = [
    { id: 'leaver', status: 'ACTIVE' },
    { id: 'heir', status: 'ACTIVE' },
    { id: 'invited', status: 'INVITED' },
    { id: 'paused', status: 'SUSPENDED' },
  ];
  test('only active people, never the leaver — the API refuses anyone else', () => {
    expect(successorCandidates(people, 'leaver').map((p) => p.id)).toEqual(['heir']);
  });
});
