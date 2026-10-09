import { describe, expect, test } from 'vitest';

import { DOMAIN_DEFAULT_SCOPE, scopedOrgUnitIds, scopedUserIds } from './domain-visibility.js';

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

  test('PEOPLE / ORG / ANALYTICS default to ORG, so enforcing them changes nothing until an admin narrows them (BE-004)', () => {
    expect(DOMAIN_DEFAULT_SCOPE.PEOPLE).toBe('ORG');
    expect(DOMAIN_DEFAULT_SCOPE.ORG).toBe('ORG');
    expect(DOMAIN_DEFAULT_SCOPE.ANALYTICS).toBe('ORG');
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

describe('scopedOrgUnitIds (BE-004 ORG domain)', () => {
  // eng > eng-be > eng-be-platform ; eng > eng-fe ; sales > sales-emea ; ops
  const UNITS = [
    { id: 'eng', parentUnitId: null },
    { id: 'eng-be', parentUnitId: 'eng' },
    { id: 'eng-be-platform', parentUnitId: 'eng-be' },
    { id: 'eng-fe', parentUnitId: 'eng' },
    { id: 'sales', parentUnitId: null },
    { id: 'sales-emea', parentUnitId: 'sales' },
    { id: 'ops', parentUnitId: null },
  ];
  const ctx = { ownUnitIds: ['eng-be'], reportUnitIds: ['sales-emea'], units: UNITS };
  const sorted = (xs: string[] | null) => (xs ? [...xs].sort() : xs);

  test('ORG ⇒ null (every unit)', () => {
    expect(scopedOrgUnitIds('ORG', ctx)).toBeNull();
  });
  test('SELF ⇒ the units I belong to or manage', () => {
    expect(sorted(scopedOrgUnitIds('SELF', ctx))).toEqual(['eng-be']);
  });
  test("DIRECT_REPORTS ⇒ mine ∪ my reports' units", () => {
    expect(sorted(scopedOrgUnitIds('DIRECT_REPORTS', ctx))).toEqual(['eng-be', 'sales-emea']);
  });
  test('UNITS ⇒ mine ∪ all their descendants (not siblings or parents)', () => {
    expect(sorted(scopedOrgUnitIds('UNITS', ctx))).toEqual(['eng-be', 'eng-be-platform']);
  });
  test('a legacy parent cycle cannot loop forever', () => {
    const cyclic = [
      { id: 'a', parentUnitId: 'b' },
      { id: 'b', parentUnitId: 'a' },
    ];
    expect(sorted(scopedOrgUnitIds('UNITS', { ownUnitIds: ['a'], reportUnitIds: [], units: cyclic }))).toEqual(['a', 'b']);
  });
  test('no memberships ⇒ no units below ORG', () => {
    expect(scopedOrgUnitIds('UNITS', { ownUnitIds: [], reportUnitIds: [], units: UNITS })).toEqual([]);
  });
});
