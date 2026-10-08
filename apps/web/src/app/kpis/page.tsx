'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import { KpiSubnav } from '../../components/kpis/kpi-subnav';
import {
  ApiError,
  clearTokens,
  deleteKpi,
  getAccessToken,
  listKpiCategories,
  listKpiDataPoints,
  listKpis,
  recordOrgWideDataPoint,
  type DataPoint,
  type KpiCategory,
  type KpiScope,
  type KpiStatus,
  type KpiSummary,
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
  Input,
  Label,
  PageHeader,
  ScopeBadge,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeTone,
} from '../../components/ui';
import { currentLoginRedirect } from '../../lib/auth-redirect';

// Lifecycle-status presentation. Status is conveyed by label text (never
// colour-only) plus a tone, derived from the canonical KpiStatus enum.
const KPI_STATUS_TONE: Record<KpiStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PROPOSED: 'info',
  APPROVED: 'info',
  ACTIVE: 'success',
  PAUSED: 'warning',
  DEPRECATED: 'warning',
  ARCHIVED: 'neutral',
};

const KPI_STATUSES = Object.keys(KPI_STATUS_TONE) as KpiStatus[];

export default function KpisPage() {
  return (
    <TerminologyProvider>
      <KpisPageInner />
    </TerminologyProvider>
  );
}

function KpisPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiSummary[] | null>(null);
  const [categories, setCategories] = useState<KpiCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Expanded-KPI state (showing data points + record form)
  const [expandedKpiId, setExpandedKpiId] = useState<string | null>(null);
  const [dataPoints, setDataPoints] = useState<DataPoint[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Record-value form state
  const [recordValue, setRecordValue] = useState('');
  const [recordPeriodStart, setRecordPeriodStart] = useState('');
  const [recordPeriodEnd, setRecordPeriodEnd] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toolbar filters (client-side facets over the loaded list)
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | KpiStatus>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | KpiScope>('ALL');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void refresh();
  }, [router]);

  async function refresh() {
    setLoadError(null);
    try {
      const [k, cats] = await Promise.all([listKpis(), listKpiCategories()]);
      setKpis(k);
      setCategories(cats);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load KPIs');
    }
  }

  async function handleDelete(kpi: KpiSummary) {
    setDeletingId(kpi.id);
    try {
      await deleteKpi(kpi.id);
      if (expandedKpiId === kpi.id) {
        setExpandedKpiId(null);
        setDataPoints(null);
      }
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : `Failed to delete ${kpi.name}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExpand(kpi: KpiSummary) {
    if (expandedKpiId === kpi.id) {
      setExpandedKpiId(null);
      setDataPoints(null);
      return;
    }
    setExpandedKpiId(kpi.id);
    setDataLoading(true);
    setDataError(null);
    setDataPoints(null);
    setRecordValue('');
    setRecordPeriodStart('');
    setRecordPeriodEnd('');
    setRecordError(null);
    try {
      setDataPoints(await listKpiDataPoints(kpi.id));
    } catch (err) {
      setDataError(
        err instanceof ApiError ? err.message : 'Failed to load data points',
      );
    } finally {
      setDataLoading(false);
    }
  }

  async function handleRecord(kpi: KpiSummary, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecording(true);
    setRecordError(null);
    try {
      const value = Number.parseFloat(recordValue);
      if (!Number.isFinite(value)) {
        throw new Error('Value must be a number');
      }
      await recordOrgWideDataPoint(kpi.id, {
        value,
        periodStart: recordPeriodStart,
        periodEnd: recordPeriodEnd,
      });
      setRecordValue('');
      setRecordPeriodStart('');
      setRecordPeriodEnd('');
      setDataPoints(await listKpiDataPoints(kpi.id));
    } catch (err) {
      setRecordError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to record value',
      );
    } finally {
      setRecording(false);
    }
  }

  const kpiLabelPlural = pluralize(terminology.kpiLabel);

  const filtersActive =
    search.trim() !== '' ||
    categoryFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    scopeFilter !== 'ALL';

  const visibleKpis = useMemo(() => {
    if (!kpis) return [];
    const needle = search.trim().toLowerCase();
    return kpis.filter((k) => {
      if (needle && !k.name.toLowerCase().includes(needle)) return false;
      if (categoryFilter !== 'ALL' && k.categoryId !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && k.status !== statusFilter) return false;
      if (scopeFilter !== 'ALL' && k.scope !== scopeFilter) return false;
      return true;
    });
  }, [kpis, search, categoryFilter, statusFilter, scopeFilter]);

  function clearFilters() {
    setSearch('');
    setCategoryFilter('ALL');
    setStatusFilter('ALL');
    setScopeFilter('ALL');
  }

  return (
    <RequirePermission permission="KPI_VIEW">
    <AppShell title={kpiLabelPlural} crumbs={[{ label: 'Home', href: '/' }, { label: kpiLabelPlural }]}>
      <div className="space-y-6">
        <PageHeader
          title={kpiLabelPlural}
          titleTestId="kpis-heading"
          subtitle={
            <>
              Track outcomes that matter. {kpiLabelPlural} have a scope: ORG_WIDE
              (one value per period for the whole org), PER_UNIT (one value per
              unit), or PER_USER (each {terminology.memberLabel.toLowerCase()} tracks
              their own).
            </>
          }
          actions={
            <PermissionGuard permission="KPI_CREATE">
              <Link href="/kpis/new" data-testid="new-kpi-button">
                <Button>New {terminology.kpiLabel}</Button>
              </Link>
            </PermissionGuard>
          }
        />

        {/* Sub-nav */}
        <KpiSubnav />

        {loadError && (
          <div
            role="alert"
            data-testid="kpis-load-error"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {/* Catalog */}
        <section data-testid="kpis-list-section" className="space-y-3">
          {/* Search + filters toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5 sm:max-w-xs sm:flex-1">
                <Label htmlFor="kpi-search">Search</Label>
                <Input
                  id="kpi-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${kpiLabelPlural.toLowerCase()}…`}
                  data-testid="kpi-search"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kpi-filter-category">Category</Label>
                <Select
                  id="kpi-filter-category"
                  className="w-auto"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  data-testid="kpi-filter-category"
                >
                  <option value="ALL">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kpi-filter-status">Status</Label>
                <Select
                  id="kpi-filter-status"
                  className="w-auto"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'ALL' | KpiStatus)}
                  data-testid="kpi-filter-status"
                >
                  <option value="ALL">All statuses</option>
                  {KPI_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kpis-scope-filter">Scope</Label>
                <Select
                  id="kpis-scope-filter"
                  className="w-auto"
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value as 'ALL' | KpiScope)}
                  aria-label="Filter by scope"
                  data-testid="kpis-scope-filter"
                >
                  <option value="ALL">All scopes</option>
                  <option value="ORG_WIDE">ORG_WIDE</option>
                  <option value="PER_UNIT">PER_UNIT</option>
                  <option value="PER_USER">PER_USER</option>
                </Select>
              </div>
            </div>

            {kpis && kpis.length > 0 && (
              <div className="flex items-center gap-3 text-sm text-content-muted">
                <span data-testid="kpis-result-count" className="tabular-nums">
                  {visibleKpis.length} of {kpis.length}
                </span>
                {filtersActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    data-testid="kpis-clear-filters"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>

          {kpis === null && !loadError && (
            <Card className="p-4">
              {/* loading skeletons */}
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </Card>
          )}

          {kpis && kpis.length === 0 && (
            <Card>
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <h3 className="text-base font-semibold text-content-strong">
                  No {kpiLabelPlural.toLowerCase()} yet
                </h3>
                <p
                  className="max-w-sm text-sm text-content-muted"
                  data-testid="kpis-empty"
                >
                  Create your first {terminology.kpiLabel.toLowerCase()}, or start
                  from a template.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <PermissionGuard permission="KPI_CREATE">
                    <Link href="/kpis/new">
                      <Button>New {terminology.kpiLabel}</Button>
                    </Link>
                  </PermissionGuard>
                  <Link href="/kpis/templates">
                    <Button variant="secondary">Browse templates</Button>
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {kpis && kpis.length > 0 && visibleKpis.length === 0 && (
            <Card>
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <h3 className="text-base font-semibold text-content-strong">
                  No matches
                </h3>
                <p
                  className="max-w-sm text-sm text-content-muted"
                  data-testid="kpis-no-matches"
                >
                  No {kpiLabelPlural.toLowerCase()} match your filters.
                </p>
                <Button variant="secondary" onClick={clearFilters} data-testid="kpis-no-matches-clear">
                  Clear filters
                </Button>
              </div>
            </Card>
          )}

          {kpis && kpis.length > 0 && visibleKpis.length > 0 && (
            <Card className="overflow-hidden p-0">
              <Table data-testid="kpis-list">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleKpis.map((kpi) => (
                    <KpiRow
                      key={kpi.id}
                      kpi={kpi}
                      terminology={terminology}
                      expanded={expandedKpiId === kpi.id}
                      deleting={deletingId === kpi.id}
                      onExpand={() => void handleExpand(kpi)}
                      onDelete={() => void handleDelete(kpi)}
                      dataPoints={dataPoints}
                      dataLoading={dataLoading}
                      dataError={dataError}
                      recording={recording}
                      recordError={recordError}
                      recordValue={recordValue}
                      setRecordValue={setRecordValue}
                      recordPeriodStart={recordPeriodStart}
                      setRecordPeriodStart={setRecordPeriodStart}
                      recordPeriodEnd={recordPeriodEnd}
                      setRecordPeriodEnd={setRecordPeriodEnd}
                      onRecord={(e) => void handleRecord(kpi, e)}
                    />
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
    </RequirePermission>
  );
}

interface KpiRowProps {
  kpi: KpiSummary;
  terminology: { memberLabel: string };
  expanded: boolean;
  deleting: boolean;
  onExpand: () => void;
  onDelete: () => void;
  dataPoints: DataPoint[] | null;
  dataLoading: boolean;
  dataError: string | null;
  recording: boolean;
  recordError: string | null;
  recordValue: string;
  setRecordValue: (v: string) => void;
  recordPeriodStart: string;
  setRecordPeriodStart: (v: string) => void;
  recordPeriodEnd: string;
  setRecordPeriodEnd: (v: string) => void;
  onRecord: (e: FormEvent<HTMLFormElement>) => void;
}

function KpiRow({
  kpi,
  terminology,
  expanded,
  deleting,
  onExpand,
  onDelete,
  dataPoints,
  dataLoading,
  dataError,
  recording,
  recordError,
  recordValue,
  setRecordValue,
  recordPeriodStart,
  setRecordPeriodStart,
  recordPeriodEnd,
  setRecordPeriodEnd,
  onRecord,
}: KpiRowProps) {
  return (
    <>
      <TableRow data-testid={`kpi-row-${kpi.name}`} className="hover:bg-surface-hover">
        <TableCell>
          <Link
            href={`/kpis/${kpi.id}`}
            className="font-medium text-content-strong hover:text-accent-primary"
          >
            {kpi.name}
          </Link>
          {kpi.unit && (
            <span className="ml-2 font-mono text-xs text-content-muted">{kpi.unit}</span>
          )}
        </TableCell>
        <TableCell>
          <span data-testid="kpi-scope-badge">
            <ScopeBadge scope={kpi.scope} />
          </span>
        </TableCell>
        <TableCell>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-content">
            {kpi.type}
          </span>
        </TableCell>
        <TableCell>
          <span data-testid={`kpi-status-badge-${kpi.name}`}>
            <Badge tone={KPI_STATUS_TONE[kpi.status]}>{kpi.status}</Badge>
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {kpi.targetValue !== null ? kpi.targetValue : <span className="text-content-muted">—</span>}
        </TableCell>
        <TableCell className="text-content-muted">
          {kpi.scope === 'PER_UNIT' && kpi.orgUnitAssignments.length > 0 && (
            <span data-testid={`kpi-assignment-count-${kpi.name}`} className="tabular-nums">
              {kpi.orgUnitAssignments.length} unit
              {kpi.orgUnitAssignments.length === 1 ? '' : 's'}
            </span>
          )}
          {kpi.scope === 'PER_USER' && kpi.userAssignments.length > 0 && (
            <span data-testid={`kpi-assignment-count-${kpi.name}`} className="tabular-nums">
              {kpi.userAssignments.length} {terminology.memberLabel.toLowerCase()}
              {kpi.userAssignments.length === 1 ? '' : 's'}
            </span>
          )}
          {((kpi.scope === 'PER_UNIT' && kpi.orgUnitAssignments.length === 0) ||
            (kpi.scope === 'PER_USER' && kpi.userAssignments.length === 0) ||
            kpi.scope === 'ORG_WIDE') && <span>—</span>}
        </TableCell>
        <TableCell className="text-right">
          <div className="inline-flex gap-2">
            {kpi.scope === 'ORG_WIDE' && (
              <PermissionGuard permission="KPI_DATA_ENTRY">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onExpand}
                  data-testid={`expand-kpi-${kpi.name}`}
                >
                  {expanded ? 'Hide data' : 'Record value'}
                </Button>
              </PermissionGuard>
            )}
            <PermissionGuard permission="KPI_EDIT">
              <Link href={`/kpis/${kpi.id}/edit`} data-testid={`kpi-edit-${kpi.id}`}>
                <Button variant="ghost" size="sm">
                  Edit
                </Button>
              </Link>
            </PermissionGuard>
            <PermissionGuard permission="KPI_DELETE">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
                data-testid={`delete-kpi-${kpi.name}`}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </PermissionGuard>
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="bg-surface-1">
            <div data-testid={`kpi-data-panel-${kpi.name}`} className="space-y-4 py-1">
              <h4 className="text-sm font-semibold text-content-strong">Record a value</h4>
              <form
                onSubmit={onRecord}
                className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`rv-${kpi.id}`} required>
                    Value
                  </Label>
                  <Input
                    id={`rv-${kpi.id}`}
                    required
                    type="number"
                    step="any"
                    value={recordValue}
                    onChange={(e) => setRecordValue(e.target.value)}
                    disabled={recording}
                    data-testid="record-value-input"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`rs-${kpi.id}`} required>
                    Period start
                  </Label>
                  <Input
                    id={`rs-${kpi.id}`}
                    required
                    type="date"
                    value={recordPeriodStart}
                    onChange={(e) => setRecordPeriodStart(e.target.value)}
                    disabled={recording}
                    data-testid="record-start-input"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`re-${kpi.id}`} required>
                    Period end
                  </Label>
                  <Input
                    id={`re-${kpi.id}`}
                    required
                    type="date"
                    value={recordPeriodEnd}
                    onChange={(e) => setRecordPeriodEnd(e.target.value)}
                    disabled={recording}
                    data-testid="record-end-input"
                  />
                </div>
                <Button type="submit" disabled={recording} isLoading={recording} data-testid="record-submit-button">
                  Save
                </Button>
              </form>
              {recordError && (
                <p role="alert" data-testid="record-error" className="text-sm text-status-critical">
                  {recordError}
                </p>
              )}

              <h4 className="text-sm font-semibold text-content-strong">Recent values</h4>
              {dataError && (
                <p role="alert" className="text-sm text-status-critical">
                  {dataError}
                </p>
              )}
              {dataLoading && <p className="text-sm text-content-muted">Loading…</p>}
              {dataPoints && dataPoints.length === 0 && (
                <p className="text-sm text-content-muted" data-testid="no-data-points">
                  No values recorded yet.
                </p>
              )}
              {dataPoints && dataPoints.length > 0 && (
                <ul className="space-y-1 text-sm" data-testid={`data-points-${kpi.name}`}>
                  {dataPoints.slice(0, 20).map((dp) => (
                    <li
                      key={dp.id}
                      data-testid="data-point-row"
                      className="flex items-center justify-between rounded-md bg-surface-bg px-3 py-1.5"
                    >
                      <span className="font-mono tabular-nums text-content-strong">
                        {dp.value}
                        {kpi.unit ? ` ${kpi.unit}` : ''}
                      </span>
                      <span className="text-xs text-content-muted">
                        {dp.periodStart.slice(0, 10)} → {dp.periodEnd.slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
