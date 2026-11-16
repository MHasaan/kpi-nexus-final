'use client';

import { type DependencyList, useCallback, useEffect, useReducer, useRef } from 'react';

export interface AsyncData<T> {
  /** The last successful result; kept on screen while reloading and after a failed reload. */
  data: T | null;
  /** Why the latest load failed, or null. Never swallowed: show it (X-02). */
  error: string | null;
  loading: boolean;
}

export const IDLE: AsyncData<never> = { data: null, error: null, loading: false };

export type AsyncDataAction<T> = { type: 'start' } | { type: 'ok'; data: T } | { type: 'fail'; error: string };

export function asyncDataReducer<T>(state: AsyncData<T>, action: AsyncDataAction<T>): AsyncData<T> {
  switch (action.type) {
    case 'start':
      return { data: state.data, error: null, loading: true };
    case 'ok':
      return { data: action.data, error: null, loading: false };
    case 'fail':
      return { data: state.data, error: action.error, loading: false };
  }
}

/** The sentence to show when a load fails. */
export function loadErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Could not load this. Please try again.';
}

/**
 * Load data when `deps` change and on `reload()`. Unlike a bare
 * `fn().catch(() => setData(null))`, a failure is reported in `error` instead of
 * looking like "nothing here". A slow earlier request never overwrites a newer one.
 */
export function useAsyncData<T>(fn: () => Promise<T>, deps: DependencyList): AsyncData<T> & { reload: () => void } {
  const [state, dispatch] = useReducer(asyncDataReducer<T>, IDLE as AsyncData<T>);
  const latest = useRef(0);

  // `fn` is recreated every render; `deps` says when its inputs really changed.
  const reload = useCallback(() => {
    latest.current += 1;
    const run = latest.current;
    dispatch({ type: 'start' });
    fn().then(
      (data) => {
        if (run === latest.current) dispatch({ type: 'ok', data });
      },
      (err: unknown) => {
        if (run === latest.current) dispatch({ type: 'fail', error: loadErrorMessage(err) });
      },
    );
  }, deps);

  useEffect(() => {
    reload();
    return () => {
      latest.current += 1; // drop a response that arrives after unmount or a deps change
    };
  }, [reload]);

  return { ...state, reload };
}
