import { getNextMillis } from 'bullmq';

/**
 * True when `pattern` is a cron BullMQ will schedule: 5 fields (or 6 with
 * leading seconds) that BullMQ's own parser accepts and that yield a next run.
 * Validating with the scheduler's parser (not a second, hand-written one) means
 * the DTO and the queue can't disagree. BE-019: an unparsable pattern used to
 * pass the DTO, get inserted, then fail in the queue → 500 + an orphaned row.
 */
export function isValidCron(pattern: string): boolean {
  const fields = pattern.trim().split(/\s+/).filter(Boolean);
  if (fields.length !== 5 && fields.length !== 6) return false;
  try {
    return typeof getNextMillis(Date.now(), { pattern: pattern.trim() }) === 'number';
  } catch {
    return false;
  }
}
