/**
 * Shape of an org-template payload — the data that materializes into a full org
 * during onboarding (consumed by OnboardingService.complete). Pure types +
 * structure validation; no Prisma/Nest.
 */

export interface TemplateRole {
  name: string;
  isAdmin: boolean;
  level: number;
  color?: string;
  permissions: string[];
}

export interface TemplatePosition {
  name: string;
  track: 'MANAGEMENT' | 'INDIVIDUAL_CONTRIBUTOR' | 'EXECUTIVE';
}

export interface TemplateOrgUnitType {
  name: string;
  dimension: string;
}

export interface TemplateOrgUnit {
  name: string;
  type: string; // matches a TemplateOrgUnitType.name
  code?: string;
  parent?: string; // name of parent unit
}

export interface TemplateKpiCategory {
  name: string;
  color?: string;
}

export interface TemplateKpi {
  name: string;
  description?: string;
  category: string; // matches a TemplateKpiCategory.name
  scope: 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';
  type: 'NUMBER' | 'PERCENTAGE' | 'CURRENCY' | 'DURATION' | 'COUNT' | 'RATING' | 'BOOLEAN';
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_IS_BEST' | 'NEUTRAL';
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM' | 'REAL_TIME' | 'AD_HOC';
  unit?: string;
  scorecardQuadrant?: 'FINANCIAL' | 'CUSTOMER' | 'INTERNAL_PROCESS' | 'LEARNING_GROWTH';
}

export interface TemplatePayload {
  organization: { name: string; industry?: string; type?: string; sizeTier?: string };
  roles: TemplateRole[];
  positions: TemplatePosition[];
  orgUnitTypes: TemplateOrgUnitType[];
  orgUnits: TemplateOrgUnit[];
  kpiCategories: TemplateKpiCategory[];
  kpis: TemplateKpi[];
}

export interface PayloadCounts {
  roles: number;
  positions: number;
  orgUnitTypes: number;
  orgUnits: number;
  kpiCategories: number;
  kpis: number;
}

export function countPayload(p: TemplatePayload): PayloadCounts {
  return {
    roles: p.roles.length,
    positions: p.positions.length,
    orgUnitTypes: p.orgUnitTypes.length,
    orgUnits: p.orgUnits.length,
    kpiCategories: p.kpiCategories.length,
    kpis: p.kpis.length,
  };
}

/**
 * Referential-integrity check: every KPI's category exists, every unit's type
 * exists, and every unit parent (if set) exists. Returns the list of problems
 * (empty = valid).
 */
export function validateTemplatePayload(p: TemplatePayload): string[] {
  const problems: string[] = [];
  // Coalesce missing sections so a partial draft reports problems, never throws.
  const roles = p.roles ?? [];
  const kpis = p.kpis ?? [];
  const orgUnits = p.orgUnits ?? [];
  const orgUnitTypes = p.orgUnitTypes ?? [];
  const kpiCategories = p.kpiCategories ?? [];

  const catNames = new Set(kpiCategories.map((c) => c.name));
  const typeNames = new Set(orgUnitTypes.map((t) => t.name));
  const unitNames = new Set(orgUnits.map((u) => u.name));

  if (!p.organization?.name) problems.push('organization.name is required');
  if (!roles.some((r) => r.isAdmin)) problems.push('at least one admin role is required');

  for (const k of kpis) {
    if (!catNames.has(k.category)) problems.push(`KPI "${k.name}" references unknown category "${k.category}"`);
  }
  for (const u of orgUnits) {
    if (!typeNames.has(u.type)) problems.push(`unit "${u.name}" references unknown type "${u.type}"`);
    if (u.parent && !unitNames.has(u.parent)) problems.push(`unit "${u.name}" references unknown parent "${u.parent}"`);
  }
  return problems;
}
