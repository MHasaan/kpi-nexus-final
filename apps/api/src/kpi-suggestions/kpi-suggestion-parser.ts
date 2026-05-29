/**
 * Pure parser for the AI's KPI-suggestion JSON. Kept free of Nest/Prisma so the
 * fence-stripping, enum validation, and clamping logic is unit-testable. The
 * model occasionally wraps JSON in ```json fences or emits a bare array; both
 * are handled. Any suggestion with a missing required field or an invalid enum
 * is dropped (never throws — a bad response yields an empty list).
 */

const KPI_TYPES = ['NUMBER', 'PERCENTAGE', 'CURRENCY', 'DURATION', 'COUNT', 'RATING', 'BOOLEAN'];
const KPI_DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_IS_BEST', 'NEUTRAL'];
const KPI_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM',
  'REAL_TIME',
  'AD_HOC',
];
const QUADRANTS = ['FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_GROWTH'];

export interface KpiSuggestion {
  name: string;
  description: string;
  type: string;
  direction: string;
  scorecardQuadrant?: string;
  frequency?: string;
  unit?: string;
  suggestedTarget?: number;
  rationale?: string;
}

const MAX = 10;

/** Remove a leading/trailing ```json (or ```) code fence if present. */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fence ? fence[1]!.trim() : trimmed;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validate(entry: unknown): KpiSuggestion | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as Record<string, unknown>;
  if (!isNonEmptyString(e.name) || !isNonEmptyString(e.description)) return null;
  if (!isNonEmptyString(e.type) || !KPI_TYPES.includes(e.type)) return null;
  if (!isNonEmptyString(e.direction) || !KPI_DIRECTIONS.includes(e.direction)) return null;
  // Optional enums: present-but-invalid is a hard reject (don't silently coerce).
  if (e.frequency !== undefined && !(isNonEmptyString(e.frequency) && KPI_FREQUENCIES.includes(e.frequency))) {
    return null;
  }
  if (e.scorecardQuadrant !== undefined && !(isNonEmptyString(e.scorecardQuadrant) && QUADRANTS.includes(e.scorecardQuadrant))) {
    return null;
  }
  return {
    name: e.name.trim(),
    description: e.description.trim(),
    type: e.type,
    direction: e.direction,
    ...(e.frequency !== undefined ? { frequency: e.frequency as string } : {}),
    ...(e.scorecardQuadrant !== undefined ? { scorecardQuadrant: e.scorecardQuadrant as string } : {}),
    ...(isNonEmptyString(e.unit) ? { unit: e.unit } : {}),
    ...(typeof e.suggestedTarget === 'number' && Number.isFinite(e.suggestedTarget)
      ? { suggestedTarget: e.suggestedTarget }
      : {}),
    ...(isNonEmptyString(e.rationale) ? { rationale: e.rationale } : {}),
  };
}

export function parseKpiSuggestions(raw: string, count: number): KpiSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { suggestions?: unknown[] })?.suggestions)
      ? (parsed as { suggestions: unknown[] }).suggestions
      : [];
  const valid = list.map(validate).filter((s): s is KpiSuggestion => s !== null);
  const limit = Math.min(MAX, Math.max(1, Math.floor(count)));
  return valid.slice(0, limit);
}
