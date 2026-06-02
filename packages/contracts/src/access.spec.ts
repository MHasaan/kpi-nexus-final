import { describe, expect, test } from 'vitest';

import {
  AccessProfileSchema,
  DataTypeConfigSchema,
  DomainSchema,
  ScopeConfigSchema,
  ScopeSchema,
} from './access.js';

describe('AccessProfile contract', () => {
  const valid = {
    isAdmin: false,
    capabilities: ['KPI_VIEW', 'EXPORTS'],
    scopeByDomain: { KPIS: 'UNITS', DASHBOARDS: 'SELF' },
    dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: ['u1'], dashboardIds: null },
    dataLimits: { historyWindowDays: 90, maxListRows: null, maxExportRows: 5000 },
    context: { managedOrgUnitIds: ['u1'], memberOrgUnitIds: [], directReportIds: ['b', 'c'] },
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
});
