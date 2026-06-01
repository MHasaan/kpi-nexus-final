'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import {
  ApiError,
  clearTokens,
  createKpi,
  deleteKpi,
  getAccessToken,
  listKpiDataPoints,
  listKpis,
  listOrgUnits,
  listUsers,
  recordOrgWideDataPoint,
  type DataPoint,
  type KpiScope,
  type KpiStatus,
  type KpiSummary,
  type KpiType,
  type OrgUnitSummary,
  type UserSummary,
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

const SUBNAV: Array<{ href: string; label: string }> = [
  { href: '/kpis/categories', label: 'Categories' },
  { href: '/kpis/templates', label: 'Templates' },
  { href: '/kpis/tree', label: 'Tree' },
  { href: '/kpis/scorecard', label: 'Scorecard' },
  { href: '/kpis/import', label: 'Import' },
  { href: '/kpis/archive', label: 'Archive' },
];

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
  const [orgUnits, setOrgUnits] = useState<OrgUnitSummary[] | null>(null);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create-KPI form state
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<KpiScope>('ORG_WIDE');
  const [newType, setNewType] = useState<KpiType>('NUMBER');
  const [newUnit, setNewUnit] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newOrgUnitIds, setNewOrgUnitIds] = useState<string[]>([]);
  const [newUserIds, setNewUserIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  // Catalog scope filter (visual facet over the loaded list)
  const [scopeFilter, setScopeFilter] = useState<'ALL' | KpiScope>('ALL');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router]);

  async function refresh() {
    setLoadError(null);
    try {
      const [k, u, units] = await Promise.all([listKpis(), listUsers(), listOrgUnits()]);
      setKpis(k);
      setUsers(u);
      setOrgUnits(units);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load KPIs');
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const target = newTarget.trim() ? Number.parseFloat(newTarget) : undefined;
      await createKpi({
        name: newName.trim(),
        scope: newScope,
        type: newType,
        unit: newUnit.trim() || undefined,
        targetValue: target,
        orgUnitIds: newScope === 'PER_UNIT' ? newOrgUnitIds : undefined,
        userIds: newScope === 'PER_USER' ? newUserIds : undefined,
      });
      setNewName('');
      setNewUnit('');
      setNewTarget('');
      setNewOrgUnitIds([]);
      setNewUserIds([]);
      await refresh();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Failed to create KPI',
      );
    } finally {
      setCreating(false);
    }
  }

  function toggleSelection(
    set: string[],
    setter: (next: string[]) => void,
    id: string,
  ) {
    if (set.includes(id)) {
      setter(set.filter((x) => x !== id));
    } else {
      setter([...set, id]);
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
  const visibleKpis =
    kpis && scopeFilter !== 'ALL' ? kpis.filter((k) => k.scope === scopeFilter) : kpis;

  return (
    <RequirePermission permission="KPI_VIEW">
    <AppShell title={kpiLabelPlural} crumbs={[{ label: 'Home', href: '/' }, { label: kpiLabelPlural }]}>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1
              className="text-2xl font-bold tracking-tight text-content-strong"
              data-testid="kpis-heading"
            >
              {kpiLabelPlural}
            </h1>
            <p className="max-w-2xl text-sm text-content-muted">
              Track outcomes that matter. {kpiLabelPlural} have a scope: ORG_WIDE
              (one value per period for the whole org), PER_UNIT (one value per
              unit), or PER_USER (each {terminology.memberLabel.toLowerCase()} tracks
              their own).
            </p>
          </div>
        </div>

        {/* Sub-nav */}
        <nav className="flex flex-wrap items-center gap-1.5">
          {SUBNAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md border border-border bg-surface-bg px-3 py-1.5 text-sm font-medium text-content transition-colors hover:bg-surface-hover hover:text-content-strong"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {loadError && (
          <div
            role="alert"
            data-testid="kpis-load-error"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {/* Create KPI */}
        <PermissionGuard permission="KPI_CREATE">
          <Card className="overflow-hidden p-0" data-testid="create-kpi-section">
            <div className="border-b border-border-divider px-5 py-4">
              <h2 className="text-sm font-semibold text-content-strong">
                Create a {terminology.kpiLabel}
              </h2>
              <p className="mt-1 text-sm text-content-muted">
                ORG_WIDE: one value per period for the whole organization. PER_UNIT:
                one value per selected {pluralize(terminology.groupLabel.toLowerCase())}.
                PER_USER: each selected {terminology.memberLabel.toLowerCase()} tracks
                their own. Scope is immutable after creation.
              </p>
            </div>
            <div className="p-5">
              <form
                onSubmit={handleCreate}
                className="grid gap-4 sm:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] sm:items-end"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kpi-name" required>
                    Name
                  </Label>
                  <Input
                    id="kpi-name"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={creating}
                    data-testid="kpi-name-input"
                    placeholder="Monthly revenue"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kpi-scope">Scope</Label>
                  <Select
                    id="kpi-scope"
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value as KpiScope)}
                    disabled={creating}
                    data-testid="kpi-scope-select"
                  >
                    <option value="ORG_WIDE">ORG_WIDE</option>
                    <option value="PER_UNIT">PER_UNIT</option>
                    <option value="PER_USER">PER_USER</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kpi-type">Type</Label>
                  <Select
                    id="kpi-type"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as KpiType)}
                    disabled={creating}
                    data-testid="kpi-type-select"
                  >
                    <option value="NUMBER">Number</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="CURRENCY">Currency</option>
                    <option value="COUNT">Count</option>
                    <option value="DURATION">Duration</option>
                    <option value="RATING">Rating</option>
                    <option value="BOOLEAN">Boolean</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kpi-unit">Unit</Label>
                  <Input
                    id="kpi-unit"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    disabled={creating}
                    data-testid="kpi-unit-input"
                    placeholder="$, %, ms"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kpi-target">Target</Label>
                  <Input
                    id="kpi-target"
                    type="number"
                    step="any"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    disabled={creating}
                    data-testid="kpi-target-input"
                    placeholder="optional"
                  />
                </div>
                <Button type="submit" disabled={creating} isLoading={creating} data-testid="kpi-submit-button">
                  Create
                </Button>
              </form>

              {newScope === 'PER_UNIT' && (
                <div className="mt-4" data-testid="kpi-orgunit-picker">
                  <span className="text-sm font-medium text-content-strong">
                    Assigned {pluralize(terminology.groupLabel.toLowerCase())}
                  </span>
                  <p className="text-xs text-content-muted">
                    Each selected unit will track its own value for this KPI.
                  </p>
                  {orgUnits === null && (
                    <p className="mt-2 text-sm text-content-muted">Loading…</p>
                  )}
                  {orgUnits && orgUnits.length === 0 && (
                    <p
                      className="mt-2 text-sm text-content-muted"
                      data-testid="kpi-no-orgunits"
                    >
                      Create at least one {terminology.groupLabel.toLowerCase()} on{' '}
                      <Link href="/org-units" className="text-accent-primary underline">
                        /org-units
                      </Link>{' '}
                      first.
                    </p>
                  )}
                  {orgUnits && orgUnits.length > 0 && (
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      {orgUnits.map((u) => (
                        <li key={u.id}>
                          <label className="flex items-center gap-2 rounded-md border border-border bg-surface-bg px-2.5 py-1.5 text-sm text-content">
                            <input
                              type="checkbox"
                              checked={newOrgUnitIds.includes(u.id)}
                              onChange={() =>
                                toggleSelection(newOrgUnitIds, setNewOrgUnitIds, u.id)
                              }
                              data-testid={`orgunit-checkbox-${u.name}`}
                              disabled={creating}
                              className="rounded border-border text-accent-primary focus-visible:ring-ring"
                            />
                            <span>{u.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {newScope === 'PER_USER' && (
                <div className="mt-4" data-testid="kpi-user-picker">
                  <span className="text-sm font-medium text-content-strong">
                    Assigned {pluralize(terminology.memberLabel.toLowerCase())}
                  </span>
                  <p className="text-xs text-content-muted">
                    Each selected {terminology.memberLabel.toLowerCase()} will record
                    their own values via /user-kpis/my-kpis.
                  </p>
                  {users && users.length === 0 && (
                    <p className="mt-2 text-sm text-content-muted">
                      No {pluralize(terminology.memberLabel.toLowerCase())} yet.
                    </p>
                  )}
                  {users && users.length > 0 && (
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      {users.map((u) => (
                        <li key={u.id}>
                          <label className="flex items-center gap-2 rounded-md border border-border bg-surface-bg px-2.5 py-1.5 text-sm text-content">
                            <input
                              type="checkbox"
                              checked={newUserIds.includes(u.id)}
                              onChange={() =>
                                toggleSelection(newUserIds, setNewUserIds, u.id)
                              }
                              data-testid={`user-checkbox-${u.email}`}
                              disabled={creating}
                              className="rounded border-border text-accent-primary focus-visible:ring-ring"
                            />
                            <span>{u.email}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {createError && (
                <p
                  role="alert"
                  data-testid="kpi-error"
                  className="mt-3 text-sm text-status-critical"
                >
                  {createError}
                </p>
              )}
            </div>
          </Card>
        </PermissionGuard>

        {/* Catalog */}
        <section data-testid="kpis-list-section" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-content-muted">
              Catalog
            </h2>
            {kpis && kpis.length > 0 && (
              <Select
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
                  Create your first {terminology.kpiLabel.toLowerCase()} above, or start
                  from a template.
                </p>
                <Link href="/kpis/templates">
                  <Button variant="secondary">Browse templates</Button>
                </Link>
              </div>
            </Card>
          )}

          {kpis && kpis.length > 0 && (
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
                  {(visibleKpis ?? []).map((kpi) => (
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
