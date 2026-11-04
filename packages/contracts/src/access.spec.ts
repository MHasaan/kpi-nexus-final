import { describe, expect, test } from 'vitest';

import {
  AccessProfileSchema,
  DataLimitsConfigSchema,
  DataTypeConfigSchema,
  DomainSchema,
  ScopeConfigSchema,
  ScopeSchema,
  UserAccessOverrideSchema,
} from './access.js';

describe('AccessProfile contract', () => {
  const valid = {
    isAdmin: false,
    capabilities: ['KPI_VIEW', 'EXPORTS'],
    scopeByDomain: { KPIS: 'UNITS', DASHBOARDS: 'SELF' },
    dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: ['u1'], dashboardIds: null },
    dataLimits: { historyWindowDays: 90, maxListRows: null, maxExportRows: 5000 },
    context: { managedOrgUnitIds: ['u1'], memberOrgUnitIds: [], directReportIds: ['b', 'c'] },
    // Added to the contract by Phase 3.5 (resource grants) and Phase 7 (page
    // access); the fixture predated them, so this test failed (audit OT-002).
    resourceGrants: [{ resourceType: 'dashboard', resourceId: 'd1', action: 'view' }],
    pageAccess: { allow: null, deny: ['/settings'] },
  };

  test('parses a valid profile', () => {
    expect(AccessProfileSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects an unknown scope value', () => {
    const bad = { ...valid, scopeByDomain: { KPIS: 'EVERYTHING' } };
    expect(AccessProfileSchema.safeParse(bad).success).toBe(false);
  });

  test('rejects an unknown capability key', () => {
    const bad = { ...valid, capabilities: ['NOT_A_PERMISSION'] };
    expect(AccessProfileSchema.safeParse(bad).success).toBe(false);
  });

  test('Domain + Scope enums expose the expected members', () => {
    expect(DomainSchema.options).toContain('KPIS');
    expect(ScopeSchema.options).toEqual(['SELF', 'DIRECT_REPORTS', 'UNITS', 'ORG']);
  });

  test('ScopeConfig parses a partial per-domain map and rejects bad scopes', () => {
    expect(ScopeConfigSchema.safeParse({ KPIS: 'SELF', DASHBOARDS: 'ORG' }).success).toBe(true);
    expect(ScopeConfigSchema.safeParse({}).success).toBe(true);
    expect(ScopeConfigSchema.safeParse({ KPIS: 'EVERYTHING' }).success).toBe(false);
    expect(ScopeConfigSchema.safeParse({ NOPE: 'SELF' }).success).toBe(false);
  });

  test('DataTypeConfig parses category allowlist forms and rejects bad shapes', () => {
    expect(DataTypeConfigSchema.safeParse({ kpiCategoryIds: ['c1', 'c2'] }).success).toBe(true);
    expect(DataTypeConfigSchema.safeParse({ kpiCategoryIds: [] }).success).toBe(true);
    expect(DataTypeConfigSchema.safeParse({ kpiCategoryIds: null }).success).toBe(true);
    expect(DataTypeConfigSchema.safeParse({}).success).toBe(true);
    expect(DataTypeConfigSchema.safeParse({ kpiCategoryIds: 'nope' }).success).toBe(false);
    expect(DataTypeConfigSchema.safeParse({ kpiCategoryIds: [1, 2] }).success).toBe(false);
  });

  test('DataLimitsConfig parses partial limits and rejects non-positive/non-int', () => {
    expect(DataLimitsConfigSchema.safeParse({ historyWindowDays: 90 }).success).toBe(true);
    expect(DataLimitsConfigSchema.safeParse({ maxListRows: 100, maxExportRows: 5000 }).success).toBe(true);
    expect(DataLimitsConfigSchema.safeParse({ historyWindowDays: null }).success).toBe(true);
    expect(DataLimitsConfigSchema.safeParse({}).success).toBe(true);
    expect(DataLimitsConfigSchema.safeParse({ historyWindowDays: 0 }).success).toBe(false);
    expect(DataLimitsConfigSchema.safeParse({ historyWindowDays: -5 }).success).toBe(false);
    expect(DataLimitsConfigSchema.safeParse({ maxListRows: 1.5 }).success).toBe(false);
  });

  test('UserAccessOverride parses caps + nested configs; defaults empty cap arrays; rejects bad keys', () => {
    const full = UserAccessOverrideSchema.safeParse({
      grantCapabilities: ['KPI_VIEW'],
      revokeCapabilities: ['EXPORTS'],
      scopeConfig: { KPIS: 'SELF' },
      dataTypeConfig: { kpiCategoryIds: ['c1'] },
      dataLimits: { historyWindowDays: 30 },
    });
    expect(full.success).toBe(true);
    // caps default to [] when omitted
    const empty = UserAccessOverrideSchema.parse({});
    expect(empty.grantCapabilities).toEqual([]);
    expect(empty.revokeCapabilities).toEqual([]);
    // unknown capability key rejected
    expect(UserAccessOverrideSchema.safeParse({ grantCapabilities: ['NOT_A_PERM'] }).success).toBe(false);
    expect(UserAccessOverrideSchema.safeParse({ scopeConfig: { KPIS: 'NOPE' } }).success).toBe(false);
  });
});

describe('AccessProfile — later-phase layers are required', () => {
  const base = {
    isAdmin: false,
    capabilities: ['KPI_VIEW'],
    scopeByDomain: {},
    dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
    dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
    context: { managedOrgUnitIds: [], memberOrgUnitIds: [], directReportIds: [] },
    resourceGrants: [],
    pageAccess: { allow: null, deny: [] },
  };

  test('a profile without resourceGrants or pageAccess is rejected', () => {
    const { resourceGrants: _g, ...noGrants } = base;
    const { pageAccess: _p, ...noPages } = base;
    expect(AccessProfileSchema.safeParse(base).success).toBe(true);
    expect(AccessProfileSchema.safeParse(noGrants).success).toBe(false);
    expect(AccessProfileSchema.safeParse(noPages).success).toBe(false);
  });

  test('rejects an unknown resource action', () => {
    const bad = { ...base, resourceGrants: [{ resourceType: 'dashboard', resourceId: 'd1', action: 'own' }] };
    expect(AccessProfileSchema.safeParse(bad).success).toBe(false);
  });
});
