'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Search } from 'lucide-react';

import {
  ApiError,
  addWidget,
  clearTokens,
  createDashboard,
  getAccessToken,
  listKpis,
  type KpiSummary,
} from '../../../lib/api-client';
import {
  TerminologyProvider,
  useTerminology,
} from '../../../lib/terminology-context';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { WIDGET_META } from '../../../components/dashboard-grid/widget-meta';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  PageHeader,
  ScopeBadge,
  Skeleton,
  Textarea,
} from '../../../components/ui';

// Cards-per-row when laying out the starter KPI cards on the new grid.
// kpi_card defaultSize is 3 wide; a 12-col grid fits 4 across, but 3-wide
// rows read more comfortably and match the rest of the app's density.
const STARTER_COLS = 4;

export default function NewDashboardPage() {
  return (
    <TerminologyProvider>
      <NewDashboardInner />
    </TerminologyProvider>
  );
}

function NewDashboardInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);

  const [kpis, setKpis] = useState<KpiSummary[] | null>(null);
  const [kpiLoadError, setKpiLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  // null = idle; 'creating' = POST /dashboards; 'widgets' = seeding cards.
  const [phase, setPhase] = useState<'creating' | 'widgets' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    listKpis()
      .then((rows) => {
        if (!cancelled) setKpis(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
          return;
        }
        setKpiLoadError(
          err instanceof ApiError ? err.message : 'Failed to load KPIs',
        );
        setKpis([]);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const all = kpis ?? [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((k) => k.name.toLowerCase().includes(q));
  }, [all, query]);

  function toggleKpi(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setPhase('creating');
    try {
      const created = await createDashboard({
        name: name.trim(),
        description: description.trim() || undefined,
        isShared,
      });

      // Seed a kpi_card for each picked KPI, laid out left-to-right in rows.
      if (selectedIds.length > 0) {
        setPhase('widgets');
        const { w, h } = WIDGET_META.kpi_card.defaultSize;
        // Preserve the order the KPIs appear in the list for stable layout.
        const ordered = all
          .filter((k) => selectedSet.has(k.id))
          .map((k) => ({ id: k.id, name: k.name }));
        for (let i = 0; i < ordered.length; i += 1) {
          const kpi = ordered[i]!;
          const col = i % STARTER_COLS;
          const row = Math.floor(i / STARTER_COLS);
          await addWidget(created.id, {
            widgetType: 'kpi_card',
            title: kpi.name,
            config: { kpiId: kpi.id },
            position: { x: col * w, y: row * h, w, h },
          });
        }
      }

      router.push(`/dashboards/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setError(
        err instanceof ApiError ? err.message : 'Failed to create dashboard',
      );
      setSubmitting(false);
      setPhase(null);
    }
  }

  const submitLabel =
    phase === 'creating'
      ? 'Creating dashboard…'
      : phase === 'widgets'
        ? 'Adding widgets…'
        : selectedIds.length > 0
          ? `Create with ${selectedIds.length} widget${selectedIds.length === 1 ? '' : 's'}`
          : 'Create dashboard';

  return (
    <RequirePermission permission="DASHBOARD_MANAGE">
      <AppShell>
        <PageHeader
          title={
            <span data-testid="dashboards-new-heading">
              New {terminology.dashboardLabel.toLowerCase()}
            </span>
          }
          subtitle={`Name it, optionally pick a few ${terminology.kpiLabel.toLowerCase()}s to start with, then create. You can rearrange or add charts after.`}
        />

        <div className="mt-6 max-w-2xl">
          <Card>
            <CardContent>
              <form
                onSubmit={handleSubmit}
                data-testid="dashboards-new-form"
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label htmlFor="dashboard-name" required>
                    Name
                  </Label>
                  <Input
                    id="dashboard-name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                    data-testid="dashboards-new-name"
                    placeholder="Executive overview"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dashboard-description">
                    Description{' '}
                    <span className="font-normal text-content-muted">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="dashboard-description"
                    maxLength={2000}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={submitting}
                    data-testid="dashboards-new-description"
                    placeholder="What this dashboard is for"
                  />
                </div>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                    disabled={submitting}
                    data-testid="dashboards-new-shared"
                    className="mt-1 h-4 w-4 rounded border-border text-accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="text-sm text-content">
                    <span className="font-medium text-content-strong">
                      Share with the organization
                    </span>
                    <br />
                    <span className="text-content-muted">
                      When enabled, all org members can view this dashboard. You
                      can still change this later.
                    </span>
                  </span>
                </label>

                {/* Starter widgets ------------------------------------------ */}
                <div className="space-y-3 border-t border-border pt-5">
                  <div className="space-y-1">
                    <Label>
                      Starter widgets{' '}
                      <span className="font-normal text-content-muted">
                        (optional)
                      </span>
                    </Label>
                    <p className="text-sm text-content-muted">
                      We&apos;ll add a {terminology.kpiLabel} card for each — you
                      can rearrange or add charts after.
                    </p>
                  </div>

                  <div className="relative">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
                    />
                    <Input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search ${terminology.kpiLabel.toLowerCase()}s…`}
                      disabled={submitting}
                      aria-label={`Search ${terminology.kpiLabel.toLowerCase()}s`}
                      className="pl-9"
                      data-testid="starter-kpis-search"
                    />
                  </div>

                  {selectedIds.length > 0 && (
                    <p
                      className="text-xs text-content-muted"
                      data-testid="starter-kpis-count"
                    >
                      {selectedIds.length} selected
                    </p>
                  )}

                  <div
                    data-testid="starter-kpis"
                    className="max-h-[280px] overflow-auto rounded-md border border-border bg-surface-bg"
                  >
                    {kpis === null ? (
                      <div className="space-y-1 p-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : kpiLoadError ? (
                      <p
                        role="alert"
                        className="px-3 py-4 text-center text-xs text-status-critical"
                      >
                        {kpiLoadError}
                      </p>
                    ) : filtered.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-content-muted">
                        {all.length === 0
                          ? `No ${terminology.kpiLabel.toLowerCase()}s available — you can add widgets later.`
                          : `No ${terminology.kpiLabel.toLowerCase()}s match`}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {filtered.map((k) => {
                          const checked = selectedSet.has(k.id);
                          return (
                            <li key={k.id}>
                              <label
                                data-testid={`starter-kpi-${k.id}`}
                                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface-2"
                              >
                                <span
                                  aria-hidden
                                  className={
                                    checked
                                      ? 'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-accent-primary bg-accent-primary text-white'
                                      : 'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border'
                                  }
                                >
                                  {checked && (
                                    <Check className="h-3 w-3" aria-hidden />
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={checked}
                                  onChange={() => toggleKpi(k.id)}
                                  disabled={submitting}
                                />
                                <span
                                  className="truncate text-content-strong"
                                  title={k.name}
                                >
                                  {k.name}
                                </span>
                                {k.unit && (
                                  <span className="font-mono text-xs text-content-muted">
                                    {k.unit}
                                  </span>
                                )}
                                <ScopeBadge
                                  scope={k.scope}
                                  className="ml-auto shrink-0"
                                />
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {selectedIds.length === 0 && (
                    <Badge tone="neutral" className="self-start">
                      None picked → you&apos;ll start with a blank dashboard
                    </Badge>
                  )}
                </div>

                {error && (
                  <p
                    role="alert"
                    data-testid="dashboards-new-error"
                    className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
                  >
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting || name.trim().length < 2}
                    isLoading={submitting}
                    data-testid="create-dashboard-submit"
                  >
                    {submitLabel}
                  </Button>
                  <Link href="/dashboards">
                    <Button type="button" variant="secondary" disabled={submitting}>
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </RequirePermission>
  );
}
