'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acknowledgeAlert,
  ApiError,
  getAccessToken,
  getAlertUnreadCount,
  listAlerts,
  type Alert,
} from '../lib/api-client';

const POLL_MS = 30_000;

/**
 * Header notification bell: shows the count of OPEN alerts and a dropdown of
 * the most recent ones with inline acknowledge. Polls every 30s.
 */
export function AlertsBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<Alert[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    if (!getAccessToken()) return;
    try {
      const { count } = await getAlertUnreadCount();
      setCount(count);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return; // header is global; ignore
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const id = setInterval(() => void refreshCount(), POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        setRecent((await listAlerts({ status: 'OPEN' })).slice(0, 10));
      } catch {
        // ignore — dropdown just shows empty
      }
    }
  }

  async function ack(id: string) {
    setBusyId(id);
    try {
      await acknowledgeAlert(id);
      setRecent((prev) => prev.filter((a) => a.id !== id));
      await refreshCount();
    } catch {
      // best-effort
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => void toggle()}
        data-testid="alerts-bell"
        aria-label={`Alerts${count > 0 ? ` (${count} unread)` : ''}`}
        className="relative rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm hover:bg-surface-2"
      >
        <span aria-hidden>🔔</span>
        {count > 0 && (
          <span
            data-testid="alerts-bell-count"
            className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-status-critical px-1 text-[10px] font-semibold text-white"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="alerts-bell-dropdown"
          className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-surface-1 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-content-strong">Open alerts</span>
            <Link href="/alerts" className="text-xs text-accent-primary hover:underline" data-testid="alerts-bell-viewall">View all</Link>
          </div>
          <ul className="max-h-80 overflow-auto">
            {recent.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-content-muted">No open alerts.</li>
            )}
            {recent.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 border-b border-border px-3 py-2 last:border-0">
                <Link href={`/alerts/${a.id}`} className="min-w-0 flex-1 text-xs text-content-strong hover:text-accent-primary">
                  <span className="mr-1">{a.severity === 'HIGH' ? '🔴' : a.severity === 'MEDIUM' ? '🟡' : '🔵'}</span>
                  <span className="break-words">{a.message}</span>
                </Link>
                <button type="button" onClick={() => void ack(a.id)} disabled={busyId === a.id} data-testid={`alerts-bell-ack-${a.id}`} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-surface-2 disabled:opacity-50">Ack</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
