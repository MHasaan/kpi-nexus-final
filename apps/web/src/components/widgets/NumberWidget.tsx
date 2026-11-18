'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
} from 'recharts';

import type { DashboardWidget } from '../../lib/api-client';

import type { SeriesPoint, WidgetKpi } from './series';
import { latestPoint, previousPoint, toSeries } from './series';
import { useFormat } from '../../lib/format-context';
import { NO_VALUES_IN_RANGE } from './series';

interface NumberWidgetProps {
  widget: DashboardWidget;
  kpi?: WidgetKpi | null;
  dataPoints?: SeriesPoint[];
}

export function NumberWidget({ widget, kpi, dataPoints = [] }: NumberWidgetProps) {
  const fmt = useFormat();
  const title = widget.title ?? kpi?.name ?? 'Number';
  const latest = latestPoint(dataPoints);
  const value = latest?.value ?? null;
  const unit = kpi?.unit ?? (widget.config['unit'] as string | undefined) ?? '';

  const sparkData = toSeries(dataPoints, 15).map((dp) => ({ v: dp.value }));

  // Trend arrow
  const prev = previousPoint(dataPoints);
  const trend =
    prev && value !== null
      ? value > prev.value
        ? 'up'
        : value < prev.value
          ? 'down'
          : 'flat'
      : null;

  return (
    <div
      className="flex h-full flex-col justify-center p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
        {title}
      </p>
      {value !== null ? (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-4xl font-bold text-content-strong">
              {fmt.number(value)}
            </p>
            {unit && (
              <span className="text-sm font-normal text-content-muted">{unit}</span>
            )}
            {trend === 'up' && (
              <span className="text-status-success text-sm" aria-label="trending up">↑</span>
            )}
            {trend === 'down' && (
              <span className="text-status-critical text-sm" aria-label="trending down">↓</span>
            )}
          </div>
          {sparkData.length > 1 && (
            <div className="mt-3 h-10">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkData}>
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
        </>
      ) : (
        <p className="mt-1 text-sm text-content-muted">{NO_VALUES_IN_RANGE}</p>
      )}
    </div>
  );
}
