'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import {
  ApiError,
  getAccessToken,
  listTemplates,
  type KpiTemplate,
} from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  Select,
  Skeleton,
} from '../../../components/ui';

const FUNCTIONS = ['', 'finance', 'sales', 'marketing', 'ops', 'hr', 'support', 'engineering'] as const;

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<KpiTemplate[] | null>(null);
  const [fn, setFn] = useState('');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback((opts?: { function?: string; search?: string }) => {
    setTemplates(null);
    setErr(null);
    const fnArg = opts?.function ?? fn;
    const searchArg = opts?.search ?? search;
    listTemplates({ function: fnArg || undefined, search: searchArg || undefined })
      .then(setTemplates)
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [fn, search]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    // Initial load on mount; subsequent loads are driven by the debounce effect
    // and the function/search change handlers below.
    load();
  }, [router]);

  // Debounced search-on-type. Skips the initial render (mount effect already
  // loaded once); re-runs whenever the search term changes thereafter.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchMountedRef = useRef(false);
  useEffect(() => {
    if (!searchMountedRef.current) {
      searchMountedRef.current = true;
      return;
    }
    if (!getAccessToken()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load({ search }), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const onFunctionChange = (value: string) => {
    setFn(value);
    load({ function: value });
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    load({ search });
  };

  return (
    <RequirePermission permission="KPI_VIEW">
    <AppShell
      title="Templates"
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'KPIs', href: '/kpis' },
        { label: 'Templates' },
      ]}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-content-strong">KPI Templates</h1>
          <p className="text-sm text-content-muted">
            Start from a curated metric — pick one to open a prefilled create form where you customize the
            name, scope, target, and category before creating it.
          </p>
        </div>

        <KpiSubnav />

        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tmpl-fn">Function</Label>
            <Select
              id="tmpl-fn"
              value={fn}
              onChange={(e) => onFunctionChange(e.target.value)}
              className="w-44"
              data-testid="tmpl-function"
            >
              {FUNCTIONS.map((f) => (
                <option key={f} value={f}>
                  {f || 'All functions'}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="tmpl-search-input">Search</Label>
            <Input
              id="tmpl-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="revenue, churn, …"
              data-testid="tmpl-search"
            />
          </div>
          <Button type="submit" variant="secondary" data-testid="tmpl-search-btn">
            Search
          </Button>
        </form>

        {err && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-2 text-sm text-status-critical"
          >
            {err}
          </div>
        )}

        {templates === null && !err && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        )}

        {templates && templates.length === 0 && (
          <Card>
            <EmptyState title="No templates match" description="Try a different function or search term." />
          </Card>
        )}

        {templates && templates.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="tmpl-grid">
            {templates.map((t) => (
              <Card key={t.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-content-strong">{t.name}</h3>
                    {t.scorecardQuadrant && <Badge tone="neutral">{t.scorecardQuadrant}</Badge>}
                  </div>
                  <p className="mt-1 flex-1 text-sm text-content-muted">{t.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    {t.function && (
                      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-content-muted">
                        {t.function}
                      </span>
                    )}
                    {t.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-content-muted"
                      >
                        {tag}
                      </span>
                    ))}
                    {t.popularity > 0 && (
                      <span
                        className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-content-muted"
                        data-testid={`tmpl-popularity-${t.slug}`}
                        title={`Used ${t.popularity} time${t.popularity === 1 ? '' : 's'}`}
                      >
                        Used {t.popularity}×
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/kpis/new?template=${t.id}`}
                    className="mt-4 block"
                    data-testid={`tmpl-use-${t.slug}`}
                  >
                    <Button className="w-full">Use template</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
    </RequirePermission>
  );
}
