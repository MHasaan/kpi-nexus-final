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

/**
 * The same value with every field the model set to null left out, at any depth. A model writes "no value" as
 * null ("parent": null for the top unit); the draft takes a missing field and refuses null, so a whole
 * proposal used to be refused over one empty field.
 */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(withoutNulls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null).map(([k, v]) => [k, withoutNulls(v)]));
  }
  return value;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (withoutNulls(v) as T[]) : []);

const PERMISSION_KEYS: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

/** The model invents permission names ("all", "kpi:read"); keep only real keys. */
function withCanonicalPermissions(roles: TemplatePayload['roles']): TemplatePayload['roles'] {
  return roles.map((r) => ({
    ...r,
    permissions: arr<unknown>(r?.permissions).filter((k): k is string => typeof k === 'string' && PERMISSION_KEYS.has(k)),
  }));
}

/** A target the model wrote as text ("3%", "1,200") as a number; null when it is not one. */
function targetNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[%,\s]/g, '');
  const n = digits === '' ? Number.NaN : Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * A KPI's target and units in the shapes the draft takes. Written any other way ("3%", one unit's name), they
 * made the draft refuse the whole proposal, as null fields did; each is read where it can be and left out where
 * it cannot.
 */
function withUsableKpiFields(kpis: TemplatePayload['kpis']): TemplatePayload['kpis'] {
  return kpis.map((k) => {
    const { targetValue, units, ...rest } = k as TemplatePayload['kpis'][number] & { targetValue?: unknown; units?: unknown };
    const target = targetValue === undefined ? null : targetNumber(targetValue);
    const names = typeof units === 'string' ? [units] : Array.isArray(units) ? units.filter((u): u is string => typeof u === 'string') : [];
    return { ...rest, ...(target !== null ? { targetValue: target } : {}), ...(names.length > 0 ? { units: names } : {}) };
  });
}

export function parseGeneratedOrg(raw: string): PartialTemplatePayload {
  let parsed: Record<string, unknown> = {};
  try {
    const p: unknown = JSON.parse(stripFences(raw));
    if (p && typeof p === 'object') parsed = p as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const org = withoutNulls(parsed.organization) as TemplatePayload['organization'] | undefined;
  return {
    ...(org && typeof org === 'object' && org.name ? { organization: org } : {}),
    roles: withCanonicalPermissions(arr(parsed.roles)),
    positions: arr(parsed.positions),
    orgUnitTypes: arr(parsed.orgUnitTypes),
    orgUnits: arr(parsed.orgUnits),
    kpiCategories: arr(parsed.kpiCategories),
    kpis: withUsableKpiFields(arr(parsed.kpis)),
  };
}
