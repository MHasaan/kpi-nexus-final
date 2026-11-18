'use client';

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { DashboardWidget } from '../../lib/api-client';

import type { SeriesPoint } from './series';
import { toSeries } from './series';
import { useFormat } from '../../lib/format-context';
import { NO_VALUES_IN_RANGE } from './series';

interface TrendWidgetProps {
  widget: DashboardWidget;
  dataPoints?: SeriesPoint[];
}

export function TrendWidget({ widget, dataPoints = [] }: TrendWidgetProps) {
  const fmt = useFormat();
  const title = widget.title ?? 'Trend';
  const chartData = toSeries(dataPoints, 30).map((dp) => ({
    date: fmt.day(dp.periodStart),
    value: dp.value,
  }));

  return (
    <div
      className="flex h-full flex-col p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
        {title}
      </p>
      {chartData.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-content-muted">{NO_VALUES_IN_RANGE}</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id={`trendGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent-primary, #6366f1)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-accent-primary, #6366f1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  backgroundColor: 'var(--color-surface-1, #fff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--color-accent-primary, #6366f1)"
                strokeWidth={2}
                fill={`url(#trendGrad-${widget.id})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
