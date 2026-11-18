'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { BoardPackStatus, DashboardWidget } from '../../lib/api-client';

import type { SeriesPoint, WidgetKpi } from './series';
import { latestPoint, toSeries } from './series';
import { useFormat } from '../../lib/format-context';
import { NO_VALUES_IN_RANGE } from './series';

interface KpiCardProps {
  widget: DashboardWidget;
  kpi?: WidgetKpi | null;
  dataPoints?: SeriesPoint[];
  /** The server's direction-aware health for this KPI, when the board loaded it. */
  status?: BoardPackStatus | null;
}

/**
 * The colour of the value.
 *
 * Whether a number is good depends on the KPI's direction, so this reads the
 * server's status (bands → thresholds → direction-aware target) rather than
 * comparing the value with a threshold itself. Comparing `value <= critical`
 * painted every healthy lower-is-better KPI red (X-08).
 */
function statusColor(status: BoardPackStatus | null | undefined): string {
  switch (status) {
    case 'ON_TRACK':
      return 'text-status-success';
    case 'AT_RISK':
      return 'text-status-warning';
    case 'OFF_TRACK':
      return 'text-status-critical';
    default:
      // NO_TARGET / NO_DATA, or a board that did not load the summary.
      return 'text-content-strong';
  }
}

export function KpiCard({ widget, kpi, dataPoints = [], status = null }: KpiCardProps) {
  const fmt = useFormat();
  const title = widget.title ?? kpi?.name ?? 'KPI';
  const latest = latestPoint(dataPoints);
  const latestValue = latest?.value ?? null;
  const unit = kpi?.unit ?? (widget.config['unit'] as string | undefined) ?? '';

  const sparkData = toSeries(dataPoints, 20).map((dp) => ({
    v: dp.value,
  }));

  const valueColor = statusColor(status);

  return (
    <div
      className="flex h-full flex-col justify-between p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
          {title}
        </p>
        {latestValue !== null ? (
          <p className={`mt-1 text-3xl font-bold ${valueColor}`}>
            {fmt.number(latestValue)}
            {unit && (
              <span className="ml-1 text-base font-normal text-content-muted">
                {unit}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-content-muted">{NO_VALUES_IN_RANGE}</p>
        )}
        {kpi?.targetValue !== null && kpi?.targetValue !== undefined && (
          <p className="mt-1 text-xs text-content-muted">
            Target: {fmt.number(kpi.targetValue)}
            {unit ? ` ${unit}` : ''}
          </p>
        )}
      </div>

      {sparkData.length > 1 && (
        <div className="mt-3 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Tooltip
                content={() => null}
                cursor={false}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke="var(--color-accent-primary, #6366f1)"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
