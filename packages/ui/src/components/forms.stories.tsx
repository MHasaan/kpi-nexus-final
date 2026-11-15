import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from './input.js';
import { Label } from './label.js';
import { Select } from './select.js';
import { Textarea } from './textarea.js';

const meta = {
  title: 'Forms/Input',
  component: Input,
  subcomponents: { Label, Select, Textarea },
  args: { placeholder: 'e.g. Monthly revenue' },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, value: 'Locked', readOnly: true } };
export const Invalid: Story = { args: { 'aria-invalid': true } };

export const Form: Story = {
  render: () => (
    <form className="flex max-w-sm flex-col gap-3">
      <Label htmlFor="name">Name</Label>
      <Input id="name" placeholder="Monthly revenue" />
      <Label htmlFor="frequency">Frequency</Label>
      <Select id="frequency" defaultValue="MONTHLY">
        <option value="WEEKLY">Weekly</option>
        <option value="MONTHLY">Monthly</option>
        <option value="QUARTERLY">Quarterly</option>
      </Select>
      <Label htmlFor="description">Description</Label>
      <Textarea id="description" rows={3} placeholder="How it is measured" />
    </form>
  ),
};
