import { cn } from '../cn.js';

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

/** The words for a KPI scope: "Organisation-wide", "Per unit", "Per user". */
export function scopeLabel(scope: KpiScope): string {
  return labels[scope] ?? scope;
}

export interface ScopeBadgeProps {
  scope: KpiScope;
  className?: string;
}

/** Pill conveying a KPI's scope in words, with a distinct tint per scope. */
export function ScopeBadge({ scope, className }: ScopeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium',
        map[scope] ?? map.ORG_WIDE,
        className,
      )}
      data-scope={scope}
    >
      {scopeLabel(scope)}
    </span>
  );
}
