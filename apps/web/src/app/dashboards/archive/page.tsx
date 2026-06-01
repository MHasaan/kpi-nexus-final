'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';

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
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../../../components/ui';

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
      <PageHeader
        title="Archived Dashboards"
        subtitle="Soft-deleted dashboards. Restore brings them back; purge deletes permanently."
        actions={
          <Link href="/dashboards">
            <Button variant="ghost" size="sm">
              Back to dashboards
            </Button>
          </Link>
        }
      />

      <div className="mt-6 max-w-4xl space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </p>
        )}

        {dashboards === null && !error && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {dashboards && dashboards.length > 0 && (
          <Card data-testid="dashboard-archive-list" className="divide-y divide-border-divider">
            {dashboards.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
                data-testid={`dashboard-archive-row-${d.id}`}
              >
                <div className="min-w-0">
                  <span className="font-medium text-content-strong">{d.name}</span>
                  <span className="ml-2 text-xs tabular-nums text-content-muted">
                    archived {d.deletedAt ? new Date(d.deletedAt).toLocaleDateString() : ''}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <PermissionGuard permission="DASHBOARD_MANAGE">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onRestore(d.id)}
                      data-testid={`restore-${d.id}`}
                    >
                      Restore
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => onPurge(d.id)}
                      data-testid={`purge-${d.id}`}
                    >
                      Purge
                    </Button>
                  </PermissionGuard>
                </div>
              </div>
            ))}
          </Card>
        )}

        {dashboards && dashboards.length === 0 && (
          <Card>
            <div data-testid="dashboard-archive-empty">
              <EmptyState
                icon={Archive}
                title="Nothing archived"
                description="Dashboards you archive will appear here, ready to restore."
              />
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
