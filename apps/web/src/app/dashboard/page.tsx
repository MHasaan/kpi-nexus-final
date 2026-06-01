'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Plus, Sparkles } from 'lucide-react';
import type { Scope } from '@kpi-nexus/contracts';

import { AppShell } from '../../components/app-shell';
import { OnboardingTour } from '../../components/onboarding-tour';
import { SetupChecklistCard } from '../../components/setup-checklist-card';
import { PermissionGuard } from '../../components/auth/permission-guard';
import {
  Avatar,
  Badge,
  Card,
  Delta,
  EmptyState,
  ScopeBadge,
  Segmented,
  Skeleton,
  StatTile,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui';
import type { BadgeTone, KpiScope, KpiStatus } from '../../components/ui';
import { BarChart, Donut, Sparkline } from '../../components/charts';
import type { DonutDatum } from '../../components/charts';
import {
  ApiError,
  type Alert,
  type AuthUser,
  type DashboardSummaryRow,
  type MyKpiRow,
  clearTokens,
  getAccessToken,
  getAlertUnreadCount,
  getDashboardSummary,
  listAlerts,
  listMyKpis,
  meRequest,
} from '../../lib/api-client';
import { listActivity, type ActivityItem } from '../../lib/polish-client';
import { listApprovalRequests, type ApprovalRequest } from '../../lib/collab-client';
import { listInsights, type Insight } from '../../lib/ai-client';
import { usePermissions } from '../../lib/use-permissions';
import { useAccess } from '../../lib/use-access';

type LoadState = 'loading' | 'error' | 'ready';
type ActivityState = 'loading' | 'ready';
type RangeDays = '7' | '30' | '90';
type WatchTab = 'watch' | 'movers' | 'attention';

const RANGE_OPTIONS: ReadonlyArray<{ value: RangeDays; label: string }> = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

/** Status → chart colour token (icon+label still carries meaning; colour is secondary). */
const STATUS_COLOR: Record<KpiStatus, string> = {
  'on-track': 'hsl(var(--status-success))',
  'at-risk': 'hsl(var(--status-warning))',
  'off-track': 'hsl(var(--status-critical))',
  'no-data': 'hsl(var(--content-muted))',
};

/** Compute an inclusive { from, to } ISO window ending now and spanning `days`. */
function rangeWindow(days: RangeDays): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - Number(days) * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Map a personal KPI's raw status token onto the shared KpiStatus enum. */
function personalStatus(raw: string | null | undefined): KpiStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'exceeded':
    case 'on_track':
    case 'on-track':
      return 'on-track';
    case 'at_risk':
    case 'at-risk':
      return 'at-risk';
    case 'behind':
    case 'off_track':
    case 'off-track':
      return 'off-track';
    default:
      return 'no-data';
  }
}

/** Humanise an audit `action` token (e.g. `kpi.created`) into a readable verb. */
function activityVerb(action: string): string {
  const tail = action.includes('.') ? action.slice(action.lastIndexOf('.') + 1) : action;
  return tail.replace(/[._-]+/g, ' ').trim() || action;
}

/** Humanise an `entityType` token (e.g. `org_unit`) into a readable object label. */
function activityObject(item: ActivityItem): string {
  if (item.entityType) return item.entityType.replace(/[._-]+/g, ' ').trim();
  return 'an item';
}

/** Compact relative time ("2h ago", "3d ago") from an ISO timestamp. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstNameOf(user: AuthUser | null): string {
  if (!user) return '';
  const name = user.fullName?.trim();
  if (name) return name.split(/\s+/)[0] ?? '';
  return user.email?.split('@')[0] ?? '';
}

function formatValue(value: number, unit: string | null): string {
  const formatted =
    Math.abs(value) >= 1000
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : value.toString();
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Derive a KPI health status from latestValue vs target. Null value or no
 * usable target → no-data. Status is icon + label (never colour-only).
 */
function deriveStatus(row: DashboardSummaryRow): KpiStatus {
  if (row.latestValue === null) return 'no-data';
  if (row.targetValue === null || row.targetValue === 0) return 'no-data';
  const ratio = row.latestValue / row.targetValue;
  if (ratio >= 0.95) return 'on-track';
  if (ratio >= 0.8) return 'at-risk';
  return 'off-track';
}

/** Percent attainment of target, when both sides are present. */
function attainmentPct(row: DashboardSummaryRow): number | null {
  if (row.latestValue === null || row.targetValue === null || row.targetValue === 0) return null;
  return (row.latestValue / row.targetValue) * 100;
}

function avgAttainment(rows: readonly DashboardSummaryRow[]): string {
  const vals = rows.map(attainmentPct).filter((v): v is number => v !== null);
  if (vals.length === 0) return '—';
  return `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`;
}

/** Recent movement proxy (latest vs window aggregate) — used to rank "Top movers". */
function movement(row: DashboardSummaryRow): number {
  if (row.latestValue === null || row.aggregatedValue === null) return 0;
  return row.latestValue - row.aggregatedValue;
}

/** Order KPIs so the ones needing attention (off-track, then at-risk) come first. */
const ATTENTION_RANK: Record<KpiStatus, number> = {
  'off-track': 0,
  'at-risk': 1,
  'no-data': 2,
  'on-track': 3,
};

/** Map the KPIS-domain scope to a human "whose data am I seeing" chip. */
function scopeChip(scope: Scope): { label: string; tone: BadgeTone } {
  switch (scope) {
    case 'ORG':
      return { label: 'Organization-wide', tone: 'info' };
    case 'UNITS':
      return { label: 'Your units', tone: 'neutral' };
    case 'DIRECT_REPORTS':
      return { label: 'Your team', tone: 'neutral' };
    case 'SELF':
      return { label: 'Your data', tone: 'neutral' };
    default:
      return { label: 'Your data', tone: 'neutral' };
  }
}

/** Permission-gated New KPI action, styled as a button-like link. */
function NewKpiAction() {
  return (
    <PermissionGuard permission="KPI_CREATE">
      <Link
        href="/kpis"
        data-testid="dashboard-new-kpi"
        className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-fast hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg"
      >
        <Plus className="h-4 w-4" aria-hidden />
        New KPI
      </Link>
    </PermissionGuard>
  );
}

/** A single KPI row used across the Watch / Movers / Attention tabs. */
function KpiRow({
  row,
  index,
  testidPrefix,
}: {
  row: DashboardSummaryRow;
  index: number;
  testidPrefix: string;
}) {
  const status = deriveStatus(row);
  const pct = attainmentPct(row);
  return (
    <Link
      href={`/kpis/${row.kpiId}`}
      data-testid={`${testidPrefix}-${row.name}`}
      className={[
        'grid grid-cols-[1fr_auto_auto_auto] items-center gap-3.5 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover',
        index ? 'border-t border-border-divider' : '',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-content-strong">{row.name}</span>
          <ScopeBadge scope={row.scope as KpiScope} />
        </div>
        {row.scorecardQuadrant ? (
          <span className="text-[11.5px] text-content-muted">{row.scorecardQuadrant}</span>
        ) : null}
      </div>
      <Sparkline
        data={
          row.latestValue !== null && row.aggregatedValue !== null
            ? [row.aggregatedValue, row.latestValue]
            : [0, 0]
        }
        width={88}
        height={28}
      />
      <span
        data-testid={`${testidPrefix}-value-${row.name}`}
        className="min-w-[80px] text-right text-sm font-semibold tabular-nums text-content-strong"
      >
        {row.latestValue === null ? (
          <span data-testid={`${testidPrefix}-empty-${row.name}`} className="text-content-muted">
            No data
          </span>
        ) : (
          formatValue(row.latestValue, row.unit)
        )}
      </span>
      <div className="flex items-center gap-2">
        {pct !== null ? <Delta value={Math.round(pct - 100)} pct={Math.round(pct - 100)} /> : null}
        <StatusBadge status={status} />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const perms = usePermissions();
  const access = useAccess();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryRow[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [range, setRange] = useState<RangeDays>('90');
  const [rangeBusy, setRangeBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityState, setActivityState] = useState<ActivityState>('loading');
  const [myKpis, setMyKpis] = useState<MyKpiRow[]>([]);
  const [watchTab, setWatchTab] = useState<WatchTab>('watch');

  // Signal widgets (best-effort, permission-gated; a failure leaves them hidden).
  const [unreadAlerts, setUnreadAlerts] = useState<number | null>(null);
  const [openAlerts, setOpenAlerts] = useState<Alert[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    Promise.all([meRequest(), getDashboardSummary(rangeWindow('90'))])
      .then(([meRes, rows]) => {
        if (cancelled) return;
        setUser(meRes.user);
        setSummary(rows);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
          return;
        }
        setState('error');
      });
    // Personal KPI assignments load best-effort: a viewer without any (or a 403)
    // simply renders no "My KPIs" card. Never blocks the org-summary dashboard.
    listMyKpis()
      .then((rows) => !cancelled && setMyKpis(rows))
      .catch(() => !cancelled && setMyKpis([]));
    // Recent-activity rail loads independently — a failure resolves to empty.
    listActivity({ limit: 5 })
      .then((page) => {
        if (cancelled) return;
        setActivity(page.items);
        setActivityState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setActivity([]);
        setActivityState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Permission-gated signal fetches — fire only once permissions resolve, so we
  // never trigger a 403 for a capability the user lacks (keeps the console clean).
  // Depend on stable booleans (not the recreated-each-render `perms` object).
  const permsReady = perms.ready;
  const canViewAlerts = perms.has('ALERTS_VIEW');
  const canViewInsights = perms.has('INSIGHTS_VIEW');
  useEffect(() => {
    if (!permsReady) return;
    let cancelled = false;
    if (canViewAlerts) {
      getAlertUnreadCount()
        .then((r) => !cancelled && setUnreadAlerts(r.count))
        .catch(() => !cancelled && setUnreadAlerts(null));
      listAlerts({ status: 'OPEN' })
        .then((rows) => !cancelled && setOpenAlerts(rows.slice(0, 4)))
        .catch(() => !cancelled && setOpenAlerts([]));
    }
    if (canViewInsights) {
      listInsights()
        .then((rows) => !cancelled && setInsights(rows.slice(0, 3)))
        .catch(() => !cancelled && setInsights([]));
    }
    // Approvals: surfaced for approvers; best-effort, hidden when empty/forbidden.
    listApprovalRequests({ status: 'PENDING' })
      .then((rows) => !cancelled && setPendingApprovals(rows))
      .catch(() => !cancelled && setPendingApprovals([]));
    return () => {
      cancelled = true;
    };
  }, [permsReady, canViewAlerts, canViewInsights]);

  /** Switch the summary window and re-fetch the tiles + KPI lists. */
  const changeRange = useCallback((next: RangeDays) => {
    setRange(next);
    setRangeBusy(true);
    getDashboardSummary(rangeWindow(next))
      .then((rows) => setSummary(rows))
      .catch(() => {
        /* keep the prior window's data on a transient range fetch failure */
      })
      .finally(() => setRangeBusy(false));
  }, []);

  const now = new Date();
  const today = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const subtitle = `${today} · org health at a glance`;

  // Derived views over the summary (memoised; cheap but tidy).
  const statusCounts = useMemo(() => {
    const counts: Record<KpiStatus, number> = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-data': 0 };
    for (const row of summary) counts[deriveStatus(row)] += 1;
    return counts;
  }, [summary]);

  const attainmentBars = useMemo(
    () =>
      summary
        .map((r) => ({ row: r, pct: attainmentPct(r) }))
        .filter((x): x is { row: DashboardSummaryRow; pct: number } => x.pct !== null)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 8)
        .map(({ row, pct }) => ({
          label: row.name.length > 10 ? `${row.name.slice(0, 9)}…` : row.name,
          value: Math.round(pct),
          color: STATUS_COLOR[deriveStatus(row)],
        })),
    [summary],
  );

  const watchRows = summary.slice(0, 5);
  const moverRows = useMemo(
    () => [...summary].sort((a, b) => Math.abs(movement(b)) - Math.abs(movement(a))).slice(0, 5),
    [summary],
  );
  const attentionRows = useMemo(
    () =>
      [...summary]
        .sort((a, b) => ATTENTION_RANK[deriveStatus(a)] - ATTENTION_RANK[deriveStatus(b)])
        .slice(0, 5),
    [summary],
  );

  const donutData: DonutDatum[] = [
    { label: 'On track', value: statusCounts['on-track'], color: STATUS_COLOR['on-track'] },
    { label: 'At risk', value: statusCounts['at-risk'], color: STATUS_COLOR['at-risk'] },
    { label: 'Off track', value: statusCounts['off-track'], color: STATUS_COLOR['off-track'] },
    { label: 'No data', value: statusCounts['no-data'], color: STATUS_COLOR['no-data'] },
  ];

  const chip = access.profile ? scopeChip(access.scopeFor('KPIS')) : null;
  const hasExtraTiles =
    (perms.has('ALERTS_VIEW') && unreadAlerts !== null) || pendingApprovals.length > 0;

  return (
    <AppShell>
      {state === 'ready' && <OnboardingTour />}

      {/* ----------------------------- Header ----------------------------- */}
      {state === 'loading' ? (
        <div className="mb-5">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1
              data-testid="dashboard-heading"
              className="text-2xl font-bold tracking-tight text-content-strong"
            >
              {greetingFor(now)}
              {firstNameOf(user) ? `, ${firstNameOf(user)}` : ''}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-content-muted">{subtitle}</p>
              {chip ? (
                <span data-testid="dashboard-scope-chip" title="The data scope you can see">
                  <Badge tone={chip.tone}>{chip.label}</Badge>
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div data-testid="dashboard-range">
              <Segmented
                aria-label="Dashboard time range"
                options={RANGE_OPTIONS}
                value={range}
                onChange={changeRange}
                className={rangeBusy ? 'opacity-70' : undefined}
              />
            </div>
            <NewKpiAction />
          </div>
        </div>
      )}

      {/* ------------------------------ Error ----------------------------- */}
      {state === 'error' && (
        <div role="alert" data-testid="dashboard-error">
          <div className="mb-4 rounded-lg border border-border-strong bg-status-critical-bg px-4 py-3 text-sm text-status-critical">
            We couldn&apos;t load your dashboard. Something went wrong fetching your KPIs.
          </div>
          <EmptyState
            title="Dashboard unavailable"
            description="Please try again in a moment."
            action={
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Retry
              </button>
            }
          />
        </div>
      )}

      {/* ----------------------------- Loading ---------------------------- */}
      {state === 'loading' && (
        <>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </>
      )}

      {/* ------------------------------ Ready ----------------------------- */}
      {state === 'ready' && (
        <>
          {summary.length === 0 ? (
            <div data-testid="dashboard-empty">
              <EmptyState
                title="No KPIs yet"
                description="Create your first KPI to start tracking what matters across your organization."
                action={<NewKpiAction />}
              />
            </div>
          ) : (
            <>
              {/* Summary stat tiles */}
              <div
                data-testid="dashboard-summary-grid"
                className={[
                  'kn-stagger grid grid-cols-2 gap-3.5 sm:grid-cols-3',
                  hasExtraTiles ? 'xl:grid-cols-6' : 'xl:grid-cols-4',
                ].join(' ')}
              >
                <StatTile label="Total KPIs" value={summary.length} />
                <StatTile label="On track" value={statusCounts['on-track']} />
                <StatTile label="At risk" value={statusCounts['at-risk']} />
                <StatTile label="Avg attainment" value={avgAttainment(summary)} />
                {perms.has('ALERTS_VIEW') && unreadAlerts !== null ? (
                  <StatTile label="Open alerts" value={unreadAlerts} />
                ) : null}
                {pendingApprovals.length > 0 ? (
                  <StatTile label="Pending approvals" value={pendingApprovals.length} />
                ) : null}
              </div>

              {/* Visual row: health donut + attainment bars */}
              <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                <Card data-testid="dashboard-donut" className="p-0">
                  <div className="border-b border-border-divider px-4 py-3.5 text-sm font-semibold text-content-strong">
                    KPI health
                  </div>
                  <div className="flex flex-wrap items-center gap-5 p-4">
                    <Donut
                      data={donutData}
                      centerValue={summary.length}
                      centerLabel="KPIs"
                      aria-label="KPI health distribution"
                    />
                    <ul className="flex min-w-[140px] flex-col gap-2">
                      {donutData.map((d) => (
                        <li key={d.label} className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex items-center gap-2 text-content">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ background: d.color }}
                              aria-hidden
                            />
                            {d.label}
                          </span>
                          <span className="font-semibold tabular-nums text-content-strong">{d.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>

                <Card data-testid="dashboard-attainment-bar" className="p-0">
                  <div className="border-b border-border-divider px-4 py-3.5 text-sm font-semibold text-content-strong">
                    Attainment vs target
                  </div>
                  <div className="p-4">
                    {attainmentBars.length > 0 ? (
                      <BarChart
                        data={attainmentBars}
                        height={208}
                        aria-label="KPI attainment versus target"
                        className="w-full"
                      />
                    ) : (
                      <EmptyState
                        title="No targets set"
                        description="Set targets on your KPIs to see attainment here."
                      />
                    )}
                  </div>
                </Card>
              </div>

              {/* Two-column body: tabbed KPI lists + right rail */}
              <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.7fr_1fr] lg:items-start">
                {/* Tabbed KPI lists */}
                <Card className="overflow-hidden p-0">
                  <div className="flex items-center justify-between gap-3 border-b border-border-divider px-4 pt-2">
                    <Tabs value={watchTab} onValueChange={(v) => setWatchTab(v as WatchTab)}>
                      <TabsList className="border-b-0">
                        <TabsTrigger value="watch">KPIs to watch</TabsTrigger>
                        <TabsTrigger value="movers">Top movers</TabsTrigger>
                        <TabsTrigger value="attention">Needs attention</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Link
                      href="/kpis"
                      className="shrink-0 text-[13px] font-semibold text-accent-primary hover:underline"
                    >
                      View all →
                    </Link>
                  </div>
                  <Tabs value={watchTab} onValueChange={(v) => setWatchTab(v as WatchTab)}>
                    <TabsContent value="watch" className="pt-0">
                      <ul>
                        {watchRows.map((row, i) => (
                          <li key={row.kpiId}>
                            <KpiRow row={row} index={i} testidPrefix="dashboard-card" />
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                    <TabsContent value="movers" className="pt-0">
                      <ul data-testid="dashboard-movers-list">
                        {moverRows.map((row, i) => (
                          <li key={row.kpiId}>
                            <KpiRow row={row} index={i} testidPrefix="dashboard-mover" />
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                    <TabsContent value="attention" className="pt-0">
                      <ul data-testid="dashboard-attention-list">
                        {attentionRows.map((row, i) => (
                          <li key={row.kpiId}>
                            <KpiRow row={row} index={i} testidPrefix="dashboard-attention" />
                          </li>
                        ))}
                      </ul>
                    </TabsContent>
                  </Tabs>
                </Card>

                {/* Right rail */}
                <div className="flex flex-col gap-3.5">
                  {myKpis.length > 0 ? (
                    <Card data-testid="dashboard-my-kpis" className="overflow-hidden p-0">
                      <div className="flex items-center justify-between border-b border-border-divider px-4 py-3.5">
                        <span className="text-sm font-semibold text-content-strong">My KPIs</span>
                        <Link
                          href="/my-kpis"
                          className="text-[13px] font-semibold text-accent-primary hover:underline"
                        >
                          View all →
                        </Link>
                      </div>
                      <ul>
                        {myKpis.slice(0, 5).map((row, i) => (
                          <li key={row.assignmentId}>
                            <Link
                              href="/my-kpis"
                              data-testid={`dashboard-my-kpi-${row.name}`}
                              className={[
                                'flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover',
                                i ? 'border-t border-border-divider' : '',
                              ].join(' ')}
                            >
                              <span className="min-w-0 truncate text-[13px] font-semibold text-content-strong">
                                {row.name}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="text-[13px] tabular-nums text-content">
                                  <span className="font-semibold text-content-strong">
                                    {row.currentValue === null ? '—' : formatValue(row.currentValue, row.unit)}
                                  </span>
                                  {row.targetValue !== null ? (
                                    <span className="text-content-muted">
                                      {' / '}
                                      {formatValue(row.targetValue, row.unit)}
                                    </span>
                                  ) : null}
                                </span>
                                <StatusBadge status={personalStatus(row.status)} />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ) : null}

                  {/* AI insights preview */}
                  {perms.has('INSIGHTS_VIEW') && insights.length > 0 ? (
                    <Card data-testid="dashboard-insights" className="overflow-hidden p-0">
                      <div className="flex items-center justify-between border-b border-border-divider px-4 py-3.5">
                        <span className="flex items-center gap-2 text-sm font-semibold text-content-strong">
                          <Sparkles className="h-4 w-4 text-accent-primary" aria-hidden />
                          AI insights
                        </span>
                        <Link
                          href="/insights"
                          className="text-[13px] font-semibold text-accent-primary hover:underline"
                        >
                          View all →
                        </Link>
                      </div>
                      <ul className="divide-y divide-border-divider">
                        {insights.map((it) => (
                          <li key={it.id} className="px-4 py-3">
                            <p className="line-clamp-3 text-[12.5px] leading-relaxed text-content">
                              {it.narrative}
                            </p>
                            <div className="mt-1.5">
                              <Badge tone={it.confidence >= 0.66 ? 'success' : it.confidence >= 0.33 ? 'warning' : 'neutral'}>
                                {Math.round(it.confidence * 100)}% confidence
                              </Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ) : null}

                  {/* Alerts summary */}
                  {perms.has('ALERTS_VIEW') && (unreadAlerts !== null || openAlerts.length > 0) ? (
                    <Card data-testid="dashboard-alerts-summary" className="overflow-hidden p-0">
                      <div className="flex items-center justify-between border-b border-border-divider px-4 py-3.5">
                        <span className="flex items-center gap-2 text-sm font-semibold text-content-strong">
                          <AlertTriangle className="h-4 w-4 text-status-warning" aria-hidden />
                          Alerts
                          {unreadAlerts ? (
                            <Badge tone="error">{unreadAlerts} unread</Badge>
                          ) : null}
                        </span>
                        <Link
                          href="/alerts"
                          className="text-[13px] font-semibold text-accent-primary hover:underline"
                        >
                          View all →
                        </Link>
                      </div>
                      {openAlerts.length === 0 ? (
                        <div className="px-4 py-5">
                          <EmptyState title="All clear" description="No open alerts right now." />
                        </div>
                      ) : (
                        <ul className="divide-y divide-border-divider">
                          {openAlerts.map((a) => (
                            <li key={a.id}>
                              <Link
                                href={`/alerts/${a.id}`}
                                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-surface-hover"
                              >
                                <span className="min-w-0 truncate text-[12.5px] text-content">{a.message}</span>
                                <Badge
                                  tone={a.severity === 'HIGH' ? 'error' : a.severity === 'MEDIUM' ? 'warning' : 'neutral'}
                                >
                                  {a.severity}
                                </Badge>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ) : null}

                  {/* Pending approvals */}
                  {pendingApprovals.length > 0 ? (
                    <Card data-testid="dashboard-approvals" className="overflow-hidden p-0">
                      <Link
                        href="/approvals"
                        className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-fast hover:bg-surface-hover"
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-content-strong">
                          <ClipboardCheck className="h-4 w-4 text-accent-primary" aria-hidden />
                          Pending approvals
                        </span>
                        <Badge tone="warning">{pendingApprovals.length}</Badge>
                      </Link>
                    </Card>
                  ) : null}

                  <SetupChecklistCard />

                  {/* Recent activity */}
                  <Card className="overflow-hidden p-0">
                    <div className="border-b border-border-divider px-4 py-3.5 text-sm font-semibold text-content-strong">
                      Recent activity
                    </div>
                    {activityState === 'loading' ? (
                      <ul className="py-1.5">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <Skeleton className="h-3.5 w-40" />
                              <Skeleton className="h-2.5 w-16" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : activity.length === 0 ? (
                      <div data-testid="dashboard-activity-empty" className="px-4 py-6">
                        <EmptyState
                          title="No recent activity"
                          description="Activity across your organization will show up here as it happens."
                        />
                      </div>
                    ) : (
                      <ul data-testid="dashboard-activity-list" className="py-1.5">
                        {activity.map((a) => {
                          const who = a.userName?.trim() || 'System';
                          return (
                            <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                              <Avatar name={who} size="sm" />
                              <div className="min-w-0 text-[12.5px] leading-relaxed text-content">
                                <span className="font-semibold text-content-strong">{who}</span>{' '}
                                {activityVerb(a.action)}{' '}
                                <span className="text-accent-primary">{activityObject(a)}</span>
                                <div className="mt-0.5 text-[11px] tabular-nums text-content-muted">
                                  {relativeTime(a.createdAt)}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
