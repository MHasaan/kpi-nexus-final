import type { OnboardingDraftInput } from '@kpi-nexus/contracts';

import { nameKey } from './wizard-structure';

type Draft = OnboardingDraftInput;
export type DraftKpiRow = NonNullable<Draft['kpis']>[number];

/** A new KPI row: in the first category, measured monthly for the whole organisation, higher is better. */
export function newKpi(draft: Draft): DraftKpiRow {
  return {
    name: '',
    category: (draft.kpiCategories ?? []).map((c) => c.name.trim()).find(Boolean) ?? '',
    scope: 'ORG_WIDE',
    type: 'NUMBER',
    direction: 'HIGHER_IS_BETTER',
    frequency: 'MONTHLY',
  };
}

/** Rename a category and move its KPIs with it. */
export function renameCategory(draft: Draft, index: number, name: string): Partial<Draft> {
  const categories = draft.kpiCategories ?? [];
  const from = nameKey(categories[index]?.name);
  const patch: Partial<Draft> = { kpiCategories: categories.map((c, i) => (i === index ? { ...c, name } : c)) };
  if (from && draft.kpis?.some((k) => nameKey(k.category) === from)) {
    patch.kpis = draft.kpis.map((k) => (nameKey(k.category) === from ? { ...k, category: name } : k));
  }
  return patch;
}

/** How many KPIs are in this category — a category in use cannot be removed. */
export function categoryUsage(draft: Draft, categoryName: string): number {
  const key = nameKey(categoryName);
  return key ? (draft.kpis ?? []).filter((k) => nameKey(k.category) === key).length : 0;
}

/** Change what a KPI is recorded for. Only a per-unit KPI is held by units, so leaving that scope lets them go. */
export function setKpiScope(kpi: DraftKpiRow, scope: NonNullable<DraftKpiRow['scope']>): DraftKpiRow {
  if (scope === 'PER_UNIT') return { ...kpi, scope };
  const { units: _dropped, ...rest } = kpi;
  return { ...rest, scope };
}

/** Add or remove one unit from the units that hold a per-unit KPI. None left means "the top-level units". */
export function toggleKpiUnit(kpi: DraftKpiRow, unitName: string): DraftKpiRow {
  const current = kpi.units ?? [];
  const key = nameKey(unitName);
  const next = current.some((u) => nameKey(u) === key) ? current.filter((u) => nameKey(u) !== key) : [...current, unitName];
  if (next.length > 0) return { ...kpi, units: next };
  const { units: _dropped, ...rest } = kpi;
  return rest;
}

/** A target typed into a field: a number, or no target. Text that is not a number is no target. */
export function targetFromInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Set, or clear, one optional field of a KPI without leaving an `undefined` behind. */
export function setKpiField<K extends keyof DraftKpiRow>(kpi: DraftKpiRow, field: K, value: DraftKpiRow[K] | undefined | ''): DraftKpiRow {
  if (value === undefined || value === '') {
    const { [field]: _dropped, ...rest } = kpi;
    return rest as DraftKpiRow;
  }
  return { ...kpi, [field]: value };
}

/** The top-level units — who holds a per-unit KPI when none are named. */
export function topLevelUnitNames(draft: Draft): string[] {
  const units = draft.orgUnits ?? [];
  const names = new Set(units.map((u) => nameKey(u.name)).filter(Boolean));
  return units.filter((u) => u.name.trim() && !(u.parent?.trim() && names.has(nameKey(u.parent)))).map((u) => u.name.trim());
}
