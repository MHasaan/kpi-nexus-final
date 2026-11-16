import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from './button.js';
import { ConfirmDialog } from './confirm-dialog.js';
import { type ToastItem, ToastViewport } from './toast.js';

const noop = (): void => undefined;

const meta = {
  title: 'Feedback/ConfirmDialog',
  component: ConfirmDialog,
  subcomponents: { ToastViewport },
  args: {
    open: true,
    title: 'Delete “Monthly Recurring Revenue”?',
    description: 'The KPI moves to the archive with its recorded values. You can restore it for 30 days.',
    confirmLabel: 'Delete KPI',
    tone: 'danger',
    onConfirm: noop,
    onCancel: noop,
  },
} satisfies Meta<typeof ConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A destructive action: red confirm button, focus starts on Cancel. */
export const Danger: Story = {};

/** A question that is not destructive. */
export const Default: Story = {
  args: {
    tone: 'default',
    title: 'Apply the “Manager” preset?',
    description: 'This replaces the role’s current permissions.',
    confirmLabel: 'Apply preset',
  },
};

/** For actions that cannot be undone: the user types the name first. */
export const TypeToConfirm: Story = {
  args: {
    title: 'Permanently delete Aisha Khan?',
    description: 'Their account and personal data are erased. This cannot be undone.',
    confirmLabel: 'Delete permanently',
    confirmText: 'aisha.khan@helios.io',
  },
};

/** While the action runs nothing can be clicked or dismissed. */
export const Busy: Story = { args: { busy: true } };

/** A failed action keeps the dialog open and says why. */
export const Failed: Story = { args: { error: 'You do not have permission to delete this KPI.' } };

/** Open, cancel and confirm it; Esc and the backdrop cancel, Tab stays inside. */
export const Interactive: Story = {
  args: { open: false },
  render: function InteractiveDialog(args) {
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState('nothing yet');
    return (
      <div className="flex flex-col items-start gap-3">
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          Delete KPI
        </Button>
        <p className="text-sm text-content-muted">Last answer: {result}</p>
        <ConfirmDialog
          {...args}
          open={open}
          onConfirm={() => {
            setResult('confirmed');
            setOpen(false);
          }}
          onCancel={() => {
            setResult('cancelled');
            setOpen(false);
          }}
        />
      </div>
    );
  },
};

const sampleToasts: ToastItem[] = [
  { id: '1', tone: 'success', title: 'Invitation sent', description: 'aisha.khan@helios.io will get an email.' },
  { id: '2', tone: 'error', title: 'Could not delete the role', description: 'Three users still hold it.' },
  { id: '3', tone: 'info', title: 'Sent for approval' },
];

/** Feedback after an action that does not navigate. Errors interrupt; the rest are polite. */
export const Toasts: Story = {
  args: { open: false },
  render: function ToastStack() {
    const [toasts, setToasts] = useState(sampleToasts);
    return (
      <div className="flex flex-col items-start gap-3">
        <Button size="sm" variant="secondary" onClick={() => setToasts(sampleToasts)}>
          Show toasts again
        </Button>
        <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
      </div>
    );
  },
};
