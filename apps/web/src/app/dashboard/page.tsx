'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  getDashboardSummary,
  logoutRequest,
  meRequest,
  type AuthUser,
  type DashboardSummaryRow,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

export default function DashboardPage() {
  return (
    <TerminologyProvider>
      <DashboardPageInner />
    </TerminologyProvider>
  );
}

function DashboardPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    Promise.all([meRequest(), getDashboardSummary().catch(() => [] as DashboardSummaryRow[])])
      .then(([meRes, summaryRows]) => {
        if (cancelled) return;
        setUser(meRes.user);
        setSummary(summaryRows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
        } else if (err instanceof ApiError) {
          setError(err.message);
          setLoading(false);
        } else {
          setError('Failed to load your dashboard.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await logoutRequest();
    router.push('/login');
  }

  const kpiLabelPlural = pluralize(terminology.kpiLabel);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
              KPI Nexus
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              <Link
                href="/dashboard"
                className="font-medium text-accent-primary"
                data-testid="nav-dashboard"
              >
                Dashboard
              </Link>
              <Link href="/kpis" className="text-content-muted hover:text-content-strong">
                {kpiLabelPlural}
              </Link>
              <Link href="/users" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.memberLabel)}
              </Link>
              <Link href="/org-units" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.groupLabel)}
              </Link>
              <Link href="/roles" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link href="/profile" className="text-content-muted hover:text-content-strong">
                Profile
              </Link>
              <Link href="/settings/organization" className="text-content-muted hover:text-content-strong">
                Settings
              </Link>
            </nav>
          </div>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-content-muted" data-testid="dashboard-user-email">
                {user.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                data-testid="dashboard-signout-button"
                className="rounded-md border border-border px-3 py-1.5 text-sm text-content-default transition hover:bg-surface-2"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {loading && (
          <p className="text-sm text-content-muted">Loading your dashboard…</p>
        )}
        {error && (
          <div
            role="alert"
            data-testid="dashboard-error"
            className="rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}
        {user && (
          <>
            <h1
              className="text-2xl font-semibold text-content-strong"
              data-testid="dashboard-heading"
            >
              Welcome back, {user.fullName.split(' ')[0]}.
            </h1>
            <p className="mt-1 text-sm text-content-muted">
              Latest values across {summary?.length ?? 0} {kpiLabelPlural.toLowerCase()}.
            </p>

            {summary !== null && summary.length === 0 && (
              <div
                data-testid="dashboard-empty"
                className="mt-8 rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center"
              >
                <p className="text-sm text-content-muted">
                  No {kpiLabelPlural.toLowerCase()} yet. Create your first one on{' '}
                  <Link
                    href="/kpis"
                    className="font-medium text-accent-primary underline"
                  >
                    /kpis
                  </Link>
                  .
                </p>
              </div>
            )}

            {summary !== null && summary.length > 0 && (
              <section
                className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                data-testid="dashboard-summary-grid"
              >
                {summary.map((row) => (
                  <KpiCard key={row.kpiId} row={row} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function KpiCard({ row }: { row: DashboardSummaryRow }) {
  // Color the latest value vs target if available
  let progressColor = 'text-content-strong';
  let progressLabel = '';
  if (row.targetValue !== null && row.latestValue !== null && row.targetValue !== 0) {
    const ratio = row.latestValue / row.targetValue;
    if (ratio >= 1) {
      progressColor = 'text-status-success';
      progressLabel = `${Math.round(ratio * 100)}% of target`;
    } else if (ratio >= 0.8) {
      progressColor = 'text-status-warning';
      progressLabel = `${Math.round(ratio * 100)}% of target`;
    } else {
      progressColor = 'text-status-critical';
      progressLabel = `${Math.round(ratio * 100)}% of target`;
    }
  }

  return (
    <article
      data-testid={`dashboard-card-${row.name}`}
      className="rounded-lg border border-border bg-surface-1 p-5"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-content-strong">
          {row.name}
        </h3>
        <ScopeBadge scope={row.scope} />
      </header>

      <div className="mt-4">
        {row.latestValue === null ? (
          <p
            className="text-sm text-content-muted"
            data-testid={`dashboard-card-empty-${row.name}`}
          >
            No values recorded yet.
          </p>
        ) : (
          <>
            <p
              className={`text-3xl font-bold tabular-nums ${progressColor}`}
              data-testid={`dashboard-card-value-${row.name}`}
            >
              {formatValue(row.latestValue, row.unit)}
            </p>
            {row.targetValue !== null && (
              <p className="mt-1 text-xs text-content-muted">
                Target: {formatValue(row.targetValue, row.unit)}
                {progressLabel ? ` · ${progressLabel}` : ''}
              </p>
            )}
            <p className="mt-1 text-xs text-content-muted">
              {row.pointCount} value{row.pointCount === 1 ? '' : 's'} recorded
            </p>
          </>
        )}
      </div>
    </article>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const cls =
    scope === 'ORG_WIDE'
      ? 'bg-accent-primary/10 text-accent-primary'
      : scope === 'PER_UNIT'
        ? 'bg-status-success/10 text-status-success'
        : 'bg-status-warning/10 text-status-warning';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {scope}
    </span>
  );
}

function formatValue(value: number, unit: string | null): string {
  const formatted =
    Math.abs(value) >= 1000
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : value.toString();
  return unit ? `${formatted} ${unit}` : formatted;
}
