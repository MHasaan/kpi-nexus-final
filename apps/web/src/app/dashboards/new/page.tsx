'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createDashboard,
  getAccessToken,
} from '../../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../../lib/terminology-context';

export default function NewDashboardPage() {
  return (
    <TerminologyProvider>
      <NewDashboardInner />
    </TerminologyProvider>
  );
}

function NewDashboardInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createDashboard({
        name: name.trim(),
        description: description.trim() || undefined,
        isShared,
      });
      router.push(`/dashboards/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to create dashboard',
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-content-strong hover:text-accent-primary"
          >
            KPI Nexus
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboards" className="text-content-muted hover:text-content-strong">
              {pluralize(terminology.dashboardLabel)}
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1
          className="text-2xl font-semibold text-content-strong"
          data-testid="dashboards-new-heading"
        >
          New {terminology.dashboardLabel.toLowerCase()}
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          A dashboard is your container for widgets. You can add widgets after
          creating it.
        </p>

        <form
          onSubmit={handleSubmit}
          data-testid="dashboards-new-form"
          className="mt-8 space-y-5 rounded-lg border border-border bg-surface-1 p-6"
        >
          <label className="block">
            <span className="text-sm font-medium text-content-default">Name</span>
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              data-testid="dashboards-new-name"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              placeholder="Executive overview"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-content-default">
              Description <span className="text-content-muted">(optional)</span>
            </span>
            <textarea
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              data-testid="dashboards-new-description"
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              placeholder="What this dashboard is for"
            />
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              disabled={submitting}
              data-testid="dashboards-new-shared"
              className="mt-1"
            />
            <span className="text-sm text-content-default">
              <span className="font-medium">Share with the organization</span>
              <br />
              <span className="text-content-muted">
                When enabled, all org members can view this dashboard. You can
                still change this later.
              </span>
            </span>
          </label>

          {error && (
            <p
              role="alert"
              data-testid="dashboards-new-error"
              className="text-sm text-status-critical"
            >
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              data-testid="dashboards-new-submit"
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create dashboard'}
            </button>
            <Link
              href="/dashboards"
              className="h-10 inline-flex items-center rounded-md border border-border px-4 text-sm text-content-default hover:bg-surface-2"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
