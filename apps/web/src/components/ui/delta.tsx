import { cn } from '@/lib/cn';

export interface DeltaProps {
  /** The change value. Sign drives direction/colour; magnitude is shown as absolute. */
  value: number | null | undefined;
  /** Optional percentage; when provided it (not `value`) is the displayed magnitude, suffixed with `%`. */
  pct?: number;
  /** Fixed number of decimals to show (e.g. 1 → "10.0%"). Default: up to 1 for %, up to 2 otherwise. */
  decimals?: number;
  className?: string;
}

/**
 * Magnitude as display text. Raw floats used to leak through — a +10% what-if
 * rendered "10.000000000000016%" (FE-016).
 */
export function formatDeltaMagnitude(magnitude: number, isPct: boolean, decimals?: number): string {
  if (decimals !== undefined) return magnitude.toFixed(decimals);
  return magnitude.toLocaleString('en-US', { maximumFractionDigits: isPct ? 1 : 2 });
}

/** Directional change indicator: ▲ green for positive, ▼ red for negative, em dash for zero/no data. */
export function Delta({ value, pct, decimals, className }: DeltaProps) {
  if (value === 0 || value == null) {
    return (
      <span className={cn('text-content-muted tabular-nums font-semibold', className)} aria-label="No change">
        —
      </span>
    );
  }
  const up = value > 0;
  const suffix = pct != null ? '%' : '';
  const magnitude = formatDeltaMagnitude(Math.abs(pct ?? value), pct != null, decimals);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 tabular-nums text-xs font-semibold',
        up ? 'text-status-success' : 'text-status-critical',
        className,
      )}
      aria-label={`${up ? 'Up' : 'Down'} ${magnitude}${suffix}`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {magnitude}
      {suffix}
    </span>
  );
}
