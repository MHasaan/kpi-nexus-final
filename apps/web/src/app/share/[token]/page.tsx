'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  getPublicDashboard,
  submitPublicDashboardPassword,
  type PublicDashboardPayload,
  type PublicKpiValue,
} from '../../../lib/api-client';

type PageState =
  | { kind: 'loading' }
  | { kind: 'password-required'; error?: string }
  | { kind: 'loaded'; payload: PublicDashboardPayload }
  | { kind: 'not-found' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

function statusColor(status: string | null): string {
  if (!status) return 'text-content-strong';
  const s = status.toUpperCase();
  if (s === 'CRITICAL' || s === 'RED') return 'text-status-critical';
  if (s === 'WARNING' || s === 'AMBER') return 'text-status-warning';
  if (s === 'OK' || s === 'GREEN') return 'text-status-success';
  return 'text-content-strong';
}

function KpiValueCard({ kv }: { kv: PublicKpiValue }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
        {kv.name}
      </p>
      {kv.latestValue !== null ? (
        <p className={`mt-1 text-2xl font-bold ${statusColor(kv.thresholdStatus)}`}>
          {kv.latestValue.toLocaleString()}
          {kv.unit && (
            <span className="ml-1 text-sm font-normal text-content-muted">{kv.unit}</span>
          )}
        </p>
      ) : (
        <p className="mt-1 text-sm text-content-muted">No data</p>
      )}
      {kv.latestRecordedAt && (
        <p className="mt-1 text-xs text-content-muted">
          {new Date(kv.latestRecordedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [passwordInput, setPasswordInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadDashboard();
  }, [token]);

  async function loadDashboard() {
    setState({ kind: 'loading' });
    try {
      const payload = await getPublicDashboard(token);
      setState({ kind: 'loaded', payload });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 && err.code === 'PASSWORD_REQUIRED') {
          setState({ kind: 'password-required' });
          return;
        }
        if (err.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (err.status === 410) {
          setState({ kind: 'expired' });
          return;
        }
        setState({ kind: 'error', message: err.message });
        return;
      }
      setState({ kind: 'error', message: 'Failed to load dashboard' });
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = await submitPublicDashboardPassword(token, passwordInput);
      setState({ kind: 'loaded', payload });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ kind: 'password-required', error: 'Incorrect password. Please try again.' });
      } else {
        setState({
          kind: 'password-required',
          error: err instanceof ApiError ? err.message : 'An error occurred',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Password prompt
  if (state.kind === 'password-required') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-content-strong">Protected Dashboard</h1>
            <p className="mt-1 text-sm text-content-muted">
              This dashboard requires a password to view.
            </p>
          </div>
          <form
            onSubmit={(e) => void handlePasswordSubmit(e)}
            className="rounded-lg border border-border bg-surface-1 p-6"
          >
            <label className="block">
              <span className="text-sm font-medium text-content-default">Password</span>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                disabled={submitting}
                data-testid="share-password-prompt"
                autoFocus
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </label>
            {state.error && (
              <p
                role="alert"
                data-testid="share-password-error"
                className="mt-2 text-sm text-status-critical"
              >
                {state.error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              data-testid="share-password-submit"
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent-primary text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Verifying…' : 'View dashboard'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Loading
  if (state.kind === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg">
        <p className="text-sm text-content-muted" data-testid="share-loading">
          Loading…
        </p>
      </main>
    );
  }

  // Not found
  if (state.kind === 'not-found') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6">
        <div className="text-center" data-testid="share-not-found">
          <h1 className="text-2xl font-semibold text-content-strong">Link Not Found</h1>
          <p className="mt-2 text-sm text-content-muted">
            This share link has been revoked or does not exist.
          </p>
        </div>
      </main>
    );
  }

  // Expired
  if (state.kind === 'expired') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6">
        <div className="text-center" data-testid="share-expired">
          <h1 className="text-2xl font-semibold text-content-strong">Link Expired</h1>
          <p className="mt-2 text-sm text-content-muted">
            This share link has expired. Please request a new one.
          </p>
        </div>
      </main>
    );
  }

  // Error
  if (state.kind === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6">
        <div className="text-center" data-testid="share-error">
          <h1 className="text-2xl font-semibold text-content-strong">Something went wrong</h1>
          <p className="mt-2 text-sm text-status-critical">{state.message}</p>
        </div>
      </main>
    );
  }

  // Loaded
  const { payload } = state;

  return (
    <main
      className="min-h-screen bg-surface-bg"
      data-testid="public-dashboard-viewer"
    >
      <header className="border-b border-border bg-surface-1 px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-semibold text-content-strong">
            {payload.dashboard.name}
          </h1>
          {payload.dashboard.description && (
            <p className="mt-0.5 text-sm text-content-muted">{payload.dashboard.description}</p>
          )}
          {payload.viewCount !== undefined && (
            <p className="mt-1 text-xs text-content-muted">
              {payload.viewCount} view{payload.viewCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {payload.kpiValues.length === 0 && payload.widgets.length === 0 ? (
          <p className="text-sm text-content-muted" data-testid="share-empty">
            No data to display.
          </p>
        ) : (
          <>
            {/* Render KPI values as simple cards */}
            {payload.kpiValues.length > 0 && (
              <section className="mb-8" data-testid="share-kpi-values">
                <h2 className="mb-4 text-lg font-semibold text-content-strong">KPI Overview</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {payload.kpiValues.map((kv) => (
                    <KpiValueCard key={kv.kpiId} kv={kv} />
                  ))}
                </div>
              </section>
            )}

            {/* Widget placeholders (read-only, no data fetching from public page) */}
            {payload.widgets.length > 0 && payload.kpiValues.length === 0 && (
              <section data-testid="share-widgets">
                <h2 className="mb-4 text-lg font-semibold text-content-strong">Widgets</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {payload.widgets.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-lg border border-border bg-surface-1 p-4"
                      data-testid={`share-widget-${w.id}`}
                    >
                      <p className="text-sm font-medium text-content-default">
                        {w.title ?? w.widgetType}
                      </p>
                      <p className="mt-1 text-xs text-content-muted capitalize">
                        {w.widgetType.replace(/_/g, ' ')}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-border bg-surface-1 px-6 py-4 text-center">
        <p className="text-xs text-content-muted">Powered by KPI Nexus</p>
      </footer>
    </main>
  );
}
