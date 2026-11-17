/** The tabs of the KPI detail page, and how one is named in the address (`?tab=cascade`). */

export const KPI_TABS = ['Overview', 'Data', 'Assignments', 'Formula', 'Cascade', 'Targets', 'Thresholds', 'Benchmarks', 'Lineage', 'Audit'] as const;
export type KpiTab = (typeof KPI_TABS)[number];

/** Assignments only mean something for a KPI recorded per unit or per person. */
export function kpiTabsFor(scope: string): readonly KpiTab[] {
  return scope === 'ORG_WIDE' ? KPI_TABS.filter((t) => t !== 'Assignments') : KPI_TABS;
}

/**
 * The tab an address asks for. Anything that is not a tab of this KPI — a
 * typo, or Assignments on an organisation-wide KPI — opens Overview rather
 * than an empty page.
 */
export function kpiTabFromParam(param: string | null | undefined, scope: string): KpiTab {
  if (!param) return 'Overview';
  return kpiTabsFor(scope).find((t) => t.toLowerCase() === param.toLowerCase()) ?? 'Overview';
}

/** The address of a tab: Overview is the page itself, the others carry `?tab=`. */
export function kpiTabHref(kpiId: string, tab: KpiTab): string {
  return tab === 'Overview' ? `/kpis/${kpiId}` : `/kpis/${kpiId}?tab=${tab.toLowerCase()}`;
}

/** The analysis pages of one KPI, in the order they are offered. */
export const KPI_ANALYTICS_LINKS = [
  { key: 'forecast', label: 'Forecast' },
  { key: 'anomalies', label: 'Anomalies' },
  { key: 'whatif', label: 'What-if' },
  { key: 'embed', label: 'Embed' },
] as const;
