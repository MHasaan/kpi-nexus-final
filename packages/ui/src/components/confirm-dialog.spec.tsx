import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ConfirmDialog, isConfirmEnabled, trapFocusIndex } from './confirm-dialog.js';

const noop = (): void => undefined;

describe('ConfirmDialog (X-01)', () => {
  test('renders nothing while closed', () => {
    expect(renderToStaticMarkup(<ConfirmDialog open={false} title="Delete KPI" onConfirm={noop} onCancel={noop} />)).toBe('');
  });

  test('open: a modal alertdialog named by its title and described by its text', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Delete “Monthly Revenue”?"
        description="Its recorded values are archived with it."
        confirmLabel="Delete KPI"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Delete “Monthly Revenue”?');
    expect(html).toContain('Its recorded values are archived with it.');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain('data-testid="confirm-dialog-confirm"');
    expect(html).toContain('data-testid="confirm-dialog-cancel"');
    expect(html).toContain('Delete KPI');
    expect(html).toContain('Cancel');
  });

  test('danger tone uses the critical colour on the confirm button only', () => {
    const danger = renderToStaticMarkup(<ConfirmDialog open tone="danger" title="t" onConfirm={noop} onCancel={noop} />);
    const plain = renderToStaticMarkup(<ConfirmDialog open title="t" onConfirm={noop} onCancel={noop} />);
    expect(danger).toContain('bg-status-critical');
    expect(plain).not.toContain('bg-status-critical');
  });

  test('type-to-confirm: shows the text to type and keeps Confirm disabled until it matches', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog open title="Purge user" confirmText="aisha.khan@helios.io" onConfirm={noop} onCancel={noop} />,
    );
    expect(html).toContain('data-testid="confirm-dialog-input"');
    expect(html).toContain('aisha.khan@helios.io');
    expect(html).toMatch(/data-testid="confirm-dialog-confirm"[^>]*disabled=""|disabled=""[^>]*data-testid="confirm-dialog-confirm"/);
  });

  test('busy: Confirm reports busy and Cancel is disabled, so the action cannot be raced', () => {
    const html = renderToStaticMarkup(<ConfirmDialog open busy title="t" onConfirm={noop} onCancel={noop} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/data-testid="confirm-dialog-cancel"[^>]*disabled=""|disabled=""[^>]*data-testid="confirm-dialog-cancel"/);
  });

  test('a failed action is announced inside the dialog', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog open title="t" error="You do not have permission." onConfirm={noop} onCancel={noop} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('You do not have permission.');
  });

  test('custom test id prefixes every part', () => {
    const html = renderToStaticMarkup(<ConfirmDialog open testId="delete-role" title="t" onConfirm={noop} onCancel={noop} />);
    expect(html).toContain('data-testid="delete-role"');
    expect(html).toContain('data-testid="delete-role-confirm"');
    expect(html).toContain('data-testid="delete-role-cancel"');
  });
});

describe('isConfirmEnabled', () => {
  test('no text required: enabled unless busy', () => {
    expect(isConfirmEnabled('', undefined, false)).toBe(true);
    expect(isConfirmEnabled('', undefined, true)).toBe(false);
  });

  test('text required: exact match after trimming, case-sensitive', () => {
    expect(isConfirmEnabled('helios', 'helios', false)).toBe(true);
    expect(isConfirmEnabled('  helios ', 'helios', false)).toBe(true);
    expect(isConfirmEnabled('Helios', 'helios', false)).toBe(false);
    expect(isConfirmEnabled('helio', 'helios', false)).toBe(false);
    expect(isConfirmEnabled('helios', 'helios', true)).toBe(false);
  });
});

describe('trapFocusIndex', () => {
  test('Tab moves forward and wraps from the last control to the first', () => {
    expect(trapFocusIndex(3, 0, false)).toBe(1);
    expect(trapFocusIndex(3, 2, false)).toBe(0);
  });

  test('Shift+Tab moves back and wraps from the first control to the last', () => {
    expect(trapFocusIndex(3, 1, true)).toBe(0);
    expect(trapFocusIndex(3, 0, true)).toBe(2);
  });

  test('focus outside the dialog is pulled to the first (or, going back, the last) control', () => {
    expect(trapFocusIndex(3, -1, false)).toBe(0);
    expect(trapFocusIndex(3, -1, true)).toBe(2);
  });

  test('nothing focusable: stays put', () => {
    expect(trapFocusIndex(0, -1, false)).toBe(-1);
  });
});
