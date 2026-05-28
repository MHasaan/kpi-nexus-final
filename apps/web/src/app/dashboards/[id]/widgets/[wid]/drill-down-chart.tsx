'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DataPoint } from '../../../../../lib/api-client';

interface DrillDownChartProps {
  dataPoints: DataPoint[];
  mode: 'line' | 'bar' | 'area';
}

export function DrillDownChart({ dataPoints, mode }: DrillDownChartProps) {
  const chartData = dataPoints.map((dp) => ({
    date: new Date(dp.recordedAt).toLocaleDateString(),
    value: dp.value,
  }));

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 8, left: -16, bottom: 0 },
  };

  const axisStyle = { fontSize: 11, fill: 'var(--color-content-muted, #6b7280)' };
  const tooltipStyle = {
    fontSize: 12,
    backgroundColor: 'var(--color-surface-1, #fff)',
    border: '1px solid var(--color-border, #e5e7eb)',
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {mode === 'bar' ? (
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="var(--color-accent-primary, #6366f1)" radius={[3, 3, 0, 0]} />
        </BarChart>
      ) : mode === 'area' ? (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id="drillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-primary, #6366f1)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-accent-primary, #6366f1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent-primary, #6366f1)"
            strokeWidth={2}
            fill="url(#drillGrad)"
            dot={false}
          />
        </AreaChart>
      ) : (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent-primary, #6366f1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
