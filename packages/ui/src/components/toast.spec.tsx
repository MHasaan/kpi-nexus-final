import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { type ToastItem, ToastViewport } from './toast.js';

const noop = (): void => undefined;
const render = (toasts: ToastItem[]): string => renderToStaticMarkup(<ToastViewport toasts={toasts} onDismiss={noop} />);

describe('ToastViewport', () => {
  test('the live region exists before any toast, so later ones are announced', () => {
    const html = render([]);
    expect(html).toContain('data-testid="toast-viewport"');
    expect(html).not.toContain('data-testid="toast"');
  });

  test('a success toast is a polite status with its message', () => {
    const html = render([{ id: 'a', tone: 'success', title: 'Invitation sent', description: 'aisha@helios.io' }]);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-tone="success"');
    expect(html).toContain('Invitation sent');
    expect(html).toContain('aisha@helios.io');
  });

  test('an error toast interrupts as an alert', () => {
    const html = render([{ id: 'b', tone: 'error', title: 'Could not delete the role' }]);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-tone="error"');
  });

  test('every toast can be dismissed by name', () => {
    const html = render([{ id: 'c', tone: 'info', title: 'Saved' }]);
    expect(html).toContain('aria-label="Dismiss notification"');
  });

  test('toasts stack in the order given', () => {
    const html = render([
      { id: '1', tone: 'info', title: 'First' },
      { id: '2', tone: 'info', title: 'Second' },
    ]);
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
  });
});
