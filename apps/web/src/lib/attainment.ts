/**
 * How far a value has come towards a target, as a percentage — the rule the API
 * uses for a KPI (`attainmentPct` in apps/api/src/kpis/kpi-health.ts), for the
 * cases the page works out itself: a person's own figure against their own target.
 * Null when there is nothing to compare, or the direction has no better side.
 */
export function attainmentOf(value: number | null | undefined, target: number | null | undefined, direction: string): number | null {
  if (value == null || target == null) return null;
  if (direction === 'HIGHER_IS_BETTER') return target === 0 ? null : (value / target) * 100;
  if (direction === 'LOWER_IS_BETTER') return value === 0 ? null : (target / value) * 100;
  return null;
}
