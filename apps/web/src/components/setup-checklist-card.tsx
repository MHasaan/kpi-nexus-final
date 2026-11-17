'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ApiError, api } from '../lib/api-client';
import { useAsyncData } from '../lib/use-async-data';
import { PermissionGuard } from './auth/permission-guard';

interface ChecklistItem {
  key: string;
  category: string;
  label: string;
  /** The page where this task is done. */
  href?: string;
  status: 'pending' | 'complete' | 'dismissed';
  /** Complete because the work itself exists, not because someone ticked it. */
  detected?: boolean;
}
interface ChecklistView {
  items: ChecklistItem[];
  total: number;
  complete: number;
}

/**
 * The post-onboarding setup checklist shown on the dashboard. Each task links
 * to the page where it is done, and is ticked off on its own once it has been
 * (plan 3.3 / 3.11). Everyone sees progress; only ORG_SETTINGS holders can tick,
 * dismiss or undo an item (BE-022).
 */
export function SetupChecklistCard() {
  const { data: loaded, error: loadError, reload } = useAsyncData(() => api<ChecklistView>('/setup-checklist'), []);
  const [changed, setChanged] = useState<ChecklistView | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const view = changed ?? loaded;

  const act = async (key: string, action: 'complete' | 'dismiss' | 'reset') => {
    setActionError(null);
    setBusyKey(key);
    try {
      setChanged(await api<ChecklistView>(`/setup-checklist/${key}/${action}`, { method: 'POST', body: JSON.stringify({}) }));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'That change could not be saved. Please try again.');
    } finally {
      setBusyKey(null);
    }
  };

  if (!view) {
    if (!loadError) return null;
    return (
      <section data-testid="checklist-load-error" role="alert" className="rounded-lg border border-border bg-surface-1 p-5 text-sm text-content-muted">
        The setup checklist could not be loaded.{' '}
        <button type="button" onClick={reload} className="font-medium text-accent-primary hover:underline">
          Try again
        </button>
      </section>
    );
  }

  const pending = view.items.filter((i) => i.status === 'pending');
  const done = view.items.filter((i) => i.status !== 'pending');
  const pct = view.total === 0 ? 0 : Math.round((view.complete / view.total) * 100);

  // Hide entirely once everything was dismissed without doing any of it.
  if (pending.length === 0 && view.complete === 0) return null;

  return (
    <section data-testid="setup-checklist-card" className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content-strong">Finish setting up</h2>
        <span className="text-xs text-content-muted" data-testid="checklist-progress">
          {view.complete} of {view.total} complete
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={view.total}
        aria-valuenow={view.complete}
      >
        <div className="h-full bg-accent-primary" style={{ width: `${pct}%` }} />
      </div>

      {actionError && (
        <p role="alert" data-testid="checklist-error" className="mt-3 text-sm text-status-critical">
          {actionError}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {pending.map((t) => (
          <li key={t.key} data-testid={`checklist-${t.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-content-muted">{t.category}</span>
            {t.href ? (
              <Link href={t.href} className="font-medium text-content-strong hover:text-accent-primary hover:underline">
                {t.label}
              </Link>
            ) : (
              <span className="text-content-strong">{t.label}</span>
            )}
            <PermissionGuard permission="ORG_SETTINGS">
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  data-testid={`checklist-${t.key}-complete`}
                  onClick={() => void act(t.key, 'complete')}
                  disabled={busyKey === t.key}
                  aria-label={`Mark "${t.label}" as done`}
                  className="rounded border border-border px-2.5 py-1 text-xs font-medium text-content-strong hover:border-accent-primary disabled:opacity-50"
                >
                  Mark done
                </button>
                <button
                  type="button"
                  data-testid={`checklist-${t.key}-dismiss`}
                  onClick={() => void act(t.key, 'dismiss')}
                  disabled={busyKey === t.key}
                  aria-label={`Dismiss "${t.label}"`}
                  className="rounded px-2.5 py-1 text-xs text-content-muted hover:bg-surface-2 disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </PermissionGuard>
          </li>
        ))}
        {pending.length === 0 && (
          <li className="text-sm text-content-muted" data-testid="checklist-all-set">
            All set — nothing left to do here.
          </li>
        )}
      </ul>

      {done.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            data-testid="checklist-toggle-done"
            aria-expanded={showDone}
            onClick={() => setShowDone((s) => !s)}
            className="text-xs text-accent-primary hover:underline"
          >
            {showDone ? 'Hide' : 'Show'} completed &amp; dismissed ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 space-y-1">
              {done.map((t) => (
                <li key={t.key} data-testid={`checklist-done-${t.key}`} className="flex items-center gap-2 text-xs text-content-muted">
                  <span aria-hidden>{t.status === 'complete' ? '✓' : '–'}</span>
                  <span className={t.status === 'dismissed' ? 'line-through' : undefined}>{t.label}</span>
                  <span className="sr-only">{t.status === 'complete' ? 'done' : 'dismissed'}</span>
                  {/* Work that exists cannot be un-done from a checklist. */}
                  {!t.detected && (
                    <PermissionGuard permission="ORG_SETTINGS">
                      <button
                        type="button"
                        onClick={() => void act(t.key, 'reset')}
                        disabled={busyKey === t.key}
                        aria-label={`Undo "${t.label}"`}
                        className="ml-auto text-accent-primary hover:underline disabled:opacity-50"
                      >
                        undo
                      </button>
                    </PermissionGuard>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
