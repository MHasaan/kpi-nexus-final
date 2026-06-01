import { cn } from '@/lib/cn';

export type KpiScope = 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';

const map: Record<KpiScope, string> = {
  ORG_WIDE: 'bg-accent-bg text-accent-primary',
  PER_UNIT: 'bg-chart-10/15 text-chart-10',
  PER_USER: 'bg-chart-7/15 text-chart-7',
};

const labels: Record<KpiScope, string> = {
  ORG_WIDE: 'Organisation-wide',
  PER_UNIT: 'Per unit',
  PER_USER: 'Per user',
};

export interface ScopeBadgeProps {
  scope: KpiScope;
  className?: string;
}

/** Mono pill conveying a KPI's scope with a distinct tint per scope. */
export function ScopeBadge({ scope, className }: ScopeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono',
        map[scope] ?? map.ORG_WIDE,
        className,
      )}
      aria-label={`Scope: ${labels[scope] ?? scope}`}
    >
      {scope}
    </span>
  );
}
