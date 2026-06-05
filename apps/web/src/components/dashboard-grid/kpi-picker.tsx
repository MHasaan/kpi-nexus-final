'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

import { listKpis, type KpiSummary } from '../../lib/api-client';
import { Badge, Input, ScopeBadge, Skeleton } from '../ui';

export interface KpiPickerProps {
  value: string | undefined;
  onChange: (kpiId: string | undefined) => void;
  /** Pre-loaded KPI list. If omitted, the picker loads via `listKpis()` itself. */
  kpis?: KpiSummary[];
  label?: string;
  required?: boolean;
  testId?: string;
}

// Module-level cache so multiple pickers don't each re-fetch the full list.
let kpiCache: KpiSummary[] | null = null;
let kpiCachePromise: Promise<KpiSummary[]> | null = null;

async function loadKpisCached(): Promise<KpiSummary[]> {
  if (kpiCache) return kpiCache;
  if (!kpiCachePromise) {
    kpiCachePromise = listKpis()
      .then((rows) => {
        kpiCache = rows;
        return rows;
      })
      .catch((err) => {
        // Allow a later retry after a failure.
        kpiCachePromise = null;
        throw err;
      });
  }
  return kpiCachePromise;
}

/**
 * Searchable KPI picker. Filters by name (case-insensitive), shows scope + unit,
 * and surfaces the currently-selected KPI with a clear button.
 */
export function KpiPicker({
  value,
  onChange,
  kpis,
  label = 'KPI',
  required = false,
  testId = 'kpi-picker',
}: KpiPickerProps) {
  const [loaded, setLoaded] = useState<KpiSummary[] | null>(kpis ?? kpiCache);
  const [loading, setLoading] = useState(kpis == null && kpiCache == null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (kpis) {
      setLoaded(kpis);
      setLoading(false);
      return;
    }
    if (kpiCache) {
      setLoaded(kpiCache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadKpisCached()
      .then((rows) => {
        if (!cancelled) {
          setLoaded(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load KPIs');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kpis]);

  const all = loaded ?? [];
  const selected = useMemo(
    () => all.find((k) => k.id === value) ?? null,
    [all, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((k) => k.name.toLowerCase().includes(q));
  }, [all, query]);

  const labelId = `${testId}-label`;

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span id={labelId} className="text-xs font-medium text-content-strong">
          {label}
          {required && <span className="ml-0.5 text-status-critical">*</span>}
        </span>
        {selected && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            data-testid={`${testId}-clear`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-content-muted transition-colors hover:text-content-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear
          </button>
        )}
      </div>

      {selected && (
        <div
          data-testid={`${testId}-selected`}
          className="flex items-center gap-2 rounded-md border border-accent-primary/40 bg-accent-bg px-3 py-2"
        >
          <span className="truncate text-sm font-medium text-content-strong" title={selected.name}>
            {selected.name}
          </span>
          {selected.unit && (
            <span className="font-mono text-xs text-content-muted">{selected.unit}</span>
          )}
          <ScopeBadge scope={selected.scope} className="ml-auto" />
        </div>
      )}

      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search KPIs…"
        aria-labelledby={labelId}
        data-testid={`${testId}-search`}
      />

      <div
        role="listbox"
        aria-labelledby={labelId}
        className="max-h-[240px] overflow-auto rounded-md border border-border bg-surface-bg"
      >
        {loading ? (
          <div className="space-y-1 p-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : error ? (
          <p
            role="alert"
            className="px-3 py-4 text-center text-xs text-status-critical"
          >
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-content-muted">
            {all.length === 0 ? 'No KPIs available' : 'No KPIs match'}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((k) => {
              const isSelected = k.id === value;
              return (
                <li key={k.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onChange(k.id)}
                    data-testid={`${testId}-option-${k.id}`}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      isSelected
                        ? 'bg-accent-bg text-content-strong'
                        : 'text-content-default hover:bg-surface-2',
                    )}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden />
                    ) : (
                      <span className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span className="truncate" title={k.name}>
                      {k.name}
                    </span>
                    {k.unit && (
                      <span className="font-mono text-xs text-content-muted">{k.unit}</span>
                    )}
                    <ScopeBadge scope={k.scope} className="ml-auto shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {required && !value && !loading && (
        <Badge tone="warning" className="self-start">
          Select a KPI
        </Badge>
      )}
    </div>
  );
}
