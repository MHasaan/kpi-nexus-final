'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type DraftSyncAction,
  type DraftSyncState,
  draftSyncReducer,
  initialDraftSync,
  showOfflineBanner,
} from '@/lib/draft-sync';
import { type CachedDraft, patchDraft } from '@/lib/onboarding-client';

/**
 * Debounced draft autosave (600 ms). A failed save keeps the edit and marks the
 * draft offline; `flush()` retries now, and the browser's `online` event
 * retries automatically. `flush()` resolves true once nothing is unsaved.
 */
export function useDraftSync(handle: CachedDraft | null) {
  const ref = useRef<DraftSyncState>(initialDraftSync(true));
  const [state, setState] = useState<DraftSyncState>(ref.current);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((action: DraftSyncAction) => {
    ref.current = draftSyncReducer(ref.current, action);
    setState(ref.current);
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const current = ref.current;
    if (!handle || current.inFlight) return false;
    if (!current.pending) return true;
    const patch = current.pending;
    apply({ type: 'flush-start' });
    try {
      await patchDraft(handle.sessionId, handle.draftToken, patch, 'org');
      apply({ type: 'flush-ok' });
    } catch {
      apply({ type: 'flush-fail' });
      return false;
    }
    // An edit made while that save was in flight goes next.
    return ref.current.pending ? flush() : true;
  }, [handle, apply]);

  const edit = useCallback(
    (patch: Record<string, unknown>) => {
      apply({ type: 'edit', patch });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    [apply, flush],
  );

  useEffect(() => {
    apply({ type: 'connection', online: navigator.onLine });
    const onOnline = () => {
      apply({ type: 'connection', online: true });
      void flush();
    };
    const onOffline = () => apply({ type: 'connection', online: false });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [apply, flush]);

  return { state, edit, flush };
}

/** Header badge: saving / saved / not saved. */
export function DraftStatusBadge({ state }: { state: DraftSyncState }) {
  const unsaved = state.status === 'offline';
  return (
    <span data-testid="sync-status" data-status={state.status} className={`ml-auto inline-flex items-center gap-1 text-xs ${unsaved ? 'text-status-critical' : 'text-content-muted'}`}>
      {state.status === 'saving' && (
        <>
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-content-muted border-t-transparent" />
          Saving…
        </>
      )}
      {state.status === 'saved' && 'Saved ✓'}
      {unsaved && '⚠ Not saved'}
    </span>
  );
}

/** Top warning while offline or after a failed save, with a retry. */
export function OfflineBanner({ state, onRetry }: { state: DraftSyncState; onRetry: () => void }) {
  if (!showOfflineBanner(state)) return null;
  const message = !state.online
    ? 'You are offline. Keep this tab open: your changes will be saved when you reconnect.'
    : 'Your latest changes could not be saved. Keep this tab open and retry.';
  return (
    <div data-testid="offline-banner" role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-status-critical/40 bg-status-critical/10 px-4 py-3">
      <span className="text-sm text-content-strong">{message}</span>
      {state.online && state.pending && (
        <button type="button" data-testid="offline-retry" onClick={onRetry} className="shrink-0 rounded border border-border bg-surface-1 px-3 py-1 text-xs font-medium text-content-strong hover:border-accent-primary">
          Retry now
        </button>
      )}
    </div>
  );
}
