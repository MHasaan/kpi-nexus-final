import { cn } from '@/lib/cn';

export interface MetricProps {
  /** The primary numeric/string value (rendered with tabular-nums). */
  value: string | number;
  /** Optional unit suffix (e.g. "%", "ms"). */
  unit?: string;
  /** Optional eyebrow label above the value. */
  label?: string;
  /** Visual size of the value. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const valueSizes = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-4xl',
} as const;

/** A single metric: optional eyebrow label + large tabular value + optional unit. */
export function Metric({ value, unit, label, size = 'md', className }: MetricProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <span className="kn-eyebrow">{label}</span>}
      <span className={cn('font-semibold tabular-nums text-content-strong leading-none tracking-tight', valueSizes[size])}>
        {value}
        {unit && <span className="ml-1 text-base font-medium text-content-muted">{unit}</span>}
      </span>
    </div>
  );
}
