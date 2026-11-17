'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { ApprovalPendingNotice } from '../../../components/approval-pending-notice';
import { cn } from '../../../lib/cn';
import { isApprovalPending } from '../../../lib/role-permissions';
import { useAsyncData } from '../../../lib/use-async-data';

import {
  ApiError,
  assignKpiToUnit,
  assignKpiToUser,
  attachCascade,
  type Benchmark,
  type Cascade,
  computeBenchmark,
  correctDataPoint,
  createBenchmark,
  createTarget,
  createThresholdBand,
  type DataPoint,
  type DataPointCorrection,
  deleteBenchmark,
  deleteCascade,
  deleteFormula,
  deleteKpi,
  deleteTarget,
  deleteThresholdBand,
  getAccessToken,
  getFormula,
  getKpi,
  getKpiSnapshot,
  getKpiVersions,
  getLineageDownstream,
  getLineageUpstream,
  getThresholdStatus,
  type KpiSnapshot,
  type KpiSnapshotSummary,
  type KpiSummary,
  type KpiTarget,
  type KpiVersion,
  type LineageHop,
  listBenchmarks,
  listCascades,
  listDataPointHistory,
  listKpiAssignments,
  listKpiDataPoints,
  listKpis,
  listKpiSnapshots,
  listOrgUnits,
  listTargets,
  listThresholdBands,
  listUsers,
  putFormula,
  recordMyKpiData,
  recordOrgWideDataPoint,
  recordUnitKpiData,
  takeKpiSnapshot,
  type ThresholdBand,
  unassignKpiFromUnit,
  unassignUserKpi,
} from '../../../lib/api-client';
import { CommentsDrawer } from '../../../components/comments-drawer';
import { WatchButton } from '../../../components/kpis/watch-button';
import { AppShell } from '../../../components/app-shell';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card as UICard,
  CardContent,
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
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '../../../components/ui';
import { LineChart } from '../../../components/charts';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { RecordValueForm } from '../../../components/kpis/record-value-form';
import { ASSIGNMENT_STATUS_LABELS, labelFor } from '../../../lib/labels';
import { useConfirm } from '../../../lib/use-confirm';
import { type KpiTab, kpiAnalyticsLinksFor, kpiTabFromParam, kpiTabHref, kpiTabsFor } from '../../../lib/kpi-detail-tabs';
import { usePermissions } from '../../../lib/use-permissions';
import { useToast } from '../../../lib/use-toast';

export default function KpiDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const kpiId = params.id;

  // The open tab lives in the address (`?tab=cascade`), so a link can land on
  // it and Back returns to it.
  const search = useSearchParams();
  // Each analysis page has its own key; a link is shown only when its page will open.
  const analyticsLinks = kpiAnalyticsLinksFor(usePermissions().has);
  const confirm = useConfirm();
  const toast = useToast();
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    getKpi(kpiId)
      .then(setKpi)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load KPI'))
      .finally(() => setLoading(false));
  }, [kpiId, router]);

  if (loading) {
    return (
      <Shell kpiId={kpiId}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </Shell>
    );
  }
  if (error || !kpi) {
    return (
      <Shell kpiId={kpiId}>
        <div
          role="alert"
          className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {error ?? 'Not found'}
        </div>
      </Shell>
    );
  }

  const tab = kpiTabFromParam(search.get('tab'), kpi.scope);
  const setTab = (next: KpiTab) => router.replace(kpiTabHref(kpiId, next), { scroll: false });

  const remove = () =>
    confirm({
      title: `Delete “${kpi.name}”?`,
      description: 'It moves to the KPI archive, where it can be restored. Its recorded values are kept. Dashboards and alert rules that use it stop showing it.',
      confirmLabel: 'Delete KPI',
      tone: 'danger',
      testId: 'kpi-delete-confirm',
      action: async () => {
        await deleteKpi(kpiId);
        toast.success(`“${kpi.name}” deleted`, 'It is in the KPI archive.');
        router.push('/kpis');
      },
    });

  return (
    <Shell kpiId={kpiId} name={kpi.name}>
      <div className="mb-6">
        <Link href="/kpis" className="text-sm text-content-muted hover:text-content-strong">
          ← Back to KPIs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-content-strong" data-testid="kpi-detail-name">
            {kpi.name}
          </h1>
          <Badge tone="neutral">{kpi.status}</Badge>
          <ScopeBadge scope={kpi.scope} />
          <span className="text-xs tabular-nums text-content-muted">
            v{kpi.version} · {kpi.type}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <WatchButton kpiId={kpiId} />
            <CommentsDrawer entityType="kpi" entityId={kpiId} />
            <PermissionGuard permission="KPI_EDIT">
              <Link
                href={`/kpis/${kpiId}/edit`}
                data-testid="kpi-detail-edit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface-bg px-3 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </Link>
            </PermissionGuard>
            <PermissionGuard permission="KPI_DELETE">
              <Button variant="ghost" size="sm" onClick={() => void remove()} data-testid="kpi-detail-delete" className="text-status-critical hover:bg-status-critical-bg" leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}>
                Delete
              </Button>
            </PermissionGuard>
          </span>
        </div>
        {kpi.description && <p className="mt-1 text-sm text-content-muted">{kpi.description}</p>}
        {analyticsLinks.length > 0 && (
          <nav aria-label="Analysis of this KPI" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="kpi-analytics-links">
            <span className="text-content-muted">Analyse:</span>
            {analyticsLinks.map((link) => (
              <Link key={link.key} href={`/kpis/${kpiId}/${link.key}`} data-testid={`kpi-analytics-${link.key}`} className="font-medium text-accent-primary hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as KpiTab)} className="mb-6">
        <TabsList className="flex-wrap">
          {kpiTabsFor(kpi.scope).map((t) => (
            <span key={t} data-testid={`tab-${t.toLowerCase()}`}>
              <TabsTrigger value={t}>{t}</TabsTrigger>
            </span>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'Overview' && <OverviewTab kpi={kpi} />}
      {tab === 'Data' && <DataTab kpi={kpi} />}
      {tab === 'Assignments' && <AssignmentsTab kpi={kpi} />}
      {tab === 'Formula' && <FormulaTab kpiId={kpiId} />}
      {tab === 'Cascade' && <CascadeTab kpiId={kpiId} />}
      {tab === 'Targets' && <TargetsTab kpiId={kpiId} />}
      {tab === 'Thresholds' && <ThresholdsTab kpiId={kpiId} />}
      {tab === 'Benchmarks' && <BenchmarksTab kpiId={kpiId} />}
      {tab === 'Lineage' && <LineageTab kpiId={kpiId} />}
      {tab === 'Audit' && <AuditTab kpiId={kpiId} />}
    </Shell>
  );
}

function Shell({ children, kpiId, name }: { children: React.ReactNode; kpiId: string; name?: string }) {
  return (
    <RequirePermission permission="KPI_VIEW">
      <AppShell
        title={name ?? 'KPI'}
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'KPIs', href: '/kpis' },
          { label: name ?? kpiId.slice(0, 8) },
        ]}
      >
        {children}
      </AppShell>
    </RequirePermission>
  );
}

/** A tab's data, how to reload it, and why the last load failed (never swallowed: X-02). */
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): [T | null, () => void, string | null] {
  const { data, error, reload } = useAsyncData(fn, deps);
  return [data, reload, error];
}

/** Shown in a tab whose data failed to load, so a failure never looks like "nothing here". */
function TabLoadError({ error, onRetry, className }: { error: string | null; onRetry: () => void; className?: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      data-testid="tab-load-error"
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-status-critical/30 bg-status-critical-bg px-4 py-3 text-sm text-status-critical',
        className,
      )}
    >
      <span>{error}</span>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// ---- Tabs ------------------------------------------------------------------

function OverviewTab({ kpi }: { kpi: KpiSummary }) {
  const [points, reloadPoints, pointsError] = useAsync(() => listKpiDataPoints(kpi.id), [kpi.id]);
  const [status] = useAsync(() => getThresholdStatus(kpi.id).catch(() => null), [kpi.id]);
  const latest = points?.[0];
  const series = (points ?? []).slice().reverse().map((p) => p.value);
  return (
    <div className="space-y-4">
      <TabLoadError error={pointsError} onRetry={reloadPoints} />
      <div className="grid gap-4 sm:grid-cols-3">
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Latest value</p>
            <p
              className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-content-strong"
              data-testid="overview-latest"
            >
              {latest ? `${latest.value}${kpi.unit ? ` ${kpi.unit}` : ''}` : '—'}
            </p>
            {latest && (
              <p className="mt-1 text-xs text-content-muted">
                recorded {new Date(latest.recordedAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </UICard>
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Threshold status</p>
            <p className="mt-1 text-xl font-medium text-content-strong">
              {status?.band ?? status?.reason ?? '—'}
            </p>
          </CardContent>
        </UICard>
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Direction · Frequency</p>
            <p className="mt-1 text-sm text-content-strong">{kpi.direction}</p>
            <p className="text-sm text-content-muted">{kpi.frequency}</p>
          </CardContent>
        </UICard>
      </div>
      {series.length > 1 && (
        <UICard>
          <CardContent>
            <p className="kn-eyebrow mb-2">Trend</p>
            <LineChart
              series={[{ data: series }]}
              height={200}
              className="w-full"
              aria-label={`${kpi.name} trend over time`}
            />
          </CardContent>
        </UICard>
      )}
    </div>
  );
}

function DataTab({ kpi }: { kpi: KpiSummary }) {
  const [points, reload, loadError] = useAsync(() => listKpiDataPoints(kpi.id), [kpi.id]);
  const [assignments, reloadAssignments, assignmentsError] = useAsync(
    () => (kpi.scope === 'ORG_WIDE' ? Promise.resolve(null) : listKpiAssignments(kpi.id)),
    [kpi.id, kpi.scope],
  );
  const [assignmentId, setAssignmentId] = useState('');

  const units = assignments?.units ?? [];
  const mine = assignments?.users ?? [];
  // A unit that inherits a KPI records through its own assignment row.
  const selected = assignmentId || units[0]?.assignmentId || mine[0]?.assignmentId || '';

  const afterRecord = () => {
    reload();
    reloadAssignments();
  };

  return (
    <div className="space-y-4">
      <TabLoadError error={loadError ?? assignmentsError} onRetry={reload} />

      <PermissionGuard permission="KPI_DATA_ENTRY">
        <UICard>
          <CardContent>
            {kpi.scope === 'ORG_WIDE' && (
              <RecordValueForm
                frequency={kpi.frequency}
                unit={kpi.unit}
                onRecord={(body) => recordOrgWideDataPoint(kpi.id, body)}
                onRecorded={afterRecord}
              />
            )}

            {kpi.scope === 'PER_UNIT' &&
              (units.length === 0 ? (
                <p className="text-sm text-content-muted" data-testid="data-no-unit">
                  This KPI is recorded per unit, and you do not hold it for any unit you can record
                  for. An administrator can assign it on the Assignments tab.
                </p>
              ) : (
                <RecordValueForm
                  key={selected}
                  frequency={kpi.frequency}
                  unit={kpi.unit}
                  onRecord={(body) => recordUnitKpiData(selected, body)}
                  onRecorded={afterRecord}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="data-unit-select">Unit</Label>
                    <Select
                      id="data-unit-select"
                      value={selected}
                      onChange={(e) => setAssignmentId(e.target.value)}
                      data-testid="data-unit"
                    >
                      {units.map((u) => (
                        <option key={u.assignmentId} value={u.assignmentId}>
                          {u.name}
                          {u.inherited ? ' (inherited)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                </RecordValueForm>
              ))}

            {kpi.scope === 'PER_USER' &&
              (mine.length === 0 ? (
                <p className="text-sm text-content-muted" data-testid="data-no-assignment">
                  This KPI is recorded per person. You do not hold it, so there is nothing for you
                  to record here.
                </p>
              ) : (
                <RecordValueForm
                  frequency={kpi.frequency}
                  unit={kpi.unit}
                  onRecord={(body) =>
                    recordMyKpiData(mine[0]!.assignmentId, body.value, body.periodStart, body.periodEnd)
                  }
                  onRecorded={afterRecord}
                >
                  <p className="self-center text-sm text-content-muted">
                    Recording your own value for this KPI.
                  </p>
                </RecordValueForm>
              ))}
          </CardContent>
        </UICard>
      </PermissionGuard>

      <UICard className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Value</TableHead>
              <TableHead>Period</TableHead>
              {kpi.scope !== 'ORG_WIDE' && <TableHead>{kpi.scope === 'PER_UNIT' ? 'Unit' : 'Person'}</TableHead>}
              <TableHead>Recorded</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(points ?? []).map((p: DataPoint) => (
              <DataPointRow
                key={p.id}
                kpi={kpi}
                point={p}
                onChanged={afterRecord}
                owner={
                  kpi.scope === 'PER_UNIT'
                    ? (units.find((u) => u.orgUnitId === p.orgUnitId)?.name ?? null)
                    : kpi.scope === 'PER_USER'
                      ? (mine.find((m) => m.userId === p.userId)?.name ?? null)
                      : null
                }
              />
            ))}
            {points && points.length === 0 && (
              <TableRow>
                <TableCell colSpan={kpi.scope === 'ORG_WIDE' ? 5 : 6} className="py-4 text-center text-content-muted">
                  No data points yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </UICard>
    </div>
  );
}

function AssignmentsTab({ kpi }: { kpi: KpiSummary }) {
  const [assignments, reload, loadError] = useAsync(() => listKpiAssignments(kpi.id), [kpi.id]);
  const [units] = useAsync(() => (kpi.scope === 'PER_UNIT' ? listOrgUnits() : Promise.resolve([])), [kpi.scope]);
  const [people] = useAsync(() => (kpi.scope === 'PER_USER' ? listUsers() : Promise.resolve([])), [kpi.scope]);
  const [holderId, setHolderId] = useState('');
  const [target, setTarget] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const perUnit = kpi.scope === 'PER_UNIT';
  const held = perUnit ? (assignments?.units ?? []) : (assignments?.users ?? []);
  const heldIds = new Set(
    perUnit ? (assignments?.units ?? []).map((u) => u.orgUnitId) : (assignments?.users ?? []).map((u) => u.userId),
  );
  const candidates = perUnit
    ? (units ?? []).filter((u) => !heldIds.has(u.id)).map((u) => ({ id: u.id, name: u.name }))
    : (people ?? []).filter((p) => !heldIds.has(p.id)).map((p) => ({ id: p.id, name: p.fullName }));

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setErr(null);
    const id = holderId || candidates[0]?.id;
    if (!id) {
      setErr(perUnit ? 'Every unit already holds this KPI.' : 'Everyone already holds this KPI.');
      return;
    }
    const targetValue = target.trim() === '' ? undefined : Number(target);
    if (targetValue !== undefined && Number.isNaN(targetValue)) {
      setErr('The target must be a number.');
      return;
    }
    setBusy(true);
    try {
      if (perUnit) await assignKpiToUnit(id, kpi.id, targetValue);
      else await assignKpiToUser(id, kpi.id, targetValue);
      setHolderId('');
      setTarget('');
      reload();
      toast.success(perUnit ? 'Unit assigned' : 'Person assigned');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not assign this KPI.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: { assignmentId: string; name: string; orgUnitId?: string; inherited?: boolean }) => {
    await confirm({
      title: `Remove ${row.name} from this KPI?`,
      description: perUnit
        ? 'The unit stops holding this KPI. Values already recorded for it are kept.'
        : 'They stop holding this KPI. Values they already recorded are kept.',
      confirmLabel: 'Remove',
      tone: 'danger',
      testId: 'assignment-remove-confirm',
      action: async () => {
        if (perUnit && row.orgUnitId) await unassignKpiFromUnit(row.orgUnitId, kpi.id);
        else await unassignUserKpi(row.assignmentId);
        reload();
        toast.success('Removed');
      },
    });
  };

  return (
    <div className="space-y-4">
      <TabLoadError error={loadError} onRetry={reload} />

      <PermissionGuard permission="KPI_CREATE">
        <UICard>
          <CardContent>
            <form onSubmit={add} className="flex flex-wrap items-end gap-3" data-testid="assignment-form">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assignment-holder">{perUnit ? 'Unit' : 'Person'}</Label>
                <Select
                  id="assignment-holder"
                  value={holderId || candidates[0]?.id || ''}
                  onChange={(e) => setHolderId(e.target.value)}
                  data-testid="assignment-holder"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {candidates.length === 0 && <option value="">Nothing left to assign</option>}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assignment-target">Target (optional)</Label>
                <Input
                  id="assignment-target"
                  type="number"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  data-testid="assignment-target"
                  className="w-40"
                />
              </div>
              <Button type="submit" isLoading={busy} data-testid="assignment-add">
                Assign
              </Button>
              {err && (
                <p role="alert" data-testid="assignment-error" className="w-full text-sm text-status-critical">
                  {err}
                </p>
              )}
            </form>
          </CardContent>
        </UICard>
      </PermissionGuard>

      <UICard className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{perUnit ? 'Unit' : 'Person'}</TableHead>
              <TableHead>Latest value</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {held.map((row) => (
              <TableRow key={row.assignmentId} data-testid={`assignment-row-${row.assignmentId}`}>
                <TableCell className="text-content-strong">
                  {row.name}
                  {'inherited' in row && row.inherited && (
                    <span className="ml-2 text-xs text-content-muted">inherited</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{row.currentValue ?? '—'}</TableCell>
                <TableCell className="tabular-nums">{row.targetValue ?? '—'}</TableCell>
                <TableCell>{labelFor(ASSIGNMENT_STATUS_LABELS, row.status)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <PermissionGuard permission="KPI_CREATE">
                    {!('inherited' in row && row.inherited) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-status-critical hover:bg-status-critical-bg"
                        data-testid={`assignment-remove-${row.assignmentId}`}
                        onClick={() => void remove(row)}
                      >
                        Remove
                      </Button>
                    )}
                  </PermissionGuard>
                </TableCell>
              </TableRow>
            ))}
            {assignments && held.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-center text-content-muted" data-testid="assignment-empty">
                  {perUnit
                    ? 'No unit holds this KPI yet, so nobody can record a value for it.'
                    : 'Nobody holds this KPI yet, so nobody can record a value for it.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </UICard>
    </div>
  );
}

/**
 * One recorded value, with Correct (value / note + a required reason) and its
 * correction history. The server allows a correction only by the person who
 * recorded the value or a KPI editor, and never on calculated values.
 */
function DataPointRow({
  kpi,
  point: p,
  onChanged,
  owner = null,
}: {
  kpi: KpiSummary;
  point: DataPoint;
  onChanged: () => void;
  /** The unit or person this value belongs to, for a scoped KPI. */
  owner?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(p.value));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<DataPointCorrection[] | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await correctDataPoint(kpi.id, p.id, { value: Number(value), reason });
      setEditing(false);
      setReason('');
      setHistory(null);
      onChanged();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not correct this value');
    }
  };

  const toggleHistory = async () => {
    if (history) {
      setHistory(null);
      return;
    }
    try {
      setHistory(await listDataPointHistory(kpi.id, p.id));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not load the history');
    }
  };

  return (
    <>
      <TableRow>
                <TableCell className="tabular-nums">
                  <span data-testid="data-point-value">{p.value}</span>
                  {kpi.unit ? ` ${kpi.unit}` : ''}
                </TableCell>
                <TableCell className="text-content-muted">{new Date(p.periodStart).toLocaleDateString()}</TableCell>
                {kpi.scope !== 'ORG_WIDE' && (
                  <TableCell className="text-content-muted" data-testid="data-point-owner">
                    {owner ?? '—'}
                  </TableCell>
                )}
                <TableCell className="text-content-muted">{new Date(p.recordedAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  {(p as DataPoint & { isOutlier?: boolean }).isOutlier ? (
                    <Badge tone="warning">outlier</Badge>
                  ) : p.sourceType === 'COMPUTED' ? (
                    <span className="text-xs text-content-muted">computed</span>
                  ) : (
                    ''
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {p.sourceType !== 'COMPUTED' && (
                    <PermissionGuard permission="KPI_DATA_ENTRY">
                      <Button size="sm" variant="ghost" data-testid="data-point-correct" onClick={() => setEditing((v) => !v)}>
                        Correct
                      </Button>
                    </PermissionGuard>
                  )}
                  <Button size="sm" variant="ghost" data-testid="data-point-history" onClick={() => void toggleHistory()}>
                    History
                  </Button>
                </TableCell>
      </TableRow>
      {(editing || err || history) && (
        <TableRow>
          <TableCell colSpan={kpi.scope === 'ORG_WIDE' ? 5 : 6} className="bg-surface-bg">
            {editing && (
              <form onSubmit={save} className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`correct-value-${p.id}`}>Correct value</Label>
                  <Input id={`correct-value-${p.id}`} type="number" step="any" required value={value} onChange={(e) => setValue(e.target.value)} data-testid="correct-value" />
                </div>
                <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
                  <Label htmlFor={`correct-reason-${p.id}`}>Reason</Label>
                  <Input id={`correct-reason-${p.id}`} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it changed" data-testid="correct-reason" />
                </div>
                <Button type="submit" size="sm" data-testid="correct-save">Save correction</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </form>
            )}
            {err && <p className="mt-2 text-sm text-status-critical" role="alert">{err}</p>}
            {history && (
              <ul className="mt-2 space-y-1 text-sm" data-testid="data-point-history-list">
                {history.length === 0 && <li className="text-content-muted">Never corrected.</li>}
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="tabular-nums">{h.previousValue} → {h.newValue}</span>
                    <span className="text-content-muted"> · {new Date(h.changedAt).toLocaleString()} · </span>
                    {h.reason}
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function TargetsTab({ kpiId }: { kpiId: string }) {
  const [targets, reload, loadError] = useAsync(() => listTargets(kpiId), [kpiId]);
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setPending(false);
    try {
      const created: unknown = await createTarget(kpiId, { type: 'STATIC', value: Number(value) });
      setValue('');
      // 202: an active KPI_TARGET workflow queued the target instead of adding it.
      if (isApprovalPending(created)) setPending(true);
      else reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add target');
    }
  };
  return (
    <div className="space-y-4">
      <TabLoadError error={loadError} onRetry={reload} />
      <UICard>
        <CardContent>
          <form onSubmit={add} className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="target-value-input">Static target value</Label>
              <Input
                id="target-value-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type="number"
                step="any"
                required
                data-testid="target-value"
              />
            </div>
            <Button type="submit" data-testid="target-add">
              Add target
            </Button>
          </form>
          {pending && (
            <div className="mt-3">
              <ApprovalPendingNotice what="This target" testId="target-approval-pending" />
            </div>
          )}
          {err && (
            <p role="alert" data-testid="target-error" className="mt-2 text-sm text-status-critical">
              {err}
            </p>
          )}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          {(targets ?? []).map((t: KpiTarget) => (
            <div
              key={t.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="tabular-nums text-content-strong">
                {t.type} {t.value ?? `${t.minValue}/${t.expectedValue}/${t.stretchValue}`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteTarget(kpiId, t.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button>
            </div>
          ))}
          {targets && targets.length === 0 && <p className="py-3 text-center text-content-muted">No targets.</p>}
        </CardContent>
      </UICard>
    </div>
  );
}

function ThresholdsTab({ kpiId }: { kpiId: string }) {
  const [bands, reload, loadError] = useAsync(() => listThresholdBands(kpiId), [kpiId]);
  const [status] = useAsync(() => getThresholdStatus(kpiId).catch(() => null), [kpiId]);
  const [form, setForm] = useState({ name: '', lower: '', upper: '', color: '#16a34a', order: '0' });
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await createThresholdBand(kpiId, {
        name: form.name,
        lower: form.lower === '' ? null : Number(form.lower),
        upper: form.upper === '' ? null : Number(form.upper),
        color: form.color,
        order: Number(form.order),
      });
      setForm({ name: '', lower: '', upper: '', color: '#16a34a', order: '0' });
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add band');
    }
  };
  return (
    <div className="space-y-4">
      <TabLoadError error={loadError} onRetry={reload} />
      <UICard>
        <CardContent>
          <p className="text-sm text-content-muted">
            Current band:{' '}
            <span className="font-medium text-content-strong">{status?.band ?? status?.reason ?? '—'}</span>
          </p>
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Input
              placeholder="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              data-testid="band-name"
            />
            <Input
              placeholder="lower"
              value={form.lower}
              onChange={(e) => setForm({ ...form, lower: e.target.value })}
              type="number"
              step="any"
            />
            <Input
              placeholder="upper"
              value={form.upper}
              onChange={(e) => setForm({ ...form, upper: e.target.value })}
              type="number"
              step="any"
            />
            <Input
              value={form.order}
              onChange={(e) => setForm({ ...form, order: e.target.value })}
              type="number"
            />
            <Button type="submit" data-testid="band-add">
              Add band
            </Button>
          </form>
          {err && (
            <p role="alert" data-testid="band-error" className="mt-2 text-sm text-status-critical">
              {err}
            </p>
          )}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          {(bands ?? []).map((b: ThresholdBand) => (
            <div
              key={b.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: b.color }} />
                <span className="text-content-strong">{b.name}</span>
                <span className="tabular-nums text-content-muted">
                  [{b.lower ?? '−∞'}, {b.upper ?? '∞'}]
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteThresholdBand(kpiId, b.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button>
            </div>
          ))}
          {bands && bands.length === 0 && <p className="py-3 text-center text-content-muted">No bands.</p>}
        </CardContent>
      </UICard>
    </div>
  );
}

function BenchmarksTab({ kpiId }: { kpiId: string }) {
  const [benchmarks, reload, loadError] = useAsync(() => listBenchmarks(kpiId), [kpiId]);
  const [form, setForm] = useState({ kind: 'EXTERNAL_INDUSTRY', value: '', source: '' });
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await createBenchmark(kpiId, { kind: form.kind, value: Number(form.value), source: form.source || undefined });
      setForm({ kind: 'EXTERNAL_INDUSTRY', value: '', source: '' });
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add benchmark');
    }
  };
  const compute = async () => {
    setErr(null);
    try {
      await computeBenchmark(kpiId, 30);
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to compute benchmark');
    }
  };
  return (
    <div className="space-y-4">
      <TabLoadError error={loadError} onRetry={reload} />
      <UICard>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-content-muted">Benchmarks compare this KPI to reference values.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void compute()}
              data-testid="benchmark-compute"
            >
              Auto-compute (30d)
            </Button>
          </div>
          <form onSubmit={add} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="EXTERNAL_INDUSTRY">Industry</option>
              <option value="EXTERNAL_PEER">Peer</option>
            </Select>
            <Input
              placeholder="value"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              type="number"
              step="any"
              required
              data-testid="benchmark-value"
            />
            <Input
              placeholder="source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <Button type="submit" data-testid="benchmark-add">
              Add
            </Button>
          </form>
          {err && (
            <p role="alert" data-testid="benchmark-error" className="mt-2 text-sm text-status-critical">
              {err}
            </p>
          )}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          {(benchmarks ?? []).map((b: Benchmark) => (
            <div
              key={b.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="tabular-nums text-content-strong">
                {b.kind}: {b.value} {b.source && <span className="text-content-muted">({b.source})</span>}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteBenchmark(kpiId, b.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button>
            </div>
          ))}
          {benchmarks && benchmarks.length === 0 && (
            <p className="py-3 text-center text-content-muted">No benchmarks.</p>
          )}
        </CardContent>
      </UICard>
    </div>
  );
}

function LineageTab({ kpiId }: { kpiId: string }) {
  const [up, reloadUp, upError] = useAsync(() => getLineageUpstream('kpi', kpiId, 3), [kpiId]);
  const [down, reloadDown, downError] = useAsync(() => getLineageDownstream('kpi', kpiId, 3), [kpiId]);
  const loadError = upError ?? downError;
  const reload = () => {
    reloadUp();
    reloadDown();
  };
  const col = (title: string, hops: LineageHop[] | null) => (
    <UICard>
      <CardContent>
        <p className="kn-eyebrow mb-2">{title}</p>
        {(hops ?? []).map((h) => (
          <div key={h.edgeId} className="border-b border-border-divider py-2 text-sm last:border-0">
            <span className="font-mono text-content-strong">
              {h.type}:{h.id.slice(0, 8)}
            </span>
            <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-content-muted">{h.via}</span>
          </div>
        ))}
        {hops && hops.length === 0 && <p className="py-2 text-content-muted">None.</p>}
      </CardContent>
    </UICard>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TabLoadError error={loadError} onRetry={reload} className="sm:col-span-2" />
      {col('Upstream (inputs)', up)}
      {col('Downstream (consumers)', down)}
    </div>
  );
}

function FormulaTab({ kpiId }: { kpiId: string }) {
  const [formula, reload] = useAsync(() => getFormula(kpiId).catch(() => null), [kpiId]);
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (formula) setRaw(formula.raw);
  }, [formula]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await putFormula(kpiId, raw);
      setMsg('Formula saved.');
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to save formula');
    }
  };
  const clear = async () => {
    setErr(null);
    setMsg(null);
    await deleteFormula(kpiId).catch(() => undefined);
    setRaw('');
    reload();
  };
  return (
    <UICard>
      <CardContent>
        <p className="text-sm text-content-muted">
          A formula derives this KPI from other KPIs (referenced by name). Example:{' '}
          <code className="rounded bg-surface-2 px-1 font-mono">revenue - cost</code>
        </p>
        <form onSubmit={save} className="mt-3 space-y-3">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={3}
            className="font-mono"
            placeholder="revenue - cost"
            data-testid="formula-raw"
          />
          <div className="flex gap-2">
            <Button type="submit" data-testid="formula-save">
              Save formula
            </Button>
            {formula && (
              <Button type="button" variant="secondary" onClick={clear}>
                Clear
              </Button>
            )}
          </div>
        </form>
        {msg && (
          <p className="mt-2 text-sm text-status-positive" data-testid="formula-msg">
            {msg}
          </p>
        )}
        {err && (
          <p className="mt-2 text-sm text-status-critical" data-testid="formula-err">
            {err}
          </p>
        )}
      </CardContent>
    </UICard>
  );
}

function CascadeTab({ kpiId }: { kpiId: string }) {
  const [edges, reload, loadError] = useAsync(() => listCascades(), [kpiId]);
  const [names] = useAsync(
    () => listKpis().then((ks) => Object.fromEntries(ks.map((k) => [k.id, k.name]))),
    [kpiId],
  );
  const nm = (id: string) => names?.[id] ?? id.slice(0, 8);
  const parents = (edges ?? []).filter((e: Cascade) => e.childKpiId === kpiId);
  const children = (edges ?? []).filter((e: Cascade) => e.parentKpiId === kpiId);
  const totalWeight = children.reduce((s, c) => s + c.weight, 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TabLoadError error={loadError} onRetry={reload} className="sm:col-span-2" />
      <UICard>
        <CardContent>
          <p className="kn-eyebrow mb-2">Rolls up into (parents)</p>
          {parents.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="text-content-strong">{nm(e.parentKpiId)}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteCascade(e.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Detach
              </Button>
            </div>
          ))}
          {parents.length === 0 && <p className="py-2 text-content-muted">No parents.</p>}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          <p className="kn-eyebrow mb-2">Children (weight {totalWeight})</p>
          {children.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="text-content-strong">
                {nm(e.childKpiId)} <span className="tabular-nums text-content-muted">· {e.method} · w{e.weight}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteCascade(e.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Detach
              </Button>
            </div>
          ))}
          {children.length === 0 && <p className="py-2 text-content-muted">No children.</p>}
          <AddChildForm kpiId={kpiId} names={names} onAdded={reload} />
        </CardContent>
      </UICard>
    </div>
  );
}

function AddChildForm({
  kpiId,
  names,
  onAdded,
}: {
  kpiId: string;
  names: Record<string, string> | null;
  onAdded: () => void;
}) {
  const [childKpiId, setChildKpiId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const options = Object.entries(names ?? {}).filter(([id]) => id !== kpiId);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!childKpiId) return;
    setErr(null);
    try {
      await attachCascade({ parentKpiId: kpiId, childKpiId, method: 'SUM' });
      setChildKpiId('');
      onAdded();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to attach child');
    }
  };
  return (
    <>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Select
          value={childKpiId}
          onChange={(e) => setChildKpiId(e.target.value)}
          className="flex-1"
          data-testid="cascade-child"
        >
          <option value="">Add child KPI…</option>
          {options.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Button type="submit" data-testid="cascade-add">
          Attach
        </Button>
      </form>
      {err && (
        <p role="alert" data-testid="cascade-error" className="mt-2 text-sm text-status-critical">
          {err}
        </p>
      )}
    </>
  );
}

function AuditTab({ kpiId }: { kpiId: string }) {
  const [versions, reload, loadError] = useAsync(() => getKpiVersions(kpiId), [kpiId]);
  return (
    <div className="space-y-4">
      <TabLoadError error={loadError} onRetry={reload} />
    <UICard className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(versions ?? []).map((v: KpiVersion) => (
            <TableRow key={v.id}>
              <TableCell className="tabular-nums">v{v.version}</TableCell>
              <TableCell className="text-content-muted">{v.reason ?? '—'}</TableCell>
              <TableCell className="text-content-muted">{new Date(v.createdAt).toLocaleString()}</TableCell>
            </TableRow>
          ))}
          {versions && versions.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-3 text-center text-content-muted">
                No versions.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </UICard>
    <SnapshotsCard kpiId={kpiId} />
    </div>
  );
}

/**
 * Point-in-time snapshots of this KPI: its definition and the values you can
 * read. A snapshot is visible to the person who took it (and admins).
 */
function SnapshotsCard({ kpiId }: { kpiId: string }) {
  const [snapshots, reload, loadError] = useAsync(() => listKpiSnapshots(kpiId), [kpiId]);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState<KpiSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const take = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await takeKpiSnapshot(kpiId, reason.trim() || undefined);
      setReason('');
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not take a snapshot');
    }
  };

  const view = async (s: KpiSnapshotSummary) => {
    if (open?.id === s.id) {
      setOpen(null);
      return;
    }
    try {
      setOpen(await getKpiSnapshot(kpiId, s.id));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not open the snapshot');
    }
  };

  return (
    <UICard>
      <CardContent className="space-y-3">
        <TabLoadError error={loadError} onRetry={reload} />
        <div>
          <h3 className="text-sm font-semibold text-content-strong">Snapshots</h3>
          <p className="text-xs text-content-muted">Freeze this KPI and the values you can see, for later reference. Only you (and admins) can open your snapshots.</p>
        </div>
        <PermissionGuard permission="KPI_EDIT">
          <form onSubmit={take} className="flex flex-wrap items-end gap-2">
            <Input aria-label="Reason for the snapshot" placeholder="Reason (optional)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" data-testid="snapshot-reason" />
            <Button type="submit" size="sm" data-testid="snapshot-take">Take snapshot</Button>
          </form>
        </PermissionGuard>
        {err && <p className="text-sm text-status-critical" role="alert">{err}</p>}
        <ul className="divide-y divide-border text-sm" data-testid="snapshot-list">
          {(snapshots ?? []).length === 0 && <li className="py-2 text-content-muted">No snapshots yet.</li>}
          {(snapshots ?? []).map((s) => (
            <li key={s.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-content-strong">{s.reason ?? 'Snapshot'}</span>
                  <span className="text-content-muted"> · {new Date(s.takenAt).toLocaleString()} · {s.pointCount} values</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => void view(s)} data-testid="snapshot-view">
                  {open?.id === s.id ? 'Hide' : 'View'}
                </Button>
              </div>
              {open?.id === s.id && (
                <div className="mt-2 rounded border border-border bg-surface-bg p-2 text-xs" data-testid="snapshot-detail">
                  <p className="text-content-muted">Version v{String(open.payload.kpi.version ?? '?')} · target {String(open.payload.kpi.targetValue ?? '—')}</p>
                  <ul className="mt-1 max-h-48 overflow-y-auto tabular-nums">
                    {open.payload.points.map((p, i) => (
                      <li key={`${p.period}-${i}`}>{p.period}: {p.value}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </UICard>
  );
}
