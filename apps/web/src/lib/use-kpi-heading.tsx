'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { type KpiSummary, getKpi } from './api-client';
import { useAsyncData } from './use-async-data';

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
  const kpi = useAsyncData(() => getKpi(kpiId), [kpiId]);
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
