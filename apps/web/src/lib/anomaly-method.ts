import { humanize } from './labels';

/**
 * The ways the service looks for unusual values, in words. The picker offered
 * their code names — "ensemble", "zscore", "ewma", "isolation_forest" — with
 * nothing on what each one flags. The descriptions say what the service does
 * (apps/ml/app/services/anomaly.py), no more.
 */
export const ANOMALY_METHODS = [
  { value: 'ensemble', label: 'Several methods together', about: 'Flags a value only when at least two of the three other methods agree on it. The safest choice.' },
  { value: 'zscore', label: 'Far from the average', about: 'Flags a value that is far from the average of all the values.' },
  { value: 'ewma', label: 'Far from the recent trend', about: 'Flags a value that is far from where the recent values were heading. Finds a sudden shift that the average would hide.' },
  { value: 'isolation_forest', label: 'Unlike the rest', about: 'Flags the values that stand furthest apart from all the others. The sensitivity below does not apply to it.' },
] as const;

/** A method as stored or sent — "zscore", "ZSCORE" — in words. An unknown one is still readable. */
export function anomalyMethodLabel(method: string): string {
  return ANOMALY_METHODS.find((m) => m.value === method.toLowerCase())?.label ?? humanize(method);
}
