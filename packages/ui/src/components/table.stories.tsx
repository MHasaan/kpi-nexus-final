import type { Meta, StoryObj } from '@storybook/react-vite';

import { type KpiStatus, StatusBadge } from './status-badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table.js';

const rows: Array<{ name: string; value: string; status: KpiStatus }> = [
  { name: 'Monthly revenue', value: '1.24M', status: 'on-track' },
  { name: 'Churn', value: '3.2%', status: 'at-risk' },
  { name: 'Support backlog', value: '214', status: 'off-track' },
  { name: 'NPS', value: '—', status: 'no-data' },
];

const meta = {
  title: 'Data/Table',
  component: Table,
  subcomponents: { TableHeader, TableBody, TableRow, TableHead, TableCell },
} satisfies Meta<typeof Table>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Table {...args}>
      <TableHeader>
        <TableRow>
          <TableHead>KPI</TableHead>
          <TableHead className="text-right">Latest</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody zebra>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
