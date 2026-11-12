import { describe, expect, it } from 'vitest';

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
