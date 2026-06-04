import { describe, expect, test } from 'vitest';

import { DOMAIN_DEFAULT_SCOPE, scopedUserIds } from './domain-visibility.js';

const CTX = { userId: 'u1', directReportIds: ['r1', 'r2'], unitMemberUserIds: ['m1', 'u1'] };

describe('DOMAIN_DEFAULT_SCOPE (parity defaults)', () => {
  test('reproduces today per domain', () => {
    expect(DOMAIN_DEFAULT_SCOPE.KPIS).toBe('UNITS');
    expect(DOMAIN_DEFAULT_SCOPE.DASHBOARDS).toBe('SELF');
    expect(DOMAIN_DEFAULT_SCOPE.TASKS).toBe('SELF');
    expect(DOMAIN_DEFAULT_SCOPE.OKRS).toBe('ORG');
    expect(DOMAIN_DEFAULT_SCOPE.REPORTS).toBe('ORG');
    expect(DOMAIN_DEFAULT_SCOPE.ALERTS).toBe('ORG');
  });
});

describe('scopedUserIds', () => {
  test('ORG ⇒ null (no user filter)', () => {
    expect(scopedUserIds('ORG', CTX)).toBeNull();
  });
  test('SELF ⇒ just me', () => {
    expect(scopedUserIds('SELF', CTX)).toEqual(['u1']);
  });
  test('DIRECT_REPORTS ⇒ me ∪ reports (deduped)', () => {
    expect(new Set(scopedUserIds('DIRECT_REPORTS', CTX))).toEqual(new Set(['u1', 'r1', 'r2']));
  });
  test('UNITS ⇒ me ∪ reports ∪ unit members (deduped)', () => {
    expect(new Set(scopedUserIds('UNITS', CTX))).toEqual(new Set(['u1', 'r1', 'r2', 'm1']));
  });
});
