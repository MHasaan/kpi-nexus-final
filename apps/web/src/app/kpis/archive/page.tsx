'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ApiError,
  getAccessToken,
  listArchivedKpis,
  purgeKpi,
  restoreKpi,
  type KpiSummary,
} from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import { Badge, Button, Card, EmptyState, ScopeBadge, Skeleton } from '../../../components/ui';

const PURGE_WINDOW_DAYS = 30;

function daysUntilPurge(deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + PURGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

export default function ArchivePage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Row currently running a restore/purge request (disables its buttons).
  const [busyId, setBusyId] = useState<string | null>(null);
  // Row whose purge is awaiting inline confirmation.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    listArchivedKpis()
      .then(setKpis)
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
      await restoreKpi(id);
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to restore KPI');
    } finally {
      setBusyId(null);
    }
  };

  const onConfirmPurge = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await purgeKpi(id);
      setConfirmingId(null);
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to purge KPI');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <RequirePermission permission="KPI_VIEW">
    <AppShell
      title="Archive"
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'KPIs', href: '/kpis' },
        { label: 'Archive' },
      ]}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-content-strong">Archived KPIs</h1>
          <p className="text-sm text-content-muted">
            Soft-deleted KPIs are kept for {PURGE_WINDOW_DAYS} days. Restore brings them back; purge deletes
            permanently.
          </p>
        </div>

        <KpiSubnav />

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            data-testid="archive-error"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {actionError}
          </div>
        )}

        {kpis === null && !error && (
          <Card className="p-4">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        )}

        <Card className="overflow-hidden p-0" data-testid="archive-list">
          {(kpis ?? []).map((k) => {
            const remaining = daysUntilPurge(k.deletedAt);
            const isBusy = busyId === k.id;
            const isConfirming = confirmingId === k.id;
            return (
              <div
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border-divider px-5 py-3 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <ScopeBadge scope={k.scope} />
                  <div>
                    <span className="font-medium text-content-strong">{k.name}</span>
                    <span className="ml-2 text-xs text-content-muted">
                      archived {k.deletedAt ? new Date(k.deletedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  {remaining !== null && (
                    <Badge tone={remaining <= 5 ? 'warning' : 'neutral'}>
                      {remaining} day{remaining === 1 ? '' : 's'} until purge
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isConfirming ? (
                    <>
                      <span className="text-xs font-medium text-status-critical">Confirm purge?</span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void onConfirmPurge(k.id)}
                        isLoading={isBusy}
                        disabled={isBusy}
                        data-testid={`purge-confirm-${k.id}`}
                      >
                        Confirm purge
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingId(null)}
                        disabled={isBusy}
                        data-testid={`purge-cancel-${k.id}`}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void onRestore(k.id)}
                        isLoading={isBusy}
                        disabled={isBusy}
                        data-testid={`restore-${k.id}`}
                      >
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActionError(null);
                          setConfirmingId(k.id);
                        }}
                        disabled={isBusy}
                        data-testid={`purge-${k.id}`}
                        className="text-status-critical hover:bg-status-critical-bg"
                      >
                        Purge now
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {kpis && kpis.length === 0 && (
            <div data-testid="archive-empty">
              <EmptyState title="Nothing archived" description="Deleted KPIs will appear here for 30 days." />
            </div>
          )}
        </Card>
      </div>
    </AppShell>
    </RequirePermission>
  );
}
