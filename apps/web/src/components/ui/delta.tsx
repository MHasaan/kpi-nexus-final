import { cn } from '@/lib/cn';

export interface DeltaProps {
  /** The change value. Sign drives direction/colour; magnitude is shown as absolute. */
  value: number | null | undefined;
  /** Optional percentage; when provided it (not `value`) is the displayed magnitude, suffixed with `%`. */
  pct?: number;
  className?: string;
}

/** Directional change indicator: ▲ green for positive, ▼ red for negative, em dash for zero/no data. */
export function Delta({ value, pct, className }: DeltaProps) {
  if (value === 0 || value == null) {
    return (
      <span className={cn('text-content-muted tabular-nums font-semibold', className)} aria-label="No change">
        —
      </span>
    );
  }
  const up = value > 0;
  const magnitude = Math.abs(pct ?? value);
  const suffix = pct != null ? '%' : '';
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
