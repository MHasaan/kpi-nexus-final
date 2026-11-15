import type { Meta, StoryObj } from '@storybook/react-vite';
import { Target } from 'lucide-react';

import { Avatar } from './avatar.js';
import { Button } from './button.js';
import { EmptyState } from './empty-state.js';
import { PageHeader } from './page-header.js';
import { Skeleton } from './skeleton.js';

const meta = {
  title: 'Layout/PageHeader',
  component: PageHeader,
  subcomponents: { EmptyState, Skeleton, Avatar },
  args: { eyebrow: 'Performance', title: 'KPIs', subtitle: 'Everything your organization measures.', actions: <Button size="sm">New KPI</Button> },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  render: () => (
    <EmptyState
      icon={Target}
      title="No KPIs yet"
      description="Create your first KPI or start from a template."
      action={<Button size="sm">New KPI</Button>}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-2">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
};

/** Initials when there is no picture. */
export const Avatars: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar name="Aisha Khan" size="sm" />
      <Avatar name="Devon Reyes" />
      <Avatar name="Sara Lin" size="lg" />
    </div>
  ),
};
