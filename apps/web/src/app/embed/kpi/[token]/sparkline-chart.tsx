'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { SparklinePoint } from '../../../../lib/api-client';

interface SparklineChartProps {
  data: SparklinePoint[];
}

export default function SparklineChart({ data }: SparklineChartProps) {
  const chartData = data.map((p) => ({ v: p.value }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <Tooltip content={() => null} cursor={false} />
        <Line
          type="monotone"
          dataKey="v"
          stroke="var(--color-accent-primary, #6366f1)"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
