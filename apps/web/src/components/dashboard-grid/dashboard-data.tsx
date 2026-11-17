'use client';

import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  type DashboardSummaryRow,
  type KpiSummary,
  getDashboardSummary,
  listKpis,
} from '../../lib/api-client';

export interface DashboardData {
  /** The KPI definitions, by id. */
  kpis: Map<string, KpiSummary>;
  /** One summary row per visible KPI: latest value, target, and the server's direction-aware status. */
  rows: Map<string, DashboardSummaryRow>;
  loading: boolean;
  error: string | null;
  /** Bumped when fresh values arrive; a widget reloads its own series when it changes. */
  refreshKey: number;
}

const DashboardDataContext = createContext<DashboardData | null>(null);

/**
 * Loads the KPI list and the dashboard summary ONCE for a whole dashboard.
 *
 * Every widget used to call `listKpis()` for itself, so a twelve-widget board
 * downloaded the whole KPI catalogue twelve times. The summary also carries the
 * server's direction-aware `status`, which the KPI card needs to colour a
 * lower-is-better KPI correctly.
 *
 * Widgets still load their own data points: only a chart needs the series.
 */
export function DashboardDataProvider({
  dateRange,
  refreshKey,
  children,
}: {
  dateRange?: { from?: string; to?: string };
  /** Bump to reload, e.g. when a value arrives over the realtime stream. */
  refreshKey?: number;
  children: ReactNode;
}) {
  const [kpis, setKpis] = useState<Map<string, KpiSummary>>(new Map());
  const [rows, setRows] = useState<Map<string, DashboardSummaryRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const from = dateRange?.from;
  const to = dateRange?.to;
  // What was last loaded for: a change of range shows "loading"; a refresh of
  // the same range swaps the numbers in place, without blanking the board.
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const range = `${from ?? ''}|${to ?? ''}`;
    if (loadedFor.current !== range) setLoading(true);
    setError(null);
    Promise.all([listKpis(), getDashboardSummary({ from, to })])
      .then(([allKpis, summary]) => {
        if (cancelled) return;
        setKpis(new Map(allKpis.map((k) => [k.id, k])));
        setRows(new Map(summary.map((r) => [r.kpiId, r])));
        loadedFor.current = range;
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this dashboard’s KPIs.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, refreshKey]);

  const value = useMemo<DashboardData>(
    () => ({ kpis, rows, loading, error, refreshKey: refreshKey ?? 0 }),
    [kpis, rows, loading, error, refreshKey],
  );
  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

/**
 * The dashboard's shared KPI data, or null outside a dashboard (the widget
 * editor's live preview renders a widget on its own).
 */
export function useDashboardData(): DashboardData | null {
  return useContext(DashboardDataContext);
}
