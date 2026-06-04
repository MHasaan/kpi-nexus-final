import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AccessProfile } from '@kpi-nexus/contracts';

// localStorage mock (set before importing ./access so the typeof window guards
// see a window). Mirrors permissions.spec.ts — the web suite runs in node env.
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => {
    store[key] = value;
  },
  removeItem: (key: string): void => {
    delete store[key];
  },
  clear: (): void => {
    for (const k of Object.keys(store)) delete store[k];
  },
};
vi.stubGlobal('window', { localStorage: localStorageMock });
vi.stubGlobal('localStorage', localStorageMock);

import {
  clearCachedAccessProfile,
  getCachedAccessProfile,
  scopeAtLeast,
  scopeForDomain,
  setCachedAccessProfile,
} from './access';

const adminProfile: AccessProfile = {
  isAdmin: true,
  capabilities: [],
  scopeByDomain: {},
  dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
  dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
  context: { managedOrgUnitIds: [], memberOrgUnitIds: [], directReportIds: [] },
  resourceGrants: [],
};

const managerProfile: AccessProfile = {
  ...adminProfile,
  isAdmin: false,
  scopeByDomain: { KPIS: 'UNITS', DASHBOARDS: 'SELF' },
};

describe('scopeForDomain', () => {
  test('admin always resolves to ORG', () => {
    expect(scopeForDomain(adminProfile, 'KPIS')).toBe('ORG');
  });
  test('non-admin returns the per-domain scope', () => {
    expect(scopeForDomain(managerProfile, 'KPIS')).toBe('UNITS');
  });
  test('unset domain + null profile default to ORG', () => {
    expect(scopeForDomain(managerProfile, 'REPORTS')).toBe('ORG');
    expect(scopeForDomain(null, 'KPIS')).toBe('ORG');
  });
});

describe('scopeAtLeast', () => {
  test('UNITS satisfies DIRECT_REPORTS but not ORG', () => {
    expect(scopeAtLeast(managerProfile, 'KPIS', 'DIRECT_REPORTS')).toBe(true);
    expect(scopeAtLeast(managerProfile, 'KPIS', 'ORG')).toBe(false);
  });
  test('SELF is the narrowest', () => {
    expect(scopeAtLeast(managerProfile, 'DASHBOARDS', 'SELF')).toBe(true);
    expect(scopeAtLeast(managerProfile, 'DASHBOARDS', 'UNITS')).toBe(false);
  });
});

describe('access-profile cache', () => {
  beforeEach(() => clearCachedAccessProfile());

  test('round-trips through localStorage', () => {
    setCachedAccessProfile(managerProfile);
    expect(getCachedAccessProfile()).toEqual(managerProfile);
  });
  test('returns null when absent', () => {
    expect(getCachedAccessProfile()).toBeNull();
  });
});
