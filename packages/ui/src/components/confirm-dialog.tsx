'use client';

import { AlertTriangle } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { cn } from '../cn.js';
import { Button } from './button.js';
import { inputBase } from './input.js';

export interface ConfirmDialogProps {
  open: boolean;
  /** Says what will happen, naming the thing: "Delete “Monthly Revenue”?" */
  title: ReactNode;
  /** The consequence, in a sentence. */
  description?: ReactNode;
  /** The verb on the confirm button. Default "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for anything that deletes or cannot be undone. */
  tone?: 'default' | 'danger';
  /** The action is running: Confirm shows a spinner and nothing can be clicked or dismissed. */
  busy?: boolean;
  /** Why the action failed; announced and shown inside the dialog, which stays open. */
  error?: ReactNode;
  /** When set, Confirm stays disabled until the user types exactly this text. */
  confirmText?: string;
  /** Choices that go with the question (e.g. who takes over), shown under the description. */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  /** Test id of the dialog; its parts are `<id>-confirm`, `<id>-cancel`, `<id>-input`. */
  testId?: string;
}

/** Confirm is clickable when nothing is running and any required text has been typed. */
export function isConfirmEnabled(typed: string, confirmText: string | undefined, busy: boolean): boolean {
  if (busy) return false;
  if (confirmText === undefined) return true;
  return typed.trim() === confirmText;
}

/**
 * Which focusable control Tab (or Shift+Tab) lands on, keeping focus inside the
 * dialog. `current` is the focused control's index, or -1 when focus is elsewhere.
 */
export function trapFocusIndex(count: number, current: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return (current + (shift ? count - 1 : 1)) % count;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * A modal question before a destructive or irreversible action. Focus starts on
 * Cancel (or the type-to-confirm field), stays inside the dialog, and returns to
 * where it was on close. Esc and a click on the backdrop cancel, unless busy.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  error,
  confirmText,
  children,
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return;
    setTyped('');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (inputRef.current ?? cancelRef.current)?.focus();
    return () => previous?.focus();
  }, [open]);

  if (!open) return null;

  const enabled = isConfirmEnabled(typed, confirmText, busy);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!busy) onCancel();
      return;
    }
    if (event.key === 'Enter' && event.target === inputRef.current && enabled) {
      event.preventDefault();
      onConfirm();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const next = trapFocusIndex(controls.length, controls.indexOf(document.activeElement as HTMLElement), event.shiftKey);
    event.preventDefault();
    controls[next]?.focus();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        aria-hidden
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={busy ? undefined : onCancel}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-md rounded-xl border border-border bg-surface-bg p-6 shadow-lg"
      >
        <div className="flex gap-4">
          {tone === 'danger' && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-critical-bg text-status-critical">
              <AlertTriangle aria-hidden className="h-5 w-5" />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 id={titleId} className="text-base font-semibold text-content-strong">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-content-muted">
                {description}
              </p>
            )}
            {children && <div className="mt-2 flex flex-col gap-3 text-sm text-content">{children}</div>}
            {confirmText !== undefined && (
              <label className="mt-2 flex flex-col gap-1.5 text-sm text-content">
                <span>
                  Type <span className="font-mono font-semibold text-content-strong">{confirmText}</span> to confirm
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={typed}
                  disabled={busy}
                  onChange={(event) => setTyped(event.target.value)}
                  data-testid={`${testId}-input`}
                  className={inputBase}
                />
              </label>
            )}
            {error && (
              <p role="alert" data-testid={`${testId}-error`} className="text-sm text-status-critical">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onCancel}
            data-testid={`${testId}-cancel`}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            isLoading={busy}
            disabled={!enabled}
            onClick={onConfirm}
            data-testid={`${testId}-confirm`}
            className={cn(tone === 'danger' && 'focus-visible:ring-status-critical')}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
