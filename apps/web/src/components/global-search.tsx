'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useTranslations } from '../i18n/locale-provider';
import { type SearchResult, globalSearch } from '../lib/polish-client';

const HREF: Record<SearchResult['type'], (id: string) => string> = {
  kpi: (id) => `/kpis/${id}`,
  dashboard: (id) => `/dashboards/${id}`,
  user: (id) => `/users/${id}`,
  orgUnit: (_id) => `/org-units`,
};

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  kpi: 'KPIs',
  dashboard: 'Dashboards',
  user: 'People',
  orgUnit: 'Units',
};

/** ⌘K / Ctrl-K global search palette. Debounced, grouped results. */
export function GlobalSearch() {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      globalSearch(q.trim()).then(setResults).catch(() => setResults([]));
    }, 300);
  }, [q, open]);

  const groups = (['kpi', 'dashboard', 'user', 'orgUnit'] as const)
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <button
        type="button"
        data-testid="global-search-trigger"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border bg-surface-bg px-3 py-1.5 text-sm text-content-muted hover:border-accent-primary"
      >
        {t('search.placeholder')} <kbd className="ml-2 rounded border border-border px-1 text-xs">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
          <div data-testid="global-search-modal" className="w-full max-w-lg rounded-lg border border-border bg-surface-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              data-testid="global-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search.placeholder')}
              className="w-full rounded-t-lg border-b border-border bg-surface-1 px-4 py-3 text-sm text-content-strong outline-none"
            />
            <div className="max-h-80 overflow-y-auto p-2" data-testid="global-search-results">
              {groups.map((g) => (
                <div key={g.type} className="mb-2">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-content-muted">{TYPE_LABEL[g.type]}</p>
                  {g.items.map((r) => (
                    <Link
                      key={`${r.type}-${r.id}`}
                      href={HREF[r.type](r.id)}
                      data-testid={`search-result-${r.id}`}
                      onClick={() => setOpen(false)}
                      className="block rounded px-2 py-1.5 text-sm text-content-strong hover:bg-surface-1"
                    >
                      {r.label}{r.sublabel ? <span className="ml-2 text-xs text-content-muted">{r.sublabel}</span> : null}
                    </Link>
                  ))}
                </div>
              ))}
              {q.trim() && groups.length === 0 && <p className="px-2 py-3 text-sm text-content-muted" data-testid="global-search-empty">No results.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
