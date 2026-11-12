import { describe, expect, it } from 'vitest';

import { type TemplatePayload, countPayload, normalizeTemplatePayload, validateTemplatePayload } from './template-payload.js';

const base: TemplatePayload = {
  organization: { name: 'Acme' },
  roles: [{ name: 'Admin', isAdmin: true, level: 100, permissions: [] }],
  positions: [{ name: 'CEO', track: 'EXECUTIVE' }],
  orgUnitTypes: [{ name: 'Company', dimension: 'functional' }],
  orgUnits: [{ name: 'Acme', type: 'Company' }],
  kpiCategories: [{ name: 'Financial' }],
  kpis: [{ name: 'MRR', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY' }],
};

describe('validateTemplatePayload', () => {
  it('accepts a referentially-consistent payload', () => {
    expect(validateTemplatePayload(base)).toEqual([]);
  });

  it('flags a KPI referencing an unknown category', () => {
    const bad = { ...base, kpis: [{ ...base.kpis[0]!, category: 'Ghost' }] };
    expect(validateTemplatePayload(bad)).toContainEqual(expect.stringContaining('unknown category'));
  });

  it('flags a unit referencing an unknown type', () => {
    const bad = { ...base, orgUnits: [{ name: 'X', type: 'Nope' }] };
    expect(validateTemplatePayload(bad)).toContainEqual(expect.stringContaining('unknown type'));
  });

  it('flags a unit referencing an unknown parent', () => {
    const bad = { ...base, orgUnits: [{ name: 'Acme', type: 'Company' }, { name: 'Eng', type: 'Company', parent: 'Ghost' }] };
    expect(validateTemplatePayload(bad)).toContainEqual(expect.stringContaining('unknown parent'));
  });

  it('requires at least one admin role', () => {
    const bad = { ...base, roles: [{ name: 'Viewer', isAdmin: false, level: 10, permissions: [] }] };
    expect(validateTemplatePayload(bad)).toContainEqual(expect.stringContaining('admin role'));
  });

  it('does not throw on a partial/empty draft — reports problems instead', () => {
    const partial = { organization: { name: 'X' } } as unknown as TemplatePayload;
    const problems = validateTemplatePayload(partial);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems).toContainEqual(expect.stringContaining('admin role'));
  });

  it('counts payload sections', () => {
    expect(countPayload(base)).toEqual({ roles: 1, positions: 1, orgUnitTypes: 1, orgUnits: 1, kpiCategories: 1, kpis: 1 });
  });
});

// BE-001: the demo seed stored `saas-starter` in a legacy shape
// ({ roles: string[], units: string[], kpis: string[] } — no positions /
// orgUnitTypes / orgUnits / kpiCategories). countPayload threw on it, and one
// bad row 500'd GET /org-templates for everyone.
describe('malformed / legacy payloads (BE-001)', () => {
  const legacy = { roles: ['Administrator', 'Executive'], units: ['Sales'], kpis: ['MRR', 'NPS'] } as unknown;

  it('countPayload never throws; non-conforming entries are not counted', () => {
    expect(countPayload(legacy as TemplatePayload)).toEqual({
      roles: 0, positions: 0, orgUnitTypes: 0, orgUnits: 0, kpiCategories: 0, kpis: 0,
    });
    expect(countPayload(null as unknown as TemplatePayload)).toEqual({
      roles: 0, positions: 0, orgUnitTypes: 0, orgUnits: 0, kpiCategories: 0, kpis: 0,
    });
  });

  it('normalizeTemplatePayload yields the full shape with only well-formed entries', () => {
    const n = normalizeTemplatePayload(legacy);
    expect(n).toEqual({
      organization: { name: '' },
      roles: [], positions: [], orgUnitTypes: [], orgUnits: [], kpiCategories: [], kpis: [],
    });
    // and a normalized legacy payload fails validation cleanly instead of crashing
    expect(validateTemplatePayload(n)).toContain('at least one admin role is required');
  });

  it('normalizeTemplatePayload leaves a valid payload untouched', () => {
    expect(normalizeTemplatePayload(base)).toEqual(base);
  });
});

describe('validateTemplatePayload — role permissions', () => {
  it('rejects a role carrying a permission outside the canonical set', () => {
    const p: TemplatePayload = {
      ...base,
      roles: [...base.roles, { name: 'Quality Officer', isAdmin: false, level: 3, permissions: ['KPI_VIEW', 'kpi:write'] }],
    };
    expect(validateTemplatePayload(p)).toContain('role "Quality Officer" has unknown permission "kpi:write"');
  });

  it('accepts canonical permissions', () => {
    const p: TemplatePayload = {
      ...base,
      roles: [...base.roles, { name: 'Viewer', isAdmin: false, level: 1, permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'] }],
    };
    expect(validateTemplatePayload(p)).toEqual([]);
  });
});
