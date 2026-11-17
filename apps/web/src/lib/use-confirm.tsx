'use client';

import { ConfirmDialog } from '@kpi-nexus/ui';
import { type ReactNode, createContext, useCallback, useContext, useReducer, useRef } from 'react';

export interface ConfirmOptions {
  /** Says what will happen, naming the thing: `Delete “${kpi.name}”?` */
  title: ReactNode;
  /** The consequence, in a sentence. */
  description?: ReactNode;
  /** The verb on the confirm button, e.g. "Delete KPI". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for anything that deletes or cannot be undone. */
  tone?: 'default' | 'danger';
  /** Choices that go with the question, shown under the description. */
  body?: ReactNode;
  /** The user must type this text first (for purges). */
  confirmText?: string;
  testId?: string;
  /**
   * The work itself. When given, the dialog stays open and busy while it runs,
   * shows the reason if it fails (and lets the user retry or cancel), and
   * `confirm()` resolves true only once it has succeeded.
   */
  action?: () => Promise<void> | void;
}

export interface ConfirmState {
  request: ConfirmOptions | null;
  busy: boolean;
  error: string | null;
}

export const CLOSED: ConfirmState = { request: null, busy: false, error: null };

export type ConfirmAction =
  | { type: 'open'; request: ConfirmOptions }
  | { type: 'start' }
  | { type: 'fail'; error: string }
  | { type: 'close' };

export function confirmReducer(state: ConfirmState, action: ConfirmAction): ConfirmState {
  switch (action.type) {
    case 'open':
      return { request: action.request, busy: false, error: null };
    case 'start':
      return { ...state, busy: true, error: null };
    case 'fail':
      return { ...state, busy: false, error: action.error };
    case 'close':
      return CLOSED;
  }
}

/** The sentence shown in the dialog when its action fails. */
export function confirmErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Renders the app's one confirm dialog. Mounted once, in app/providers.tsx. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(confirmReducer, CLOSED);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    dispatch({ type: 'close' });
  }, []);

  const confirm = useCallback<Confirm>((request) => {
    // A second question replaces the first, which counts as cancelled.
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      dispatch({ type: 'open', request });
    });
  }, []);

  const onConfirm = useCallback(async () => {
    const action = state.request?.action;
    if (!action) {
      settle(true);
      return;
    }
    dispatch({ type: 'start' });
    try {
      await action();
      settle(true);
    } catch (err) {
      dispatch({ type: 'fail', error: confirmErrorMessage(err) });
    }
  }, [state.request, settle]);

  const { request } = state;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={request !== null}
        title={request?.title ?? ''}
        description={request?.description}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        tone={request?.tone}
        confirmText={request?.confirmText}
        testId={request?.testId}
        busy={state.busy}
        error={state.error}
        onConfirm={() => void onConfirm()}
        onCancel={() => settle(false)}
      >
        {request?.body}
      </ConfirmDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Ask before a destructive action:
 *
 *   const confirm = useConfirm();
 *   await confirm({ title: `Delete “${name}”?`, confirmLabel: 'Delete', tone: 'danger', action: () => deleteKpi(id) });
 *
 * Resolves true when the user confirmed (and `action`, if given, succeeded), false when they cancelled.
 */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    return () => {
      throw new Error('useConfirm needs <ConfirmProvider> (mounted in app/providers.tsx)');
    };
  }
  return confirm;
}
