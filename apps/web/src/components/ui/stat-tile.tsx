import { cn } from '@/lib/cn';
import { Card } from './card';
import { Delta } from './delta';
import { Sparkline } from '@/components/charts/sparkline';

export interface StatTileProps {
  /** Eyebrow label (uppercase). */
  label: string;
  /** Big primary value (rendered tabular-nums). */
  value: string | number;
  /** Optional unit suffix. */
  unit?: string;
  /** Change value for the Delta indicator. */
  delta?: number | null;
  /** Optional percentage shown by the Delta indicator. */
  deltaPct?: number;
  /** Sparkline trend data. */
  trend?: number[];
  className?: string;
}

/** KPI summary card: eyebrow label + Delta + big tabular value + fluid sparkline. */
export function StatTile({ label, value, unit, delta, deltaPct, trend, className }: StatTileProps) {
  return (
    <Card className={cn('kn-card-hover flex flex-col gap-2 p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="kn-eyebrow">{label}</span>
        {(delta != null || deltaPct != null) && <Delta value={delta ?? 0} pct={deltaPct} />}
      </div>
      <div className="text-3xl font-semibold tabular-nums leading-none tracking-tight text-content-strong">
        {value}
        {unit && <span className="ml-1 text-base font-medium text-content-muted">{unit}</span>}
      </div>
      {trend && trend.length > 1 && (
        <Sparkline data={trend} fluid height={36} aria-label={`${label} trend`} className="mt-1 w-full" />
      )}
    </Card>
  );
}
