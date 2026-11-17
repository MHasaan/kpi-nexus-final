/** The per-unit KPIs a unit does not hold yet — what the "assign" picker offers. */
export function unitKpiCandidates<K extends { id: string; scope: string; isArchived?: boolean; deletedAt?: string | null }>(
  kpis: readonly K[],
  held: readonly { kpiId: string }[],
): K[] {
  const heldIds = new Set(held.map((h) => h.kpiId));
  return kpis.filter((k) => k.scope === 'PER_UNIT' && !k.isArchived && !k.deletedAt && !heldIds.has(k.id));
}

/** A target typed into a field: a number, nothing (no target), or not a number at all. */
export function parseTarget(raw: string): { ok: true; value: number | undefined } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: undefined };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}
