'use client';

import { getAccessToken, listKpis } from './api-client';
import { useAsyncData } from './use-async-data';

/**
 * KPI names by id, for pages that hold only ids (an alert, an insight, a
 * recommendation). `nameOf` falls back to "a KPI" for one the reader cannot
 * see or that no longer exists — never to a fragment of its id.
 */
export function useKpiNames(): { nameOf: (kpiId: string | null | undefined) => string } {
  const signedIn = typeof window !== 'undefined' && Boolean(getAccessToken());
  const kpis = useAsyncData(() => listKpis(), [], { enabled: signedIn });
  return { nameOf: (kpiId) => (kpiId ? kpis.data?.find((k) => k.id === kpiId)?.name : undefined) ?? 'a KPI' };
}
