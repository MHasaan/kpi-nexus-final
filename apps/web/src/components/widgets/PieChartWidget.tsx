'use client';

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { DataPoint, DashboardWidget, KpiSummary } from '../../lib/api-client';

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];

interface PieChartWidgetProps {
  widget: DashboardWidget;
  kpi?: KpiSummary | null;
  dataPoints?: DataPoint[];
}

export function PieChartWidget({ widget, kpi, dataPoints = [] }: PieChartWidgetProps) {
  const title = widget.title ?? 'Pie Chart';
  const latest = dataPoints.at(-1);
  const latestValue = latest?.value ?? 0;
  const target = kpi?.targetValue ?? null;

  // Build a simple 2-slice pie: actual vs remaining-to-target
  const chartData =
    target !== null && target > 0
      ? [
          { name: 'Actual', value: Math.min(latestValue, target) },
          { name: 'Remaining', value: Math.max(0, target - latestValue) },
        ]
      : dataPoints.slice(-5).map((dp, i) => ({
          name: new Date(dp.recordedAt).toLocaleDateString(),
          value: dp.value,
          index: i,
        }));

  return (
    <div
      className="flex h-full flex-col p-4"
      data-testid={`widget-render-${widget.id}`}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
        {title}
      </p>
      {chartData.length === 0 || (chartData.length === 1 && chartData[0]!.value === 0) ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-content-muted">No data</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius="70%"
                dataKey="value"
                strokeWidth={1}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  backgroundColor: 'var(--color-surface-1, #fff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              />
              <Legend
                iconSize={10}
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
