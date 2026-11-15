import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card.js';

const meta = {
  title: 'Layout/Card',
  component: Card,
  subcomponents: { CardHeader, CardTitle, CardContent, CardFooter },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardHeader>
        <CardTitle>Monthly revenue</CardTitle>
      </CardHeader>
      <CardContent>Recorded on the first working day of each month by Finance.</CardContent>
      <CardFooter>
        <Button size="sm" variant="secondary">Open KPI</Button>
      </CardFooter>
    </Card>
  ),
};
