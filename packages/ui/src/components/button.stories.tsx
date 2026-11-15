import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus } from 'lucide-react';

import { Button } from './button.js';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Save KPI' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Delete KPI' } };
export const WithIcon: Story = { args: { leftIcon: <Plus className="h-4 w-4" />, children: 'New KPI' } };
export const Loading: Story = { args: { isLoading: true } };
export const Disabled: Story = { args: { disabled: true } };
