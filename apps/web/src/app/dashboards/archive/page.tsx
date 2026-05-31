'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../../components/app-shell';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import {
  ApiError,
  getAccessToken,
  listArchivedDashboards,
  purgeDashboard,
  restoreDashboard,
  type Dashboard,
} from '../../../lib/api-client';

export default function DashboardArchivePage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listArchivedDashboards()
      .then(setDashboards)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [load, router]);

  const onRestore = async (id: string) => {
    await restoreDashboard(id).catch(() => undefined);
    load();
  };

  const onPurge = async (id: string) => {
    if (!window.confirm('Permanently delete this dashboard and all its data? This cannot be undone.')) return;
    await purgeDashboard(id).catch(() => undefined);
    load();
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/dashboards" className="text-sm text-content-muted hover:text-content-default">
            ← Dashboards
          </Link>
        </div>
        <h1 className="text-2xl font-semibold text-content-strong">Archived Dashboards</h1>
        <p className="mt-1 text-sm text-content-muted">
          Soft-deleted dashboards. Restore brings them back; purge deletes permanently.
        </p>

        {error && (
          <p className="mt-4 text-sm text-status-critical" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 rounded-lg border border-border bg-surface-1" data-testid="dashboard-archive-list">
          {(dashboards ?? []).map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between border-b border-border px-5 py-3 last:border-0"
              data-testid={`dashboard-archive-row-${d.id}`}
            >
              <div>
                <span className="text-content-strong">{d.name}</span>
                <span className="ml-2 text-xs text-content-muted">
                  archived {d.deletedAt ? new Date(d.deletedAt).toLocaleDateString() : ''}
                </span>
              </div>
              <div className="flex gap-3">
                <PermissionGuard permission="DASHBOARD_MANAGE">
                  <button
                    onClick={() => onRestore(d.id)}
                    className="text-sm text-accent-primary hover:underline"
                    data-testid={`restore-${d.id}`}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => onPurge(d.id)}
                    className="text-sm text-status-critical hover:underline"
                    data-testid={`purge-${d.id}`}
                  >
                    Purge
                  </button>
                </PermissionGuard>
              </div>
            </div>
          ))}
          {dashboards && dashboards.length === 0 && (
            <p className="px-5 py-8 text-center text-content-muted" data-testid="dashboard-archive-empty">
              Nothing archived.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
