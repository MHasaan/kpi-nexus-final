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
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../../../components/ui';

const PURGE_WINDOW_DAYS = 30;

function daysUntilPurge(deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + PURGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

export default function DashboardArchivePage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Row currently running a restore/purge request (disables its buttons).
  const [busyId, setBusyId] = useState<string | null>(null);
  // Row whose purge is awaiting inline confirmation.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    setBusyId(id);
    setActionError(null);
    try {
      await restoreDashboard(id);
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to restore dashboard');
    } finally {
      setBusyId(null);
    }
  };

  const onConfirmPurge = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await purgeDashboard(id);
      setConfirmingId(null);
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to purge dashboard');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Archived Dashboards"
        subtitle={`Soft-deleted dashboards are kept for ${PURGE_WINDOW_DAYS} days. Restore brings them back; purge deletes permanently.`}
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

        {actionError && (
          <div
            role="alert"
            data-testid="dash-archive-error"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {actionError}
          </div>
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
            {dashboards.map((d) => {
              const remaining = daysUntilPurge(d.deletedAt);
              const isBusy = busyId === d.id;
              const isConfirming = confirmingId === d.id;
              return (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  data-testid={`dashboard-archive-row-${d.id}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-content-strong">{d.name}</span>
                      <span className="ml-2 text-xs tabular-nums text-content-muted">
                        archived {d.deletedAt ? new Date(d.deletedAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                    {remaining !== null && (
                      <Badge tone={remaining <= 5 ? 'warning' : 'neutral'}>
                        {remaining} day{remaining === 1 ? '' : 's'} until purge
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PermissionGuard permission="DASHBOARD_MANAGE">
                      {isConfirming ? (
                        <>
                          <span className="text-xs font-medium text-status-critical">
                            Confirm purge?
                          </span>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => void onConfirmPurge(d.id)}
                            isLoading={isBusy}
                            disabled={isBusy}
                            data-testid={`dash-purge-confirm-${d.id}`}
                          >
                            Confirm purge
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmingId(null)}
                            disabled={isBusy}
                            data-testid={`dash-purge-cancel-${d.id}`}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void onRestore(d.id)}
                            isLoading={isBusy}
                            disabled={isBusy}
                            data-testid={`dash-restore-${d.id}`}
                          >
                            Restore
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActionError(null);
                              setConfirmingId(d.id);
                            }}
                            disabled={isBusy}
                            data-testid={`dash-purge-${d.id}`}
                            className="text-status-critical hover:bg-status-critical-bg"
                          >
                            Purge
                          </Button>
                        </>
                      )}
                    </PermissionGuard>
                  </div>
                </div>
              );
            })}
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
