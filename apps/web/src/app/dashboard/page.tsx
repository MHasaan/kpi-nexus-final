'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import { OnboardingTour } from '../../components/onboarding-tour';
import { SetupChecklistCard } from '../../components/setup-checklist-card';
import { PermissionGuard } from '../../components/auth/permission-guard';
import {
  Avatar,
  Card,
  Delta,
  EmptyState,
  ScopeBadge,
  Segmented,
  Skeleton,
  StatTile,
  StatusBadge,
} from '../../components/ui';
import type { KpiScope, KpiStatus } from '../../components/ui';
import { Sparkline } from '../../components/charts';
import {
  ApiError,
  type AuthUser,
  type DashboardSummaryRow,
  type MyKpiRow,
  clearTokens,
  getAccessToken,
  getDashboardSummary,
  listMyKpis,
  meRequest,
} from '../../lib/api-client';
import { listActivity, type ActivityItem } from '../../lib/polish-client';

type LoadState = 'loading' | 'error' | 'ready';
type ActivityState = 'loading' | 'ready';
type RangeDays = '7' | '30' | '90';

const RANGE_OPTIONS: ReadonlyArray<{ value: RangeDays; label: string }> = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

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

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryRow[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [range, setRange] = useState<RangeDays>('30');
  const [rangeBusy, setRangeBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityState, setActivityState] = useState<ActivityState>('loading');
  const [myKpis, setMyKpis] = useState<MyKpiRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    Promise.all([meRequest(), getDashboardSummary(rangeWindow('30'))])
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
      .then((rows) => {
        if (cancelled) return;
        setMyKpis(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setMyKpis([]);
      });
    // Recent-activity rail loads independently — a failure here must not break
    // the dashboard, so it resolves to an empty (rendered as empty) feed.
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

  /** Switch the summary window and re-fetch the tiles + "KPIs to watch". */
  const changeRange = useCallback(
    (next: RangeDays) => {
      setRange(next);
      setRangeBusy(true);
      getDashboardSummary(rangeWindow(next))
        .then((rows) => setSummary(rows))
        .catch(() => {
          /* keep the prior window's data on a transient range fetch failure */
        })
        .finally(() => setRangeBusy(false));
    },
    [],
  );

  const now = new Date();
  const today = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const subtitle = `${today} · org health at a glance`;

  const watch = summary.slice(0, 5);
  const onTrack = summary.filter((r) => deriveStatus(r) === 'on-track').length;
  const atRisk = summary.filter((r) => deriveStatus(r) === 'at-risk').length;

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
            <p className="mt-1 text-sm text-content-muted">{subtitle}</p>
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
          <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.7fr_1fr]">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
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
                className="kn-stagger grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
              >
                <StatTile label="Total KPIs" value={summary.length} />
                <StatTile label="On track" value={onTrack} />
                <StatTile label="At risk" value={atRisk} />
                <StatTile label="Avg attainment" value={avgAttainment(summary)} />
              </div>

              {/* Two-column body: KPIs to watch + right rail */}
              <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.7fr_1fr] lg:items-start">
                {/* KPIs to watch */}
                <Card className="overflow-hidden p-0">
                  <div className="flex items-center justify-between border-b border-border-divider px-4 py-3.5">
                    <span className="text-sm font-semibold text-content-strong">KPIs to watch</span>
                    <Link
                      href="/kpis"
                      className="text-[13px] font-semibold text-accent-primary hover:underline"
                    >
                      View all →
                    </Link>
                  </div>
                  <ul>
                    {watch.map((row, i) => {
                      const status = deriveStatus(row);
                      const pct = attainmentPct(row);
                      return (
                        <li key={row.kpiId}>
                          <Link
                            href={`/kpis/${row.kpiId}`}
                            data-testid={`dashboard-card-${row.name}`}
                            className={[
                              'grid grid-cols-[1fr_auto_auto_auto] items-center gap-3.5 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover',
                              i ? 'border-t border-border-divider' : '',
                            ].join(' ')}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-[13.5px] font-semibold text-content-strong">
                                  {row.name}
                                </span>
                                <ScopeBadge scope={row.scope as KpiScope} />
                              </div>
                              {row.scorecardQuadrant ? (
                                <span className="text-[11.5px] text-content-muted">
                                  {row.scorecardQuadrant}
                                </span>
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
                              data-testid={`dashboard-card-value-${row.name}`}
                              className="min-w-[80px] text-right text-sm font-semibold tabular-nums text-content-strong"
                            >
                              {row.latestValue === null ? (
                                <span
                                  data-testid={`dashboard-card-empty-${row.name}`}
                                  className="text-content-muted"
                                >
                                  No data
                                </span>
                              ) : (
                                formatValue(row.latestValue, row.unit)
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              {pct !== null ? (
                                <Delta value={Math.round(pct - 100)} pct={Math.round(pct - 100)} />
                              ) : null}
                              <StatusBadge status={status} />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>

                {/* Right rail: my KPIs (if any) + setup checklist + recent activity */}
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
                  <SetupChecklistCard />
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
