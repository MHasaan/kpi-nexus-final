'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api-client';

interface ChecklistItem {
  key: string;
  category: string;
  label: string;
  status: 'pending' | 'complete' | 'dismissed';
}
interface ChecklistView {
  items: ChecklistItem[];
  total: number;
  complete: number;
}

/**
 * The post-onboarding setup checklist shown on the dashboard. Progress bar +
 * pending tasks with complete/dismiss; a collapsible done/dismissed section.
 */
export function SetupChecklistCard() {
  const [view, setView] = useState<ChecklistView | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    api<ChecklistView>('/setup-checklist').then(setView).catch((e: unknown) => {
      if (!(e instanceof ApiError)) return;
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, action: 'complete' | 'dismiss' | 'reset') => {
    try {
      const next = await api<ChecklistView>(`/setup-checklist/${key}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      setView(next);
    } catch {
      /* ignore */
    }
  };

  if (!view) return null;
  const pending = view.items.filter((i) => i.status === 'pending');
  const done = view.items.filter((i) => i.status !== 'pending');
  const pct = view.total === 0 ? 0 : Math.round((view.complete / view.total) * 100);

  // Hide entirely once everything is handled.
  if (pending.length === 0 && view.complete === 0) return null;

  return (
    <section data-testid="setup-checklist-card" className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content-strong">Finish setting up</h2>
        <span className="text-xs text-content-muted" data-testid="checklist-progress">{view.complete} of {view.total} complete</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent-primary" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-4 space-y-2">
        {pending.map((t) => (
          <li key={t.key} data-testid={`checklist-${t.key}`} className="flex items-center gap-3 text-sm">
            <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-content-muted">{t.category}</span>
            <span className="text-content-strong">{t.label}</span>
            <div className="ml-auto flex gap-2">
              <button type="button" data-testid={`checklist-${t.key}-complete`} onClick={() => act(t.key, 'complete')} className="rounded bg-status-positive px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">Done</button>
              <button type="button" data-testid={`checklist-${t.key}-dismiss`} onClick={() => act(t.key, 'dismiss')} className="rounded border border-border px-2.5 py-1 text-xs text-content-muted hover:bg-surface-2">Dismiss</button>
            </div>
          </li>
        ))}
        {pending.length === 0 && <li className="text-sm text-content-muted">All set — nice work!</li>}
      </ul>

      {done.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowDone((s) => !s)} className="text-xs text-accent-primary hover:underline">
            {showDone ? 'Hide' : 'Show'} completed &amp; dismissed ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 space-y-1">
              {done.map((t) => (
                <li key={t.key} className="flex items-center gap-2 text-xs text-content-muted">
                  <span>{t.status === 'complete' ? '✓' : '–'}</span>
                  <span className="line-through">{t.label}</span>
                  <button type="button" onClick={() => act(t.key, 'reset')} className="ml-auto text-accent-primary hover:underline">undo</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
