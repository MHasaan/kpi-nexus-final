import type { Meta, StoryObj } from '@storybook/react-vite';

import { Delta } from './delta.js';
import { Metric } from './metric.js';
import { Sparkline } from './sparkline.js';
import { StatTile } from './stat-tile.js';

const meta = {
  title: 'Data/StatTile',
  component: StatTile,
  subcomponents: { Metric, Delta, Sparkline },
  args: { label: 'Monthly revenue', value: '1.24M', unit: 'USD', delta: 82_000, deltaPct: 7.1, trend: [0.9, 1.0, 0.97, 1.08, 1.15, 1.24] },
} satisfies Meta<typeof StatTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="max-w-xs">
      <StatTile {...args} />
    </div>
  ),
};
export const Falling: Story = { ...Default, args: { label: 'Churn', value: 3.2, unit: '%', delta: -0.4, deltaPct: -11.1, trend: [4.1, 3.9, 3.8, 3.6, 3.2] } };
export const NoTrend: Story = { ...Default, args: { label: 'NPS', value: 41, delta: null, trend: undefined } };

export const MetricSizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <Metric value={128} label="Small" size="sm" />
      <Metric value="1,284" unit="calls" label="Medium" />
      <Metric value="98.4" unit="%" label="Large" size="lg" />
    </div>
  ),
};

export const Deltas: Story = {
  render: () => (
    <div className="flex gap-4">
      <Delta value={12} pct={4.5} />
      <Delta value={-3} pct={-1.2} />
      <Delta value={0} />
      <Delta value={null} />
    </div>
  ),
};

export const Sparklines: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Sparkline data={[3, 5, 4, 6, 8, 7, 9]} />
      <Sparkline data={[9, 8, 8, 6, 5, 3]} stroke="hsl(var(--status-critical))" />
      <div className="w-64"><Sparkline data={[1, 3, 2, 4]} fluid /></div>
    </div>
  ),
};
