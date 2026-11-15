import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Segmented } from './segmented.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.js';

const meta = {
  title: 'Navigation/Tabs',
  component: Tabs,
  subcomponents: { TabsList, TabsTrigger, TabsContent, Segmented },
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

function TabsDemo() {
  const [tab, setTab] = useState('overview');
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="data">Data</TabsTrigger>
        <TabsTrigger value="alerts" disabled>Alerts</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Targets, thresholds and the latest value.</TabsContent>
      <TabsContent value="data">Every recorded value, newest first.</TabsContent>
    </Tabs>
  );
}

export const Default: Story = {
  args: { value: 'overview', onValueChange: () => {}, children: null },
  render: () => <TabsDemo />,
};

function SegmentedDemo() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  return (
    <Segmented
      value={range}
      onChange={setRange}
      options={[
        { value: '7d', label: '7 days' },
        { value: '30d', label: '30 days' },
        { value: '90d', label: '90 days' },
      ]}
    />
  );
}

/** A compact single-choice switch, e.g. a chart's time range. */
export const SegmentedControl: Story = { ...Default, render: () => <SegmentedDemo /> };
