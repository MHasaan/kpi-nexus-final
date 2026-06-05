'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  Gauge,
  Hash,
  LayoutGrid,
  LineChart,
  PieChart,
  Plus,
  Search,
  Table as TableIcon,
  type LucideIcon,
} from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import {
  ApiError,
  clearTokens,
  deleteDashboard,
  getAccessToken,
  listDashboards,
  meRequest,
  setDefaultDashboard,
  type Dashboard,
  type WidgetType,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';

type DashboardFilter = 'all' | 'shared' | 'mine' | 'default';

const FILTER_OPTIONS: ReadonlyArray<{ value: DashboardFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'shared', label: 'Shared' },
  { value: 'mine', label: 'Mine' },
  { value: 'default', label: 'Default' },
];

const WIDGET_GLYPH_ICON: Record<WidgetType, LucideIcon> = {
  line: LineChart,
  trend: LineChart,
  bar: BarChart3,
  pie: PieChart,
  gauge: Gauge,
  number: Hash,
  kpi_card: Hash,
  list: TableIcon,
  activity: Activity,
  strategy_map: LayoutGrid,
};

const MAX_THUMBNAIL_GLYPHS = 6;

/**
 * Decorative static mini-preview derived entirely from the dashboard's
 * already-loaded `widgets[]`. No extra fetch, no backend call. Renders up to
 * six tokenized glyph tiles (one per widget) or a muted "Empty" placeholder.
 */
function DashboardThumbnail({ widgets }: { widgets: Dashboard['widgets'] }) {
  if (widgets.length === 0) {
    return (
      <div
        aria-hidden
        className="mb-3 flex h-16 items-center justify-center rounded-lg border border-dashed border-border bg-surface-1 text-xs font-medium text-content-muted"
      >
        Empty
      </div>
    );
  }

  const glyphs = widgets.slice(0, MAX_THUMBNAIL_GLYPHS);
  const overflow = widgets.length - glyphs.length;

  return (
    <div
      aria-hidden
      className="mb-3 flex h-16 items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-surface-1 px-2"
    >
      {glyphs.map((w) => {
        const Icon = WIDGET_GLYPH_ICON[w.widgetType] ?? LayoutGrid;
        return (
          <span
            key={w.id}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-content-muted"
          >
            <Icon className="h-4 w-4" />
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="shrink-0 text-xs tabular-nums font-medium text-content-muted">
          +{overflow}
        </span>
      )}
    </div>
  );
}

export default function DashboardsListPage() {
  return (
    <TerminologyProvider>
      <DashboardsListInner />
    </TerminologyProvider>
  );
}

function DashboardsListInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DashboardFilter>('all');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
    // Resolve the current user so the "Mine" filter can match ownerUserId.
    // Non-fatal: if it fails, "Mine" simply yields no matches.
    meRequest()
      .then((res) => setCurrentUserId(res.user.id))
      .catch(() => {
        /* ignore — "Mine" filter degrades gracefully */
      });
  }, [router]);

  const visible = useMemo(() => {
    if (dashboards === null) return null;
    const q = search.trim().toLowerCase();
    return dashboards.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (filter === 'shared') return d.isShared;
      if (filter === 'default') return d.isDefault;
      if (filter === 'mine') {
        return currentUserId != null && d.ownerUserId === currentUserId;
      }
      return true;
    });
  }, [dashboards, search, filter, currentUserId]);

  const hasFilters = search.trim().length > 0 || filter !== 'all';

  async function refresh() {
    setLoadError(null);
    try {
      const data = await listDashboards();
      setDashboards(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load dashboards',
      );
    }
  }

  async function handleSetDefault(dashboard: Dashboard) {
    setPendingId(dashboard.id);
    setActionError(null);
    try {
      await setDefaultDashboard(dashboard.id);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : `Failed to set default for ${dashboard.name}`,
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(dashboard: Dashboard) {
    if (!window.confirm(`Delete "${dashboard.name}"? It will be soft-deleted.`)) {
      return;
    }
    setPendingId(dashboard.id);
    setActionError(null);
    try {
      await deleteDashboard(dashboard.id);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : `Failed to delete ${dashboard.name}`,
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <RequirePermission permission="DASHBOARD_VIEW">
    <AppShell>
      <PageHeader
        title={
          <span data-testid="dashboards-heading">
            {pluralize(terminology.dashboardLabel)}
          </span>
        }
        subtitle={`Build custom views of your ${terminology.kpiLabel.toLowerCase()} data. Set one as your default to land here on sign-in.`}
        actions={
          <>
            <Link href="/dashboards/archive" data-testid="dashboards-archive-link">
              <Button variant="ghost" size="sm" leftIcon={<Archive className="h-4 w-4" />}>
                Archive
              </Button>
            </Link>
            <PermissionGuard permission="DASHBOARD_MANAGE">
              <Link href="/dashboards/new" data-testid="dashboards-new-link">
                <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                  New {terminology.dashboardLabel.toLowerCase()}
                </Button>
              </Link>
            </PermissionGuard>
          </>
        }
      />

      <div className="mt-6 space-y-6">
        {loadError && (
          <div
            role="alert"
            data-testid="dashboards-load-error"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            data-testid="dashboards-action-error"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {actionError}
          </div>
        )}

        {dashboards === null && !loadError && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        )}

        {dashboards !== null && dashboards.length === 0 && (
          <Card data-testid="dashboards-empty">
            <EmptyState
              icon={BarChart3}
              title={`No ${pluralize(terminology.dashboardLabel).toLowerCase()} yet`}
              description="Create your first one to get started."
              action={
                <PermissionGuard permission="DASHBOARD_MANAGE">
                  <Link href="/dashboards/new">
                    <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
                      New {terminology.dashboardLabel.toLowerCase()}
                    </Button>
                  </Link>
                </PermissionGuard>
              }
            />
          </Card>
        )}

        {dashboards !== null && dashboards.length > 0 && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${pluralize(terminology.dashboardLabel).toLowerCase()}…`}
                  aria-label={`Search ${pluralize(terminology.dashboardLabel).toLowerCase()}`}
                  className="pl-9"
                  data-testid="dashboard-search"
                />
              </div>
              <Select
                value={filter}
                onChange={(e) => setFilter(e.target.value as DashboardFilter)}
                aria-label="Filter dashboards"
                className="sm:w-44"
                data-testid="dashboard-filter"
              >
                {FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            {visible !== null && (
              <p
                className="text-xs tabular-nums text-content-muted"
                data-testid="dashboards-result-count"
              >
                {visible.length}{' '}
                {visible.length === 1
                  ? terminology.dashboardLabel.toLowerCase()
                  : pluralize(terminology.dashboardLabel).toLowerCase()}
                {hasFilters ? ` of ${dashboards.length}` : ''}
              </p>
            )}

            {visible !== null && visible.length === 0 && (
              <Card data-testid="dashboards-no-matches">
                <EmptyState
                  icon={Search}
                  title="No matches"
                  description="Try a different search or filter."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setSearch('');
                        setFilter('all');
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              </Card>
            )}
          </>
        )}

        {visible !== null && visible.length > 0 && (
          <section
            className="kn-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="dashboards-grid"
          >
            {visible.map((d) => (
              <Card
                key={d.id}
                as="article"
                data-testid={`dashboard-card-${d.id}`}
                className="kn-card-hover flex flex-col"
              >
                <CardContent className="flex flex-1 flex-col">
                  <DashboardThumbnail widgets={d.widgets} />
                  <header className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboards/${d.id}`}
                      className="text-base font-semibold text-content-strong transition-colors hover:text-accent-primary"
                    >
                      {d.name}
                    </Link>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {d.isDefault && <Badge tone="info">Default</Badge>}
                      {d.isShared && <Badge tone="success">Shared</Badge>}
                    </div>
                  </header>
                  {d.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-content-muted">
                      {d.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs tabular-nums text-content-muted">
                    {d.widgets.length} widget
                    {d.widgets.length === 1 ? '' : 's'} · updated{' '}
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!d.isDefault && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSetDefault(d)}
                        disabled={pendingId === d.id}
                        data-testid={`dashboard-setdefault-${d.id}`}
                      >
                        Set default
                      </Button>
                    )}
                    <PermissionGuard permission="DASHBOARD_MANAGE">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(d)}
                        disabled={pendingId === d.id}
                        data-testid={`dashboard-delete-${d.id}`}
                      >
                        Delete
                      </Button>
                    </PermissionGuard>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>
    </AppShell>
    </RequirePermission>
  );
}
