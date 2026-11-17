'use client';

import { Eye } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';

import { BarChartWidget } from '../../../components/widgets/BarChartWidget';
import { GaugeWidget } from '../../../components/widgets/GaugeWidget';
import { KpiCard } from '../../../components/widgets/KpiCard';
import { LineChartWidget } from '../../../components/widgets/LineChartWidget';
import { ListWidget } from '../../../components/widgets/ListWidget';
import { NumberWidget } from '../../../components/widgets/NumberWidget';
import { PieChartWidget } from '../../../components/widgets/PieChartWidget';
import { StrategyMapWidget } from '../../../components/widgets/StrategyMapWidget';
import { tallyFromCounts } from '../../../components/widgets/strategy-map';
import { TrendWidget } from '../../../components/widgets/TrendWidget';
import {
  ApiError,
  getPublicDashboard,
  submitPublicDashboardPassword,
  type PublicDashboardPayload,
  type PublicWidget,
} from '../../../lib/api-client';
import { WIDGET_TYPE_LABELS, labelFor } from '../../../lib/labels';
import { readingOrder, shareCell, shareKpi, shareWidget } from '../../../lib/share-view';

type PageState =
  | { kind: 'loading' }
  | { kind: 'password-required'; error?: string }
  | { kind: 'loaded'; payload: PublicDashboardPayload }
  | { kind: 'not-found' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

/** A human label for a widget when it has no title of its own. */
function widgetLabel(widget: PublicWidget, kpiName: string | undefined): string {
  return widget.title ?? kpiName ?? labelFor(WIDGET_TYPE_LABELS, widget.widgetType);
}

function Note({ id, title, children }: { id: string; title: string; children: string }) {
  return (
    <div className="flex h-full flex-col p-4" data-testid={`widget-render-${id}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">{title}</p>
      <div className="flex flex-1 items-center justify-center text-center">
        <p className="text-sm text-content-muted">{children}</p>
      </div>
    </div>
  );
}

/**
 * One widget, drawn by the same component the signed-in dashboard uses, from
 * what the link is allowed to carry. A widget whose data was withheld says so
 * instead of drawing an empty chart that looks like "no data yet".
 */
function ShareWidget({ widget, payload }: { widget: PublicWidget; payload: PublicDashboardPayload }) {
  const shaped = shareWidget(widget);
  const view = shareKpi(widget, payload);
  const title = widgetLabel(widget, view?.name);
  if (!shaped) return <Note id={widget.id} title={title}>This kind of widget cannot be shown on a shared link.</Note>;
  const titled = { ...shaped, title };

  switch (shaped.widgetType) {
    case 'activity':
      return <Note id={widget.id} title={title}>Activity names people, so it is not shown on a shared link.</Note>;
    case 'list':
      return <ListWidget widget={titled} summaryRows={payload.listRows ?? []} />;
    case 'strategy_map':
      return <StrategyMapWidget widget={titled} tally={tallyFromCounts(payload.perspectives ?? [])} linked={false} />;
    default:
      break;
  }

  if (!view) {
    // No KPI chosen, a KPI the link's creator may not share, or an older API: fall back to the bare value.
    const kpiId = widget.config?.['kpiId'];
    const captured = typeof kpiId === 'string' ? payload.kpiValues[kpiId] : undefined;
    if (captured?.latestValue === null || captured?.latestValue === undefined) {
      return <Note id={widget.id} title={title}>{typeof kpiId === 'string' ? 'This KPI is not shared on this link.' : 'No KPI chosen for this widget.'}</Note>;
    }
    return (
      <div className="flex h-full flex-col p-4" data-testid={`widget-render-${widget.id}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-content-muted">{title}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-content-strong">{captured.latestValue.toLocaleString()}</p>
      </div>
    );
  }
  if (view.series.length === 0 && view.status === null) {
    return <Note id={widget.id} title={title}>This KPI is recorded per team or per person, so its values are not shown on a shared link.</Note>;
  }

  const points = view.series;
  switch (shaped.widgetType) {
    case 'kpi_card':
      return <KpiCard widget={titled} kpi={view} dataPoints={points} status={view.status} />;
    case 'line':
      return <LineChartWidget widget={titled} dataPoints={points} />;
    case 'bar':
      return <BarChartWidget widget={titled} dataPoints={points} />;
    case 'pie':
      return <PieChartWidget widget={titled} kpi={view} dataPoints={points} />;
    case 'gauge':
      return <GaugeWidget widget={titled} kpi={view} dataPoints={points} />;
    case 'number':
      return <NumberWidget widget={titled} kpi={view} dataPoints={points} />;
    case 'trend':
      return <TrendWidget widget={titled} dataPoints={points} />;
  }
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
          /* The board as its author laid it out: a 12-column grid from tablet
             width up, one widget per row on a phone. */
          <section data-testid="share-widgets" className="grid gap-3 md:auto-rows-[80px] md:grid-cols-12">
            {readingOrder(payload.widgets).map((w) => {
              const cell = shareCell(w.position);
              return (
                <div
                  key={w.id}
                  data-testid={`share-widget-${w.id}`}
                  className="min-h-[240px] overflow-hidden rounded-lg border border-border bg-surface-1 md:min-h-0 md:[grid-column:var(--share-col)] md:[grid-row:var(--share-row)]"
                  style={{ '--share-col': cell?.column ?? 'span 6', '--share-row': cell?.row ?? 'span 3' } as CSSProperties}
                >
                  <ShareWidget widget={w} payload={payload} />
                </div>
              );
            })}
          </section>
        )}
      </div>

      <footer className="border-t border-border bg-surface-1 px-6 py-4 text-center">
        <p className="text-xs text-content-muted">Powered by KPI Nexus</p>
      </footer>
    </main>
  );
}
