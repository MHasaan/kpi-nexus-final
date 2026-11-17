'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const [failed, setFailed] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  // The result the arrow keys are on; Enter opens it.
  const [active, setActive] = useState(0);

  /** Close and forget the search: reopening used to show the last query, so typing appended to it (QA-L15). */
  const close = () => {
    setOpen(false);
    setQ('');
    setResults([]);
    setFailed(false);
    setActive(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQ('');
        setResults([]);
        setFailed(false);
        setActive(0);
      } else if (e.key === 'Escape') {
        close();
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
      setFailed(false);
      return;
    }
    debounce.current = setTimeout(() => {
      globalSearch(q.trim()).then(
        (found) => {
          setResults(found);
          setFailed(false);
          setActive(0);
        },
        () => {
          // A failed search is not "no results" (X-02).
          setResults([]);
          setFailed(true);
        },
      );
    }, 300);
  }, [q, open]);

  const groups = (['kpi', 'dashboard', 'user', 'orgUnit'] as const)
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0);
  // The results in the order they are shown, for the arrow keys.
  const ordered = groups.flatMap((g) => g.items);

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (ordered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % ordered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + ordered.length) % ordered.length);
    } else if (e.key === 'Enter') {
      const chosen = ordered[Math.min(active, ordered.length - 1)];
      if (!chosen) return;
      e.preventDefault();
      close();
      router.push(HREF[chosen.type](chosen.id));
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="global-search-trigger"
        onClick={() => setOpen(true)}
        aria-label={t('search.placeholder')}
        className="flex items-center rounded-md border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-muted hover:border-accent-primary sm:px-3"
      >
        {/* Icon-only on phones so the topbar fits (FE-017). */}
        <Search className="h-4 w-4 sm:hidden" aria-hidden />
        <span className="hidden sm:inline">{t('search.placeholder')}</span>
        <kbd className="ml-2 hidden rounded border border-border px-1 text-xs sm:inline">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={close}>
          <div data-testid="global-search-modal" className="w-full max-w-lg rounded-lg border border-border bg-surface-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              data-testid="global-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey}
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
                      data-active={ordered[active]?.id === r.id && ordered[active]?.type === r.type ? 'true' : undefined}
                      onClick={close}
                      className={`block rounded px-2 py-1.5 text-sm text-content-strong hover:bg-surface-1 ${ordered[active]?.id === r.id && ordered[active]?.type === r.type ? 'bg-surface-1 ring-1 ring-accent-primary/40' : ''}`}
                    >
                      {r.label}{r.sublabel ? <span className="ml-2 text-xs text-content-muted">{r.sublabel}</span> : null}
                    </Link>
                  ))}
                </div>
              ))}
              {q.trim() && failed && (
                <p className="px-2 py-3 text-sm text-status-critical" role="alert" data-testid="global-search-error">
                  Search is not answering. Try again in a moment.
                </p>
              )}
              {q.trim() && !failed && groups.length === 0 && <p className="px-2 py-3 text-sm text-content-muted" data-testid="global-search-empty">No results.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
