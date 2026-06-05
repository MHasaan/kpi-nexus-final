'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, getKpi, type KpiSummary } from '../../../../lib/api-client';
import { AppShell } from '../../../../components/app-shell';
import { RequirePermission } from '../../../../components/auth/require-permission';
import { KpiForm } from '../../../../components/kpis/kpi-form';
import { PageHeader, Skeleton } from '../../../../components/ui';

export default function EditKpiPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const kpiId = params.id;

  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    getKpi(kpiId)
      .then((k) => {
        if (!cancelled) setKpi(k);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load KPI');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kpiId, router]);

  return (
    <RequirePermission permission="KPI_EDIT">
      <AppShell
        title="Edit KPI"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'KPIs', href: '/kpis' },
          { label: kpi?.name ?? kpiId.slice(0, 8), href: `/kpis/${kpiId}` },
          { label: 'Edit' },
        ]}
      >
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error || !kpi ? (
          <div
            role="alert"
            className="rounded-lg border border-border bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {error ?? 'KPI not found.'}
          </div>
        ) : (
          <div className="space-y-6">
            <PageHeader title="Edit KPI" subtitle={kpi.name} />
            <KpiForm
              mode="edit"
              kpiId={kpi.id}
              initial={kpi}
              onDone={(id) => router.push(`/kpis/${id}`)}
            />
          </div>
        )}
      </AppShell>
    </RequirePermission>
  );
}
