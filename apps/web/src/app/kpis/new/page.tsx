'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { getAccessToken, getKpiTemplate, type KpiTemplate } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiForm, type KpiFormInitial } from '../../../components/kpis/kpi-form';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import { PageHeader, Skeleton } from '../../../components/ui';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

function NewKpiInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');

  const [template, setTemplate] = useState<KpiTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState<boolean>(Boolean(templateId));

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
    }
  }, [router]);

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      setLoadingTemplate(false);
      return;
    }
    let cancelled = false;
    setLoadingTemplate(true);
    getKpiTemplate(templateId)
      .then((t) => {
        if (!cancelled) setTemplate(t);
      })
      .catch(() => {
        if (!cancelled) setTemplate(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const initial: KpiFormInitial | undefined = template
    ? {
        name: template.name,
        type: template.type,
        unit: template.unit,
        scorecardQuadrant: template.scorecardQuadrant,
        tags: template.tags,
        description: template.description,
      }
    : undefined;

  if (loadingTemplate) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New KPI" subtitle="Define a KPI and how it is measured, scoped, and targeted." />
      <KpiSubnav />
      {template && (
        <p className="text-sm text-content-muted" data-testid="kpi-template-note">
          Starting from template: <span className="font-medium text-content-strong">{template.name}</span>
        </p>
      )}
      <KpiForm
        mode="create"
        initial={initial}
        templateHint={template?.targetSummary ?? null}
        onDone={(id) => router.push(`/kpis/${id}`)}
      />
    </div>
  );
}

export default function NewKpiPage() {
  return (
    <RequirePermission permission="KPI_CREATE">
      <AppShell
        title="New KPI"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'KPIs', href: '/kpis' },
          { label: 'New' },
        ]}
      >
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <NewKpiInner />
        </Suspense>
      </AppShell>
    </RequirePermission>
  );
}
