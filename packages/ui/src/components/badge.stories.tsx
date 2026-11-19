import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from './badge.js';
import { ScopeBadge } from './scope-badge.js';
import { StatusBadge } from './status-badge.js';

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  subcomponents: { StatusBadge, ScopeBadge },
  args: { children: 'Monthly', tone: 'neutral' },
  argTypes: { tone: { control: 'inline-radio', options: ['neutral', 'info', 'success', 'warning', 'error'] } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['neutral', 'info', 'success', 'warning', 'error'] as const).map((tone) => (
        <Badge key={tone} tone={tone}>{tone}</Badge>
      ))}
    </div>
  ),
};
export const Playground: Story = {};

/** A KPI's status against its thresholds. */
export const KpiStatus: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="on-track" />
      <StatusBadge status="at-risk" />
      <StatusBadge status="off-track" />
      <StatusBadge status="no-data" />
      <StatusBadge status="no-data" label="No target" />
    </div>
  ),
};

/** Whose values a KPI holds: the organization's, a unit's, or each person's. */
export const KpiScope: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ScopeBadge scope="ORG_WIDE" />
      <ScopeBadge scope="PER_UNIT" />
      <ScopeBadge scope="PER_USER" />
    </div>
  ),
};
