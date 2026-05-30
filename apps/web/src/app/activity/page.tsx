'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../lib/api-client';
import { type ActivityItem, listActivity } from '../../lib/polish-client';

export default function ActivityPage() {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [entityType, setEntityType] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (reset: boolean, nextCursor?: string) => {
    try {
      const page = await listActivity({ cursor: nextCursor, entityType: entityType || undefined, limit: 25 });
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load activity');
    }
  }, [entityType]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load(true);
  }, [load, router]);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Activity</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-content-strong">Activity feed</h1>
          <select
            data-testid="activity-entity-filter"
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); }}
            className="rounded border border-border bg-surface-1 px-2 py-1 text-sm text-content-strong"
          >
            <option value="">All entities</option>
            <option value="KPI">KPI</option>
            <option value="Dashboard">Dashboard</option>
            <option value="Task">Task</option>
            <option value="User">User</option>
          </select>
        </div>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="activity-error">{error}</p>}

        <ol className="mt-6 space-y-2" data-testid="activity-list">
          {items.map((a) => (
            <li key={a.id} data-testid={`activity-${a.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm">
              <span className="text-content-strong">
                <span className="font-medium">{a.userName ?? 'System'}</span>{' '}
                <span className="text-content-muted">{a.action.toLowerCase()}</span>{' '}
                {a.entityType && <span className="text-content-strong">{a.entityType}</span>}
              </span>
              <span className="text-xs text-content-muted">{new Date(a.createdAt).toLocaleString()}</span>
            </li>
          ))}
          {items.length === 0 && <li className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="activity-empty">No activity yet.</li>}
        </ol>

        {cursor && (
          <button type="button" data-testid="activity-load-more" onClick={() => void load(false, cursor)} className="mt-4 rounded border border-border px-4 py-2 text-sm text-content-strong hover:border-accent-primary">
            Load more
          </button>
        )}
      </div>
    </main>
  );
}
