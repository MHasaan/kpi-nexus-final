import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../cn.js';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: ReactNode;
  description?: ReactNode;
}

export interface ToastViewportProps {
  toasts: readonly ToastItem[];
  onDismiss: (id: string) => void;
  className?: string;
}

const toneStyles: Record<ToastTone, { icon: typeof Info; iconClass: string; bar: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-status-success', bar: 'border-l-status-success' },
  error: { icon: AlertCircle, iconClass: 'text-status-critical', bar: 'border-l-status-critical' },
  info: { icon: Info, iconClass: 'text-accent-primary', bar: 'border-l-accent-primary' },
};

/**
 * Where toasts appear (bottom right). Render it once, always — an empty live
 * region must exist first for a screen reader to announce what is added later.
 * Errors interrupt (`role="alert"`); everything else is a polite status.
 */
export function ToastViewport({ toasts, onDismiss, className }: ToastViewportProps) {
  return (
    <div
      data-testid="toast-viewport"
      className={cn(
        'pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2',
        className,
      )}
    >
      {toasts.map((toast) => {
        const { icon: Icon, iconClass, bar } = toneStyles[toast.tone];
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            data-testid="toast"
            data-tone={toast.tone}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 border-border bg-surface-bg p-3 shadow-lg',
              bar,
            )}
          >
            <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-semibold text-content-strong">{toast.title}</p>
              {toast.description && <p className="break-words text-sm text-content-muted">{toast.description}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
              className="rounded p-0.5 text-content-muted hover:bg-surface-hover hover:text-content-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
