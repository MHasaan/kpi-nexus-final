'use client';

import { Eye } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { BarChart } from '../../../components/charts';

import {
  ApiError,
  getPublicDashboard,
  submitPublicDashboardPassword,
  type PublicDashboardPayload,
  type PublicKpiValue,
  type PublicWidget,
} from '../../../lib/api-client';

type PageState =
  | { kind: 'loading' }
  | { kind: 'password-required'; error?: string }
  | { kind: 'loaded'; payload: PublicDashboardPayload }
  | { kind: 'not-found' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

/**
 * Resolve the captured KPI value a widget points at, if any.
 *
 * The public payload carries `kpiValues` as an object map keyed by `kpiId`
 * (`Record<string, { latestValue, latestRecordedAt }>`). A widget's `config`
 * may hold `{ kpiId }` (see the dashboard add-widget form); we look the
 * captured value up directly. Returns `null` when the widget has no kpiId or
 * no captured value exists for it.
 */
function resolveWidgetValue(
  widget: PublicWidget,
  kpiValues: Record<string, PublicKpiValue>,
): PublicKpiValue | null {
  const kpiId = widget.config?.['kpiId'];
  if (typeof kpiId !== 'string') return null;
  return kpiValues[kpiId] ?? null;
}

/** Derive a human label for a widget from its title/config (no per-KPI name in payload). */
function widgetLabel(widget: PublicWidget): string {
  if (widget.title) return widget.title;
  const cfgLabel = widget.config?.['label'] ?? widget.config?.['kpiName'];
  if (typeof cfgLabel === 'string' && cfgLabel.length > 0) return cfgLabel;
  return widget.widgetType.replace(/_/g, ' ');
}

function ShareWidgetCard({
  widget,
  kpiValues,
}: {
  widget: PublicWidget;
  kpiValues: Record<string, PublicKpiValue>;
}) {
  const kv = resolveWidgetValue(widget, kpiValues);
  const value = kv?.latestValue ?? null;
  const typeLabel = widget.widgetType.replace(/_/g, ' ');
  const label = widgetLabel(widget);

  return (
    <div
      className="rounded-lg border border-border bg-surface-1 p-4"
      data-testid={`share-widget-${widget.id}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-content-default">{label}</p>
        <p className="text-xs text-content-muted capitalize">{typeLabel}</p>
      </div>

      {value !== null ? (
        <>
          {/* A single captured value: render a number for most types, and a
              minimal single-bar visual for bar/line/trend types. */}
          {widget.widgetType === 'bar' ||
          widget.widgetType === 'line' ||
          widget.widgetType === 'trend' ? (
            <div className="mt-3">
              <BarChart
                data={[{ label, value }]}
                width={240}
                height={64}
                aria-label={`${label}: ${value}`}
              />
            </div>
          ) : null}
          <p className="mt-2 text-2xl font-bold tabular-nums text-content-strong">
            {value.toLocaleString()}
          </p>
          {kv?.latestRecordedAt && (
            <p className="mt-1 text-xs text-content-muted">
              {new Date(kv.latestRecordedAt).toLocaleDateString()}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-content-muted">No data</p>
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
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold text-content-strong">
              {payload.dashboard.name}
            </h1>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-bg px-2 py-0.5 text-xs font-medium text-content-muted"
              data-testid="share-readonly-badge"
            >
              <Eye aria-hidden className="h-3 w-3" />
              Shared · read-only
            </span>
          </div>
          {payload.dashboard.description && (
            <p className="mt-0.5 text-sm text-content-muted">{payload.dashboard.description}</p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {payload.widgets.length === 0 ? (
          <p className="text-sm text-content-muted" data-testid="share-empty">
            No data to display.
          </p>
        ) : (
          /* Widgets (read-only). Each widget shows a minimal visual built from
             its captured KPI value, looked up from the `kpiValues` object map. */
          <section data-testid="share-widgets">
            <h2 className="mb-4 text-lg font-semibold text-content-strong">Widgets</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {payload.widgets.map((w) => (
                <ShareWidgetCard key={w.id} widget={w} kpiValues={payload.kpiValues} />
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="border-t border-border bg-surface-1 px-6 py-4 text-center">
        <p className="text-xs text-content-muted">Powered by KPI Nexus</p>
      </footer>
    </main>
  );
}
