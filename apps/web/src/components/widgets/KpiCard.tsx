'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { DataPoint, DashboardWidget, KpiSummary } from '../../lib/api-client';

interface KpiCardProps {
  widget: DashboardWidget;
  kpi?: KpiSummary | null;
  dataPoints?: DataPoint[];
}

function getStatusColor(
  value: number | null,
  kpi: KpiSummary | null | undefined,
): string {
  if (value === null || !kpi) return 'text-content-strong';
  if (kpi.criticalThreshold !== null && value <= kpi.criticalThreshold)
    return 'text-status-critical';
  if (kpi.warningThreshold !== null && value <= kpi.warningThreshold)
    return 'text-status-warning';
  return 'text-status-success';
}

export function KpiCard({ widget, kpi, dataPoints = [] }: KpiCardProps) {
  const title = widget.title ?? kpi?.name ?? 'KPI';
  const latest = dataPoints.at(-1);
  const latestValue = latest?.value ?? null;
  const unit = kpi?.unit ?? (widget.config['unit'] as string | undefined) ?? '';

  const sparkData = dataPoints.slice(-20).map((dp) => ({
    v: dp.value,
  }));

  const statusColor = getStatusColor(latestValue, kpi);

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
          <p className={`mt-1 text-3xl font-bold ${statusColor}`}>
            {latestValue.toLocaleString()}
            {unit && (
              <span className="ml-1 text-base font-normal text-content-muted">
                {unit}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-content-muted">No data</p>
        )}
        {kpi?.targetValue !== null && kpi?.targetValue !== undefined && (
          <p className="mt-1 text-xs text-content-muted">
            Target: {kpi.targetValue}
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
