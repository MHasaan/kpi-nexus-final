/**
 * Retention tier presets (days). One-click apply sets a RetentionPolicy per
 * entity type to the tier's day count.
 */
export const RETENTION_TIERS = {
  FREE: 90,
  PRO: 365,
  ENTERPRISE: 2555, // ~7 years
} as const;

export type RetentionTier = keyof typeof RETENTION_TIERS;

/** Entity types a retention policy applies to. */
export const RETENTION_ENTITY_TYPES = [
  'audit_log',
  'kpi_data_point',
  'notification_delivery',
  'report_run',
  'ingestion_job',
] as const;

export function resolveTierDays(tier: RetentionTier): number {
  const days = RETENTION_TIERS[tier];
  if (days === undefined) throw new Error(`Unknown retention tier: ${tier}`);
  return days;
}
