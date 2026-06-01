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
    await restoreKpi(id).catch(() => undefined);
    load();
  };
  const onPurge = async (id: string) => {
    if (!window.confirm('Permanently delete this KPI and all its data? This cannot be undone.')) return;
    await purgeKpi(id).catch(() => undefined);
    load();
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

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
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
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onRestore(k.id)} data-testid={`restore-${k.id}`}>
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onPurge(k.id)}
                    data-testid={`purge-${k.id}`}
                    className="text-status-critical hover:bg-status-critical-bg"
                  >
                    Purge now
                  </Button>
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
