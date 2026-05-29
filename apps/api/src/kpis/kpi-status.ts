export type KpiStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'DEPRECATED'
  | 'ARCHIVED';

/**
 * KPI lifecycle state machine (spec §). ARCHIVED is terminal.
 *   DRAFT      → PROPOSED | ARCHIVED
 *   PROPOSED   → APPROVED | DRAFT (rework) | ARCHIVED
 *   APPROVED   → ACTIVE | ARCHIVED
 *   ACTIVE     → PAUSED | DEPRECATED | ARCHIVED
 *   PAUSED     → ACTIVE | DEPRECATED | ARCHIVED
 *   DEPRECATED → ARCHIVED
 */
export const KPI_STATUS_TRANSITIONS: Record<KpiStatus, readonly KpiStatus[]> = {
  DRAFT: ['PROPOSED', 'ARCHIVED'],
  PROPOSED: ['APPROVED', 'DRAFT', 'ARCHIVED'],
  APPROVED: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'DEPRECATED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'DEPRECATED', 'ARCHIVED'],
  DEPRECATED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from: KpiStatus, to: KpiStatus): boolean {
  return KPI_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
