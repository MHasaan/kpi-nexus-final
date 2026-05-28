'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DataPoint, DashboardWidget } from '../../lib/api-client';

interface LineChartWidgetProps {
  widget: DashboardWidget;
  dataPoints?: DataPoint[];
}

export function LineChartWidget({ widget, dataPoints = [] }: LineChartWidgetProps) {
  const title = widget.title ?? 'Line Chart';

  const chartData = dataPoints.map((dp) => ({
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
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-content-muted, #6b7280)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-content-muted, #6b7280)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  backgroundColor: 'var(--color-surface-1, #fff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-accent-primary, #6366f1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
