'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { type KpiSummary, getKpi } from './api-client';
import { useAsyncData } from './use-async-data';
import { usePermissions } from './use-permissions';

/**
 * The heading of a page about one KPI — its Forecast, Anomalies, What-if and
 * Embed pages. They were headed "Forecast" with "KPIs / Forecast" in the top
 * bar: nothing said which KPI was on the screen, or led back to it.
 *
 * Returns the trail for the top bar (KPIs › the KPI, both links) and a title
 * that ends with the KPI's name. Until the name arrives, or if it cannot be
 * read, the trail says "KPI" and the title stands alone.
 */
export function useKpiHeading(
  kpiId: string,
  title: string,
): { crumbs: Array<{ label: string; href: string }>; title: ReactNode; kpi: KpiSummary | null } {
  // Asked for only with a session. Someone signed out is on their way to the sign-in page, and the
  // request was refused (401) and logged as a console error on each of these pages (audit crawl).
  const { ready, authenticated } = usePermissions();
  const kpi = useAsyncData(() => getKpi(kpiId), [kpiId], { enabled: ready && authenticated });
  const name = kpi.data?.name ?? null;
  return {
    // The KPI itself, for a page that needs more of it than its name (its frequency, its unit).
    kpi: kpi.data ?? null,
    crumbs: [
      { label: 'KPIs', href: '/kpis' },
      { label: name ?? 'KPI', href: `/kpis/${kpiId}` },
    ],
    title: name ? (
      <>
        {title}{' '}
        <span className="text-lg font-medium text-content-muted">
          for{' '}
          <Link href={`/kpis/${kpiId}`} data-testid="kpi-page-kpi-name" className="hover:text-accent-primary hover:underline">
            {name}
          </Link>
        </span>
      </>
    ) : (
      title
    ),
  };
}
