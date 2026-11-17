import { ORG_SIZE_TIERS, OnboardingDraftPatchSchema, validateOnboardingDraft } from '@kpi-nexus/contracts';
import { describe, expect, it } from 'vitest';

import { BUILTIN_TEMPLATES } from './builtins.js';
import { countPayload, validateTemplatePayload } from './template-payload.js';

describe('builtin templates', () => {
  it('has unique slugs', () => {
    const slugs = BUILTIN_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every builtin payload is referentially valid', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(validateTemplatePayload(t.payload), `${t.slug} should be valid`).toEqual([]);
    }
  });

  it('every builtin payload is a valid onboarding draft, so applying it can never be refused (plan 3.1)', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(OnboardingDraftPatchSchema.safeParse(t.payload).success, `${t.slug} has the draft shape`).toBe(true);
      expect(validateOnboardingDraft(t.payload), `${t.slug} is ready to complete`).toEqual([]);
    }
  });

  it('a template that states a size states one the organisation can store (plan 3.2a)', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const tier = t.payload.organization.sizeTier;
      if (tier !== undefined) expect(ORG_SIZE_TIERS as readonly string[], `${t.slug}: ${tier}`).toContain(tier);
    }
  });

  it('the rich SaaS template reproduces seed.ts depth (10/14/11/20/5)', () => {
    const rich = BUILTIN_TEMPLATES.find((t) => t.slug === 'saas-startup-rich')!;
    expect(rich.tier).toBe('rich');
    expect(countPayload(rich.payload)).toEqual({
      roles: 10,
      positions: 14,
      orgUnitTypes: 3,
      orgUnits: 11,
      kpiCategories: 5,
      kpis: 20,
    });
  });

  it('exactly one admin role per template', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.payload.roles.filter((r) => r.isAdmin)).toHaveLength(1);
    }
  });

  it('every KPI maps to a quadrant', () => {
    const rich = BUILTIN_TEMPLATES.find((t) => t.slug === 'saas-startup-rich')!;
    expect(rich.payload.kpis.every((k) => k.scorecardQuadrant)).toBe(true);
  });
});
