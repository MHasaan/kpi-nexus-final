/** The per-person KPIs someone does not hold yet — what their page offers to assign. */
export function personKpiCandidates<K extends { id: string; scope: string; isArchived?: boolean; deletedAt?: string | null }>(
  kpis: readonly K[],
  held: readonly { kpiId: string }[],
): K[] {
  const heldIds = new Set(held.map((h) => h.kpiId));
  return kpis.filter((k) => k.scope === 'PER_USER' && !k.isArchived && !k.deletedAt && !heldIds.has(k.id));
}

/** Whether a person in this state can still be given a KPI. */
export function canHoldKpis(status: string): boolean {
  return status !== 'ARCHIVED' && status !== 'DELETED' && status !== 'PURGED';
}
