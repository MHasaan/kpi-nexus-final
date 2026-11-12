import { ALL_PERMISSIONS } from '@kpi-nexus/contracts';

import type { TemplatePayload } from '../org-templates/template-payload.js';

/**
 * Pure parser for the AI generator's org JSON. Strips ```json fences, parses,
 * and coerces missing sections to empty arrays so the result is always a
 * well-shaped (possibly partial) TemplatePayload — never throws. Enum validation
 * happens downstream via validateTemplatePayload when the user applies it.
 */

export type PartialTemplatePayload = Partial<TemplatePayload> & {
  roles: TemplatePayload['roles'];
  positions: TemplatePayload['positions'];
  orgUnitTypes: TemplatePayload['orgUnitTypes'];
  orgUnits: TemplatePayload['orgUnits'];
  kpiCategories: TemplatePayload['kpiCategories'];
  kpis: TemplatePayload['kpis'];
};

function stripFences(raw: string): string {
  // Strip a leading ```json (or ```) and a trailing ``` independently — the
  // model sometimes omits the closing fence (e.g. when truncated).
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const PERMISSION_KEYS: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

/** The model invents permission names ("all", "kpi:read"); keep only real keys. */
function withCanonicalPermissions(roles: TemplatePayload['roles']): TemplatePayload['roles'] {
  return roles.map((r) => ({
    ...r,
    permissions: arr<unknown>(r?.permissions).filter((k): k is string => typeof k === 'string' && PERMISSION_KEYS.has(k)),
  }));
}

export function parseGeneratedOrg(raw: string): PartialTemplatePayload {
  let parsed: Record<string, unknown> = {};
  try {
    const p: unknown = JSON.parse(stripFences(raw));
    if (p && typeof p === 'object') parsed = p as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const org = parsed.organization as TemplatePayload['organization'] | undefined;
  return {
    ...(org && typeof org === 'object' && org.name ? { organization: org } : {}),
    roles: withCanonicalPermissions(arr(parsed.roles)),
    positions: arr(parsed.positions),
    orgUnitTypes: arr(parsed.orgUnitTypes),
    orgUnits: arr(parsed.orgUnits),
    kpiCategories: arr(parsed.kpiCategories),
    kpis: arr(parsed.kpis),
  };
}
