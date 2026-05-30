import { describe, expect, it } from 'vitest';

import { type TemplatePayload, countPayload, validateTemplatePayload } from './template-payload.js';

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

  it('counts payload sections', () => {
    expect(countPayload(base)).toEqual({ roles: 1, positions: 1, orgUnitTypes: 1, orgUnits: 1, kpiCategories: 1, kpis: 1 });
  });
});
