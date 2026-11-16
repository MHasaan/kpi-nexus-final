'use client';

import { type ToastItem, type ToastTone, ToastViewport } from '@kpi-nexus/ui';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

/** At most this many toasts on screen; a new one pushes the oldest out. */
export const MAX_TOASTS = 4;

/** How long a toast stays. Errors stay longer so they can be read. */
export function toastDurationMs(tone: ToastTone): number {
  return tone === 'error' ? 8000 : 5000;
}

export type ToastAction = { type: 'add'; toast: ToastItem } | { type: 'dismiss'; id: string };

export function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  if (action.type === 'add') return [...state, action.toast].slice(-MAX_TOASTS);
  return state.some((t) => t.id === action.id) ? state.filter((t) => t.id !== action.id) : state;
}

export interface ToastOptions {
  tone?: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  /** Override how long it stays; 0 keeps it until dismissed. */
  durationMs?: number;
}

export interface ToastApi {
  /** Show a toast; returns its id. */
  toast: (options: ToastOptions) => string;
  success: (title: ReactNode, description?: ReactNode) => string;
  error: (title: ReactNode, description?: ReactNode) => string;
  info: (title: ReactNode, description?: ReactNode) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Outside the provider (unit tests that call a component directly) toasts go
 * nowhere. The app always has the provider: it is mounted in app/providers.tsx.
 */
const NO_TOASTS: ToastApi = {
  toast: () => '',
  success: () => '',
  error: () => '',
  info: () => '',
  dismiss: () => undefined,
};

/** Holds the toasts and renders them. Mounted once, in app/providers.tsx. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    dispatch({ type: 'dismiss', id });
  }, []);

  const toast = useCallback(
    ({ tone = 'info', title, description, durationMs }: ToastOptions) => {
      nextId.current += 1;
      const id = `toast-${nextId.current}`;
      dispatch({ type: 'add', toast: { id, tone, title, description } });
      const duration = durationMs ?? toastDurationMs(tone);
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Feedback for an action that does not navigate: `useToast().success('Invitation sent')`. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NO_TOASTS;
}
