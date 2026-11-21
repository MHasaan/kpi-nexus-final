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

import type { DashboardWidget } from '../../lib/api-client';

import type { SeriesPoint } from './series';
import { toSeries } from './series';
import { useFormat } from '../../lib/format-context';
import { NO_VALUES_IN_RANGE } from './series';

interface LineChartWidgetProps {
  widget: DashboardWidget;
  dataPoints?: SeriesPoint[];
}

export function LineChartWidget({ widget, dataPoints = [] }: LineChartWidgetProps) {
  const fmt = useFormat();
  const title = widget.title ?? 'Line Chart';

  const chartData = toSeries(dataPoints).map((dp) => ({
    date: fmt.day(dp.periodStart),
    value: dp.value,
  }));
  // Room for the longest short label ("236.5k"): six digits were drawn in a space for five (F-031).
  const widest = fmt.compact(Math.max(0, ...chartData.map((d) => Math.abs(d.value))));
  const axisWidth = Math.max(32, widest.length * 7 + 10);

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
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-content-muted, #6b7280)' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                width={axisWidth}
                tickFormatter={(v: number) => fmt.compact(v)}
                tick={{ fontSize: 10, fill: 'var(--color-content-muted, #6b7280)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value) => fmt.number(Number(value))}
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
