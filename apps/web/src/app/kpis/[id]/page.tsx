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
  getActiveTarget,
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
  listMyKpis,
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
import { ASSIGNMENT_STATUS_LABELS, BAND_STATUS_LABELS, DIRECTION_LABELS, FREQUENCY_LABELS, HEALTH_STATUS_LABELS, KPI_STATUS_LABELS, KPI_TYPE_LABELS, labelFor } from '../../../lib/labels';
import { BAND_PRESETS, bandMeaning } from '@kpi-nexus/contracts';
import { useAllowed } from '../../../lib/use-allowed';
import { attainmentOf } from '../../../lib/attainment';
import { useConfirm } from '../../../lib/use-confirm';
import { type KpiTab, kpiAnalyticsLinksFor, kpiTabFromParam, kpiTabHref, kpiTabsFor } from '../../../lib/kpi-detail-tabs';
import { usePermissions } from '../../../lib/use-permissions';
import { useToast } from '../../../lib/use-toast';
import { BusyForm, BusySubmit } from '../../../components/busy-form';
import { useFormat } from '../../../lib/format-context';

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
          <Badge tone="neutral">{labelFor(KPI_STATUS_LABELS, kpi.status)}</Badge>
          <ScopeBadge scope={kpi.scope} />
          <span className="text-xs tabular-nums text-content-muted">
            v{kpi.version} · {labelFor(KPI_TYPE_LABELS, kpi.type)}
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
  const fmt = useFormat();
  const [points, reloadPoints, pointsError] = useAsync(() => listKpiDataPoints(kpi.id), [kpi.id]);
  const [status] = useAsync(() => getThresholdStatus(kpi.id).catch(() => null), [kpi.id]);
  const mayRecord = useAllowed('KPI_DATA_ENTRY');
  const latest = points?.[0];
  const series = (points ?? []).slice().reverse().map((p) => p.value);
  const unit = kpi.unit ? ` ${kpi.unit}` : '';
  const withUnit = (n: number) => `${fmt.number(n)}${unit}`;
  // A per-person KPI has no one target: each person has their own, on their assignment. The reader's
  // own is what this page shows them; someone with no assignment (an administrator) is told where
  // the targets are. A per-unit KPI's targets are per unit in the same way.
  const perPerson = kpi.scope === 'PER_USER';
  const perUnit = kpi.scope === 'PER_UNIT';
  const [myKpis] = useAsync(() => (perPerson ? listMyKpis().catch(() => []) : Promise.resolve([])), [kpi.id, perPerson]);
  const mine = perPerson ? ((myKpis ?? []).find((r) => r.kpiId === kpi.id) ?? null) : null;
  const target = perPerson ? (mine?.targetValue ?? null) : perUnit ? null : kpi.targetValue;
  const attainment = perPerson ? attainmentOf(latest?.value ?? mine?.currentValue, target, kpi.direction) : status?.attainmentPct;
  // Someone who sees several holders' values — a manager, an administrator — must not be shown
  // "the latest value": that is whichever person or unit recorded last, and a line through the
  // values would join different people's figures. They get each holder's own figure instead.
  const [assignments] = useAsync(
    () => (perPerson || perUnit ? listKpiAssignments(kpi.id).catch(() => null) : Promise.resolve(null)),
    [kpi.id, perPerson, perUnit],
  );
  const holders: Array<{ name: string; targetValue: number | null; currentValue: number | null; status: string | null }> | null =
    myKpis === null || !assignments ? null : perUnit ? assignments.units : perPerson && !mine ? assignments.users : null;
  const holderWord = perUnit ? 'unit' : 'person';
  const holderCount = (n: number) => (perUnit ? `${n} unit${n === 1 ? '' : 's'}` : n === 1 ? '1 person' : `${n} people`);
  return (
    <div className="space-y-4">
      <TabLoadError error={pointsError} onRetry={reloadPoints} />
      {/* A KPI with nothing recorded: say so, and what comes next. */}
      {points && points.length === 0 && (
        <div
          data-testid="overview-record-first"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-content"
        >
          <p>
            <span className="font-medium text-content-strong">No values yet.</span>{' '}
            {perPerson
              ? mine
                ? 'You record your own value for this KPI under My KPIs.'
                : 'Each person it is assigned to records their own value under My KPIs.'
              : mayRecord
                ? 'Record the first one to see how this KPI stands.'
                : 'Once someone records a value, this page shows how the KPI stands.'}
          </p>
          {perPerson
            ? mine &&
              mayRecord && (
                <Link
                  href="/my-kpis"
                  className="inline-flex h-9 items-center rounded-lg bg-accent-primary px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  Record under My KPIs
                </Link>
              )
            : mayRecord && (
                <Link
                  href={kpiTabHref(kpi.id, 'Data')}
                  className="inline-flex h-9 items-center rounded-lg bg-accent-primary px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  Record a value
                </Link>
              )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Latest value</p>
            <p
              className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-content-strong"
              data-testid="overview-latest"
            >
              {holders ? `Per ${holderWord}` : latest ? withUnit(latest.value) : '—'}
            </p>
            {holders && <p className="mt-1 text-xs text-content-muted">Each {holderWord}&rsquo;s own figure is below.</p>}
            {!holders && latest && (
              <p className="mt-1 text-xs text-content-muted" data-testid="overview-latest-period">
                for {fmt.day(latest.periodStart)} – {fmt.day(latest.periodEnd)}
              </p>
            )}
          </CardContent>
        </UICard>
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Target</p>
            <p
              className={cn(
                'mt-1 tabular-nums tracking-tight',
                target != null ? 'text-3xl font-semibold text-content-strong' : 'text-xl font-medium text-content-muted',
              )}
              data-testid="overview-target"
            >
              {target != null
                ? withUnit(target)
                : perUnit
                  ? 'Set per unit'
                  : perPerson && !mine
                    ? 'Set per person'
                    : 'No target set'}
            </p>
            <p className="mt-1 text-xs text-content-muted">
              {perUnit || (perPerson && !mine) ? (
                <>Each {perUnit ? 'unit' : 'person'} has their own: see the Assignments tab.</>
              ) : target == null ? (
                perPerson ? (
                  <>Whoever assigned this KPI to you can set one.</>
                ) : (
                  <>Set one under Edit or on the Targets tab.</>
                )
              ) : (
                <>
                  {perPerson && <span data-testid="overview-target-whose">Your target</span>}
                  {perPerson && attainment != null && ' · '}
                  {attainment != null && <span data-testid="overview-attainment">{Math.round(attainment)}% of target</span>}
                </>
              )}
            </p>
          </CardContent>
        </UICard>
        <UICard>
          <CardContent>
            {/* The same health the home page shows, from the same rule (QA-H3). */}
            <p className="kn-eyebrow">Health</p>
            <p className="mt-1 text-xl font-medium text-content-strong" data-testid="overview-health">
              {holders ? holderCount(holders.length) : status?.health ? labelFor(HEALTH_STATUS_LABELS, status.health) : '—'}
            </p>
            <p className="mt-1 text-xs text-content-muted" data-testid="overview-health-basis">
              {holders
                ? Object.entries(
                    holders.reduce<Record<string, number>>((acc, h) => {
                      const key = h.currentValue === null ? 'no value yet' : labelFor(ASSIGNMENT_STATUS_LABELS, h.status).toLowerCase();
                      acc[key] = (acc[key] ?? 0) + 1;
                      return acc;
                    }, {}),
                  )
                    .map(([label, n]) => `${n} ${label}`)
                    .join(' · ')
                : status?.band
                ? `In the band “${status.band}”`
                : status?.health === 'NO_DATA' || status?.health === 'NO_TARGET' || !status?.health
                  ? ''
                  : kpi.warningThreshold !== null || kpi.criticalThreshold !== null
                    ? 'From its warning and critical thresholds'
                    : 'From its target'}
            </p>
          </CardContent>
        </UICard>
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Direction · Frequency</p>
            <p className="mt-1 text-sm text-content-strong">{labelFor(DIRECTION_LABELS, kpi.direction)}</p>
            <p className="text-sm text-content-muted">{labelFor(FREQUENCY_LABELS, kpi.frequency)}</p>
          </CardContent>
        </UICard>
      </div>
      {holders && holders.length > 0 && (
        <UICard className="p-0">
          <Table data-testid="overview-by-holder">
            <TableHeader>
              <TableRow>
                <TableHead>{perUnit ? 'Unit' : 'Person'}</TableHead>
                <TableHead className="text-right">Latest value</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Attained</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holders.map((h) => {
                const pct = attainmentOf(h.currentValue, h.targetValue, kpi.direction);
                return (
                  <TableRow key={h.name} data-testid={`holder-row-${h.name}`}>
                    <TableCell className="font-medium text-content-strong">{h.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.currentValue === null ? '—' : withUnit(h.currentValue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-content-muted">{h.targetValue === null ? '—' : withUnit(h.targetValue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-content-muted">{pct === null ? '—' : `${Math.round(pct)}%`}</TableCell>
                    <TableCell className="text-content-muted">
                      {h.currentValue === null ? 'No value yet' : labelFor(ASSIGNMENT_STATUS_LABELS, h.status)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </UICard>
      )}
      {!holders && series.length > 1 && points && (
        <UICard>
          <CardContent>
            <p className="kn-eyebrow mb-2">Trend</p>
            <LineChart
              series={[
                { data: series },
                // The target, as a level to read the line against.
                ...(target != null ? [{ data: series.map(() => target), dashed: true, label: 'Target' }] : []),
              ]}
              height={200}
              className="w-full"
              aria-label={`${kpi.name} trend over time`}
            />
            <p className="mt-2 text-xs text-content-muted" data-testid="overview-trend-caption">
              {series.length} values, {fmt.day(points[points.length - 1]!.periodStart)} to {fmt.day(points[0]!.periodEnd)} · lowest{' '}
              {withUnit(Math.min(...series))}, highest {withUnit(Math.max(...series))}
              {target != null ? ` · dashed line: target ${withUnit(target)}` : ''}
            </p>
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
  const fmt = useFormat();
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
                <TableCell className="text-content-muted">{fmt.day(p.periodStart)}</TableCell>
                {kpi.scope !== 'ORG_WIDE' && (
                  <TableCell className="text-content-muted" data-testid="data-point-owner">
                    {owner ?? '—'}
                  </TableCell>
                )}
                <TableCell className="text-content-muted">{fmt.date(p.recordedAt)}</TableCell>
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
              <BusyForm onSubmit={save} className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`correct-value-${p.id}`}>Correct value</Label>
                  <Input id={`correct-value-${p.id}`} type="number" step="any" required value={value} onChange={(e) => setValue(e.target.value)} data-testid="correct-value" />
                </div>
                <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
                  <Label htmlFor={`correct-reason-${p.id}`}>Reason</Label>
                  <Input id={`correct-reason-${p.id}`} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it changed" data-testid="correct-reason" />
                </div>
                <BusySubmit size="sm" data-testid="correct-save">Save correction</BusySubmit>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </BusyForm>
            )}
            {err && <p className="mt-2 text-sm text-status-critical" role="alert">{err}</p>}
            {history && (
              <ul className="mt-2 space-y-1 text-sm" data-testid="data-point-history-list">
                {history.length === 0 && <li className="text-content-muted">Never corrected.</li>}
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="tabular-nums">{h.previousValue} → {h.newValue}</span>
                    <span className="text-content-muted"> · {fmt.dateTime(h.changedAt)} · </span>
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

/** What kind of target a row is, in words. */
const TARGET_TYPE_LABELS: Record<string, string> = {
  STATIC: 'Fixed',
  TIME_VARYING: 'Dated',
  TIERED: 'Tiered',
  SCENARIO: 'Scenario',
  DYNAMIC: 'Formula',
  CONDITIONAL: 'Conditional',
};

/** Kinds that never become the KPI's target: a what-if, or no single figure. */
const TARGET_NEVER_COUNTS = new Set(['SCENARIO', 'DYNAMIC', 'CONDITIONAL']);

function TargetsTab({ kpiId }: { kpiId: string }) {
  const confirm = useConfirm();
  const fmt = useFormat();
  const [targets, reloadTargets, loadError] = useAsync(() => listTargets(kpiId), [kpiId]);
  // The one that counts now, and the KPI's own target, which it is written to.
  const [active, reloadActive] = useAsync(() => getActiveTarget(kpiId).catch(() => null), [kpiId]);
  const [kpi, reloadKpi] = useAsync(() => getKpi(kpiId).catch(() => null), [kpiId]);
  const reload = () => {
    reloadTargets();
    reloadActive();
    reloadKpi();
  };
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setPending(false);
    if (from && to && to <= from) {
      setErr('"Until" must be after "Applies from".');
      return;
    }
    try {
      const created: unknown = await createTarget(kpiId, {
        type: 'STATIC',
        value: Number(value),
        // A day chosen here starts at its first moment and ends at its last.
        effectiveFrom: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        effectiveTo: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      setValue('');
      setFrom('');
      setTo('');
      // 202: an active KPI_TARGET workflow queued the target instead of adding it.
      if (isApprovalPending(created)) setPending(true);
      else reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add target');
    }
  };
  const now = Date.now();
  const note = (t: KpiTarget): string | null => {
    if (TARGET_NEVER_COUNTS.has(t.type)) return 'Kept for reference; never the KPI’s target';
    if (t.effectiveFrom && new Date(t.effectiveFrom).getTime() > now) return 'Starts later';
    if (t.effectiveTo && new Date(t.effectiveTo).getTime() < now) return 'Ended';
    return null;
  };
  const period = (t: KpiTarget): string => {
    if (t.effectiveFrom && t.effectiveTo) return `${fmt.day(t.effectiveFrom)} – ${fmt.day(t.effectiveTo)}`;
    if (t.effectiveFrom) return `from ${fmt.day(t.effectiveFrom)}`;
    if (t.effectiveTo) return `until ${fmt.day(t.effectiveTo)}`;
    return 'no dates';
  };
  return (
    <div className="space-y-4">
      <TabLoadError error={loadError} onRetry={reload} />
      <UICard>
        <CardContent>
          <p className="text-sm text-content-muted">
            The target in effect here is the KPI’s target: its status, attainment, dashboards and reports are
            measured against it. A target with dates takes effect, and stops, on its own.
          </p>
          {targets && active === null && (
            <p className="mt-2 text-sm text-content" data-testid="targets-none-in-effect">
              No target here is in effect now.{' '}
              {kpi?.targetValue != null
                ? `The KPI keeps the target it has: ${fmt.number(kpi.targetValue)}.`
                : 'The KPI has no target.'}
            </p>
          )}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          <PermissionGuard permission="KPI_EDIT">
            <BusyForm onSubmit={add} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="target-value-input">Target value</Label>
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="target-from-input">Applies from (optional)</Label>
                <Input id="target-from-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="target-from" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="target-to-input">Until (optional)</Label>
                <Input id="target-to-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="target-to" />
              </div>
              <BusySubmit data-testid="target-add">Add target</BusySubmit>
            </BusyForm>
          </PermissionGuard>
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
              data-testid={`target-row-${t.id}`}
              className="flex items-center justify-between gap-3 border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums font-medium text-content-strong">
                  {t.value != null
                    ? fmt.number(t.value)
                    : [t.minValue, t.expectedValue, t.stretchValue].map((v) => (v == null ? '—' : fmt.number(v))).join(' / ')}
                </span>
                <span className="text-content-muted">
                  {TARGET_TYPE_LABELS[t.type] ?? t.type} · {period(t)}
                </span>
                {active?.id === t.id ? (
                  <Badge tone="success" data-testid="target-in-effect">
                    In effect — the KPI’s target
                  </Badge>
                ) : (
                  note(t) && <span className="text-xs text-content-muted">{note(t)}</span>
                )}
              </span>
              <PermissionGuard permission="KPI_EDIT"><Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void confirm({
                    title: `Delete the ${t.type.toLowerCase()} target?`,
                    description:
                      active?.id === t.id
                        ? 'This is the target in effect. If another one applies now it takes over; otherwise the KPI keeps this figure as its target until you set another. Recorded values are kept.'
                        : 'It is not the target in effect, so the KPI’s target does not change. Recorded values are kept.',
                    confirmLabel: 'Delete target',
                    tone: 'danger',
                    testId: 'target-delete-confirm',
                    action: async () => {
                      await deleteTarget(kpiId, t.id);
                      reload();
                    },
                  })
                }
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button></PermissionGuard>
            </div>
          ))}
          {targets && targets.length === 0 && <p className="py-3 text-center text-content-muted">No targets.</p>}
        </CardContent>
      </UICard>
    </div>
  );
}

/** How a parent KPI is worked out from its children (the API's roll-up methods, bar the custom formula). */
const ROLLUP_METHOD_LABELS: Record<string, string> = {
  SUM: 'The sum of them',
  AVG: 'Their average',
  WEIGHTED_AVG: 'Their weighted average',
  MIN: 'The lowest of them',
  MAX: 'The highest of them',
};

const EMPTY_BAND = { name: '', lower: '', upper: '', color: BAND_PRESETS[0]!.color, order: '0', consecutive: '1' };

/** "50 to 80", "up to 49", "80 and above", "any value". */
function bandRange(lower: number | null, upper: number | null): string {
  if (lower != null && upper != null) return `${lower} to ${upper}`;
  if (upper != null) return `up to ${upper}`;
  if (lower != null) return `${lower} and above`;
  return 'any value';
}

function ThresholdsTab({ kpiId }: { kpiId: string }) {
  const confirm = useConfirm();
  const [bands, reload, loadError] = useAsync(() => listThresholdBands(kpiId), [kpiId]);
  const [status] = useAsync(() => getThresholdStatus(kpiId).catch(() => null), [kpiId]);
  const [form, setForm] = useState(EMPTY_BAND);
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (form.lower !== '' && form.upper !== '' && Number(form.lower) > Number(form.upper)) {
      setErr('"From" must not be greater than "To".');
      return;
    }
    try {
      await createThresholdBand(kpiId, {
        name: form.name,
        lower: form.lower === '' ? null : Number(form.lower),
        upper: form.upper === '' ? null : Number(form.upper),
        color: form.color,
        order: Number(form.order),
        consecutivePointsRequired: Number(form.consecutive) || 1,
      });
      setForm(EMPTY_BAND);
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add band');
    }
  };
  // The select shows what the name typed so far counts as; choosing from it fills name and colour.
  const meaning = form.name.trim() === '' ? '' : bandMeaning(form.name);
  return (
    <div className="space-y-4">
      <TabLoadError error={loadError} onRetry={reload} />
      <UICard>
        <CardContent>
          <p className="text-sm text-content-muted" data-testid="band-status">
            Current band:{' '}
            {/* The band's own name, or in words why there is none ("no_bands" was the stored reason). */}
            <span className="font-medium text-content-strong">{status?.band ?? labelFor(BAND_STATUS_LABELS, status?.reason)}</span>
          </p>
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          <PermissionGuard permission="KPI_EDIT">
            <BusyForm onSubmit={add} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="band-meaning">Counts as</Label>
                  <Select
                    id="band-meaning"
                    value={meaning}
                    onChange={(e) => {
                      const preset = BAND_PRESETS.find((p) => p.meaning === e.target.value);
                      if (preset) setForm({ ...form, name: preset.name, color: preset.color });
                    }}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {BAND_PRESETS.map((p) => (
                      <option key={p.meaning} value={p.meaning}>
                        {labelFor(HEALTH_STATUS_LABELS, p.meaning)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="band-name">Name</Label>
                  <Input
                    id="band-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    maxLength={80}
                    data-testid="band-name"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="band-lower">From</Label>
                  <Input
                    id="band-lower"
                    placeholder="no lower limit"
                    value={form.lower}
                    onChange={(e) => setForm({ ...form, lower: e.target.value })}
                    type="number"
                    step="any"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="band-upper">To</Label>
                  <Input
                    id="band-upper"
                    placeholder="no upper limit"
                    value={form.upper}
                    onChange={(e) => setForm({ ...form, upper: e.target.value })}
                    type="number"
                    step="any"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="band-color">Colour</Label>
                  <input
                    id="band-color"
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface-bg p-1"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="band-order">Checked in position</Label>
                  <Input
                    id="band-order"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: e.target.value })}
                    type="number"
                    min={0}
                    max={1000}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="band-consecutive">Readings in a row</Label>
                  <Input
                    id="band-consecutive"
                    value={form.consecutive}
                    onChange={(e) => setForm({ ...form, consecutive: e.target.value })}
                    type="number"
                    min={1}
                    max={100}
                  />
                </div>
                <div className="flex items-end">
                  <BusySubmit data-testid="band-add">Add band</BusySubmit>
                </div>
              </div>
              <p className="text-xs text-content-muted">
                {meaning !== '' && (
                  <span data-testid="band-meaning-hint" className="font-medium text-content">
                    A band with this name counts as {labelFor(HEALTH_STATUS_LABELS, meaning)}.
                  </span>
                )}{' '}
                The status a band gives comes from its name. Bands are checked from the lowest position up
                and the first one holding the value wins; a band applies once the value has stayed in it
                for the number of readings in a row.
              </p>
            </BusyForm>
          </PermissionGuard>
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
              data-testid={`band-row-${b.name}`}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: b.color }} aria-hidden />
                <span className="text-content-strong">{b.name}</span>
                <span className="tabular-nums text-content-muted">{bandRange(b.lower, b.upper)}</span>
                <span className="text-content-muted">
                  · Counts as {labelFor(HEALTH_STATUS_LABELS, bandMeaning(b.name))}
                  {b.consecutivePointsRequired > 1 ? ` after ${b.consecutivePointsRequired} readings in a row` : ''}
                </span>
              </span>
              <PermissionGuard permission="KPI_EDIT"><Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void confirm({
                    title: `Delete the band “${b.name}”?`,
                    description: 'The KPI’s status is worked out from the bands that remain.',
                    confirmLabel: 'Delete band',
                    tone: 'danger',
                    testId: 'band-delete-confirm',
                    action: async () => {
                      await deleteThresholdBand(kpiId, b.id);
                      reload();
                    },
                  })
                }
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button></PermissionGuard>
            </div>
          ))}
          {bands && bands.length === 0 && <p className="py-3 text-center text-content-muted">No bands.</p>}
        </CardContent>
      </UICard>
    </div>
  );
}

function BenchmarksTab({ kpiId }: { kpiId: string }) {
  const confirm = useConfirm();
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
            <PermissionGuard permission="KPI_EDIT"><Button
              variant="secondary"
              size="sm"
              onClick={() => void compute()}
              data-testid="benchmark-compute"
            >
              Auto-compute (30d)
            </Button></PermissionGuard>
          </div>
          <PermissionGuard permission="KPI_EDIT"><BusyForm onSubmit={add} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <BusySubmit data-testid="benchmark-add">
              Add
            </BusySubmit>
          </BusyForm></PermissionGuard>
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
              <PermissionGuard permission="KPI_EDIT"><Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void confirm({
                    title: `Delete the ${b.kind.toLowerCase().replace(/_/g, ' ')} benchmark?`,
                    description: 'It is no longer shown against this KPI. Recorded values are kept.',
                    confirmLabel: 'Delete benchmark',
                    tone: 'danger',
                    testId: 'benchmark-delete-confirm',
                    action: async () => {
                      await deleteBenchmark(kpiId, b.id);
                      reload();
                    },
                  })
                }
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button></PermissionGuard>
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
  // Saving or clearing a formula is KPI_EDIT on the API; a reader is shown it, not a form that would be refused (UI-013).
  const canEdit = usePermissions().has('KPI_EDIT');
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
    try {
      await deleteFormula(kpiId);
      setRaw('');
      setMsg('Formula cleared.');
      reload();
    } catch (e2) {
      // The box used to empty as if it had worked (X-02).
      setErr(e2 instanceof ApiError ? e2.message : 'The formula was not cleared.');
    }
  };
  return (
    <UICard>
      <CardContent>
        <p className="text-sm text-content-muted">
          A formula derives this KPI from other KPIs (referenced by name). Example:{' '}
          <code className="rounded bg-surface-2 px-1 font-mono">revenue - cost</code>
        </p>
        <PermissionGuard permission="KPI_EDIT"><BusyForm onSubmit={save} className="mt-3 space-y-3">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={3}
            className="font-mono"
            placeholder="revenue - cost"
            data-testid="formula-raw"
          />
          <div className="flex gap-2">
            <BusySubmit data-testid="formula-save">
              Save formula
            </BusySubmit>
            {formula && (
              <Button type="button" variant="secondary" onClick={clear}>
                Clear
              </Button>
            )}
          </div>
        </BusyForm></PermissionGuard>
        {!canEdit &&
          (formula ? (
            <pre className="mt-3 overflow-x-auto rounded-md border border-border-divider bg-surface-1 px-3 py-2 font-mono text-sm text-content-strong" data-testid="formula-readonly">
              {formula.raw}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-content-muted" data-testid="formula-none">This KPI has no formula.</p>
          ))}
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
  const confirm = useConfirm();
  const [edges, reload, loadError] = useAsync(() => listCascades(), [kpiId]);
  const [names] = useAsync(
    () => listKpis().then((ks) => Object.fromEntries(ks.map((k) => [k.id, k.name]))),
    [kpiId],
  );
  const nm = (id: string) => names?.[id] ?? id.slice(0, 8);
  const parents = (edges ?? []).filter((e: Cascade) => e.childKpiId === kpiId);
  const children = (edges ?? []).filter((e: Cascade) => e.parentKpiId === kpiId);
  // One method for all of a parent's children (the engine reads one); a sum until something else is chosen.
  const method = children[0]?.method ?? 'SUM';
  const weighted = method === 'WEIGHTED_AVG';
  const mayEdit = useAllowed('KPI_EDIT');
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const save = async (childKpiId: string, change: { method?: string; weight?: number }) => {
    setSaveErr(null);
    try {
      await attachCascade({ parentKpiId: kpiId, childKpiId, ...change });
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : 'Could not save the change');
    }
    reload();
  };
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
              <PermissionGuard permission="KPI_EDIT"><Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void confirm({
                    title: `Detach from “${nm(e.parentKpiId)}”?`,
                    description: 'This KPI stops feeding into it. Both KPIs and their values are kept.',
                    confirmLabel: 'Detach',
                    tone: 'danger',
                    testId: 'cascade-detach-confirm',
                    action: async () => {
                      await deleteCascade(e.id);
                      reload();
                    },
                  })
                }
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Detach
              </Button></PermissionGuard>
            </div>
          ))}
          {parents.length === 0 && <p className="py-2 text-content-muted">No parents.</p>}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          <p className="kn-eyebrow mb-2">Children</p>
          {children.length > 0 && (
            <div className="mb-2 flex flex-col gap-1.5">
              <Label htmlFor="cascade-method">This KPI is worked out from its children as</Label>
              {method === 'CUSTOM_FORMULA' ? (
                <p id="cascade-method" className="text-sm text-content-strong" data-testid="cascade-method-custom">
                  A custom formula
                </p>
              ) : (
                <>
                  <Select
                    disabled={!mayEdit}
                    id="cascade-method"
                    value={method}
                    onChange={(ev) => void save(children[0]!.childKpiId, { method: ev.target.value })}
                    data-testid="cascade-method"
                  >
                    {Object.entries(ROLLUP_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </>
              )}
            </div>
          )}
          {saveErr && (
            <p role="alert" data-testid="cascade-save-error" className="mb-2 text-sm text-status-critical">
              {saveErr}
            </p>
          )}
          {children.map((e) => (
            <div
              key={e.id}
              data-testid={`cascade-child-row-${e.childKpiId}`}
              className="flex items-center justify-between gap-2 border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-content-strong">{nm(e.childKpiId)}</span>
              {/* A weight only counts in a weighted average, so it is only offered there. */}
              {weighted && (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-content-muted">
                    Weight
                    <Input
                      key={`${e.id}-${e.weight}`}
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={e.weight}
                      disabled={!mayEdit}
                      className="h-8 w-20"
                      data-testid={`cascade-weight-${e.childKpiId}`}
                      onBlur={(ev) => {
                        const next = Number(ev.target.value);
                        if (ev.target.value.trim() === '' || !Number.isFinite(next) || next < 0) {
                          ev.target.value = String(e.weight);
                          setSaveErr('A weight is a number, zero or more.');
                          return;
                        }
                        if (next !== e.weight) void save(e.childKpiId, { weight: next });
                      }}
                    />
                  </label>
                </>
              )}
              <PermissionGuard permission="KPI_EDIT"><Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void confirm({
                    title: `Detach “${nm(e.childKpiId)}”?`,
                    description: 'It stops feeding into this KPI. Both KPIs and their values are kept.',
                    confirmLabel: 'Detach',
                    tone: 'danger',
                    testId: 'cascade-detach-confirm',
                    action: async () => {
                      await deleteCascade(e.id);
                      reload();
                    },
                  })
                }
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Detach
              </Button></PermissionGuard>
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
      // No method named: the child takes the one this KPI already uses.
      await attachCascade({ parentKpiId: kpiId, childKpiId });
      setChildKpiId('');
      onAdded();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to attach child');
    }
  };
  return (
    <>
      <PermissionGuard permission="KPI_EDIT"><BusyForm onSubmit={add} className="mt-3 flex gap-2">
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
        <BusySubmit data-testid="cascade-add">
          Attach
        </BusySubmit>
      </BusyForm></PermissionGuard>
      {err && (
        <p role="alert" data-testid="cascade-error" className="mt-2 text-sm text-status-critical">
          {err}
        </p>
      )}
    </>
  );
}

function AuditTab({ kpiId }: { kpiId: string }) {
  const fmt = useFormat();
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
              <TableCell className="text-content-muted">{fmt.dateTime(v.createdAt)}</TableCell>
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
  const fmt = useFormat();
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
          <BusyForm onSubmit={take} className="flex flex-wrap items-end gap-2">
            <Input aria-label="Reason for the snapshot" placeholder="Reason (optional)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" data-testid="snapshot-reason" />
            <BusySubmit size="sm" data-testid="snapshot-take">Take snapshot</BusySubmit>
          </BusyForm>
        </PermissionGuard>
        {err && <p className="text-sm text-status-critical" role="alert">{err}</p>}
        <ul className="divide-y divide-border text-sm" data-testid="snapshot-list">
          {(snapshots ?? []).length === 0 && <li className="py-2 text-content-muted">No snapshots yet.</li>}
          {(snapshots ?? []).map((s) => (
            <li key={s.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-content-strong">{s.reason ?? 'Snapshot'}</span>
                  <span className="text-content-muted"> · {fmt.dateTime(s.takenAt)} · {s.pointCount} values</span>
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
