'use client';

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { DataPoint, DashboardWidget } from '../../lib/api-client';

interface TrendWidgetProps {
  widget: DashboardWidget;
  dataPoints?: DataPoint[];
}

export function TrendWidget({ widget, dataPoints = [] }: TrendWidgetProps) {
  const title = widget.title ?? 'Trend';
  const chartData = dataPoints.slice(-30).map((dp) => ({
    date: new Date(dp.recordedAt).toLocaleDateString(),
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
          <p className="text-sm text-content-muted">No data</p>
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
