import { describe, expect, it } from 'vitest';

import { OnboardingDraftPatchSchema } from '@kpi-nexus/contracts';

import { ONBOARDING_AI_LIMITS, limitFor } from './onboarding-ai-limits.js';
import { parseGeneratedOrg } from './parse-generated-org.js';

describe('onboarding AI per-mode rate limits', () => {
  it('defines the four mode limits per hour', () => {
    expect(limitFor('generator')).toEqual({ limit: 5, windowSec: 3600 });
    expect(limitFor('assistant')).toEqual({ limit: 30, windowSec: 3600 });
    expect(limitFor('suggest')).toEqual({ limit: 60, windowSec: 3600 });
    expect(limitFor('explain')).toEqual({ limit: 100, windowSec: 3600 });
  });

  it('exposes all four modes', () => {
    expect(Object.keys(ONBOARDING_AI_LIMITS).sort()).toEqual(['assistant', 'explain', 'generator', 'suggest']);
  });
});

describe('parseGeneratedOrg', () => {
  const valid = {
    organization: { name: 'Acme', industry: 'Software' },
    roles: [{ name: 'Admin', isAdmin: true, level: 100, permissions: [] }],
    positions: [{ name: 'CEO', track: 'EXECUTIVE' }],
    orgUnitTypes: [{ name: 'Company', dimension: 'functional' }],
    orgUnits: [{ name: 'Acme', type: 'Company' }],
    kpiCategories: [{ name: 'Financial' }],
    kpis: [{ name: 'MRR', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY' }],
  };

  it('parses a clean org JSON', () => {
    const out = parseGeneratedOrg(JSON.stringify(valid));
    expect(out.organization?.name).toBe('Acme');
    expect(out.roles).toHaveLength(1);
    expect(out.kpis).toHaveLength(1);
  });

  it('strips ```json fences', () => {
    const out = parseGeneratedOrg('```json\n' + JSON.stringify(valid) + '\n```');
    expect(out.roles).toHaveLength(1);
  });

  it('strips a leading fence even when the closing fence is missing', () => {
    const out = parseGeneratedOrg('```json\n' + JSON.stringify(valid));
    expect(out.roles).toHaveLength(1);
  });

  it('returns an empty-but-shaped payload on malformed JSON (never throws)', () => {
    const out = parseGeneratedOrg('the model rambled without json');
    expect(out.roles).toEqual([]);
    expect(out.kpis).toEqual([]);
    expect(out.organization).toBeUndefined();
  });

  it('coerces missing sections to empty arrays', () => {
    const out = parseGeneratedOrg(JSON.stringify({ organization: { name: 'X' } }));
    expect(out.organization?.name).toBe('X');
    expect(out.roles).toEqual([]);
    expect(out.positions).toEqual([]);
  });
});

// Real Gemini (2026-11-20) wrote the top org unit's parent as null — "no parent". The draft takes a missing
// field, not null, so applying the proposal was refused as "not a valid onboarding draft" and Generate came to
// nothing. A field the model left empty is now left out.
describe('parseGeneratedOrg — fields the model left empty (null)', () => {
  const generated = {
    organization: { name: 'Lahore Bites', industry: 'Food Delivery', type: null },
    roles: [{ name: 'Administrator', isAdmin: true, level: 1, permissions: [] }],
    positions: [{ name: 'Delivery Rider', track: 'INDIVIDUAL_CONTRIBUTOR' }],
    orgUnitTypes: [{ name: 'Company', dimension: null }, { name: 'Department', dimension: 'functional' }],
    orgUnits: [
      { name: 'Lahore Bites HQ', type: 'Company', parent: null },
      { name: 'Central Kitchen', type: 'Department', parent: 'Lahore Bites HQ' },
    ],
    kpiCategories: [{ name: 'Delivery Operations' }],
    kpis: [{ name: 'Daily Order Volume', category: 'Delivery Operations', scope: 'ORG_WIDE', type: 'COUNT', direction: 'HIGHER_IS_BETTER', frequency: 'DAILY', unit: null, scorecardQuadrant: null }],
  };

  it('leaves out every field the model set to null, and keeps the ones it filled in', () => {
    const out = parseGeneratedOrg(JSON.stringify(generated));
    expect(out.orgUnits).toEqual([
      { name: 'Lahore Bites HQ', type: 'Company' },
      { name: 'Central Kitchen', type: 'Department', parent: 'Lahore Bites HQ' },
    ]);
    expect(out.organization).toEqual({ name: 'Lahore Bites', industry: 'Food Delivery' });
    expect(out.orgUnitTypes[0]).toEqual({ name: 'Company' });
    expect(out.kpis[0]).not.toHaveProperty('unit');
    expect(out.kpis[0]).not.toHaveProperty('scorecardQuadrant');
  });

  it('gives a proposal the draft accepts, so applying it works', () => {
    const out = parseGeneratedOrg(JSON.stringify(generated));
    expect(OnboardingDraftPatchSchema.safeParse(out).success).toBe(true);
  });
});

// The model is now asked for a KPI's target and units. A target written as text ("3%") or units written as one
// name would make the draft refuse the whole proposal, as null fields did: they are read where they can be, and
// left out where they cannot.
describe('parseGeneratedOrg — KPI targets and units', () => {
  const kpi = (extra: Record<string, unknown>) => ({ name: 'Fabric Wastage', category: 'Production', scope: 'PER_UNIT', ...extra });

  it('keeps a numeric target, reads one written as text, and leaves out one that is not a number', () => {
    const out = parseGeneratedOrg(
      JSON.stringify({ kpis: [kpi({ targetValue: 3 }), kpi({ targetValue: '3%' }), kpi({ targetValue: '1,200' }), kpi({ targetValue: 'high' }), kpi({ targetValue: '' })] }),
    );
    expect(out.kpis.map((k) => (k as { targetValue?: number }).targetValue)).toEqual([3, 3, 1200, undefined, undefined]);
    expect(out.kpis[3]).not.toHaveProperty('targetValue');
  });

  it('keeps a list of unit names, reads one name as a list, and leaves out anything else', () => {
    const out = parseGeneratedOrg(
      JSON.stringify({ kpis: [kpi({ units: ['Cutting', 'Stitching'] }), kpi({ units: 'Cutting' }), kpi({ units: [7, 'Finishing'] }), kpi({ units: 5 })] }),
    );
    expect(out.kpis.map((k) => (k as { units?: string[] }).units)).toEqual([['Cutting', 'Stitching'], ['Cutting'], ['Finishing'], undefined]);
  });

  it('gives a proposal the draft accepts', () => {
    const out = parseGeneratedOrg(JSON.stringify({ kpis: [kpi({ targetValue: '3%', units: 'Cutting' }), kpi({ targetValue: 'high', units: 5 })] }));
    expect(OnboardingDraftPatchSchema.safeParse({ kpis: out.kpis }).success).toBe(true);
  });
});

// Real Gemini invented role permissions ("all", "view_clinical", "kpi:read"),
// which were stored as-is, so non-admin roles in an AI-built org got no real
// access. Only the canonical keys survive parsing.
describe('parseGeneratedOrg — role permissions', () => {
  it('keeps canonical permission keys and drops invented ones', () => {
    const out = parseGeneratedOrg(
      JSON.stringify({
        roles: [
          { name: 'Admin', isAdmin: true, level: 5, permissions: ['all'] },
          { name: 'CMO', isAdmin: false, level: 4, permissions: ['KPI_VIEW', 'view_clinical', 'DASHBOARD_VIEW', 'kpi:read'] },
          { name: 'Odd', isAdmin: false, level: 1 },
        ],
      }),
    );
    expect(out.roles.map((r) => r.permissions)).toEqual([[], ['KPI_VIEW', 'DASHBOARD_VIEW'], []]);
  });
});
