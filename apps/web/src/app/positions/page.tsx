'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createPosition,
  deletePosition,
  getAccessToken,
  listPositions,
  type PositionSummary,
  type PositionTrack,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

export default function PositionsPage() {
  return (
    <TerminologyProvider>
      <PositionsPageInner />
    </TerminologyProvider>
  );
}

function PositionsPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [positions, setPositions] = useState<PositionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create-position form state
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState<string>('1');
  const [newTrack, setNewTrack] = useState<PositionTrack | ''>('');
  const [newPayGrade, setNewPayGrade] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Per-row delete tracking
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      const data = await listPositions();
      setPositions(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load positions',
      );
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const levelNum = Number.parseInt(newLevel, 10);
      await createPosition({
        name: newName.trim(),
        level: Number.isFinite(levelNum) ? levelNum : 1,
        // Backend zod schema treats these as optional (not nullable) — send
        // undefined when blank, not null
        track: newTrack || undefined,
        payGrade: newPayGrade.trim() || undefined,
      });
      setNewName('');
      setNewLevel('1');
      setNewTrack('');
      setNewPayGrade('');
      await refresh();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Failed to create position',
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(position: PositionSummary) {
    setDeletingId(position.id);
    setDeleteError(null);
    try {
      await deletePosition(position.id);
      await refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : `Failed to delete ${position.name}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-content-muted hover:text-content-strong">
                Dashboard
              </Link>
              <Link href="/users" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.memberLabel)}
              </Link>
              <Link href="/roles" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link
                href="/positions"
                className="font-medium text-accent-primary"
                data-testid="nav-positions"
              >
                Positions
              </Link>
              <Link
                href="/settings/organization"
                className="text-content-muted hover:text-content-strong"
              >
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1
            className="text-2xl font-semibold text-content-strong"
            data-testid="positions-heading"
          >
            Positions
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Job titles in the organization. Used by performance reviews,
            compensation bands, and KPI assignments later. Positions are
            independent of {pluralize(terminology.roleLabel.toLowerCase())} —
            two people with the same position can have different permissions.
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="positions-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <section
          className="mb-8 rounded-lg border border-border bg-surface-1 p-6"
          data-testid="create-position-section"
        >
          <h2 className="text-lg font-semibold text-content-strong">
            Create a position
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            Level orders positions in the hierarchy (higher = more senior).
          </p>
          <form
            onSubmit={handleCreate}
            className="mt-4 grid gap-4 sm:grid-cols-[1.5fr_0.5fr_1fr_1fr_auto] sm:items-end"
          >
            <label className="block">
              <span className="text-sm font-medium text-content-default">Name</span>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                data-testid="position-name-input"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="Senior Engineer"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Level</span>
              <input
                required
                type="number"
                min={0}
                max={100}
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value)}
                disabled={creating}
                data-testid="position-level-input"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Track</span>
              <select
                value={newTrack}
                onChange={(e) => setNewTrack(e.target.value as PositionTrack | '')}
                disabled={creating}
                data-testid="position-track-select"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              >
                <option value="">(none)</option>
                <option value="IC">IC</option>
                <option value="MANAGEMENT">Management</option>
                <option value="EXECUTIVE">Executive</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Pay grade</span>
              <input
                value={newPayGrade}
                onChange={(e) => setNewPayGrade(e.target.value)}
                disabled={creating}
                data-testid="position-paygrade-input"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="(optional)"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              data-testid="position-submit-button"
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
          {createError && (
            <p
              role="alert"
              data-testid="position-error"
              className="mt-3 text-sm text-status-critical"
            >
              {createError}
            </p>
          )}
        </section>

        {deleteError && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {deleteError}
          </div>
        )}

        <section data-testid="positions-list-section">
          {positions === null && !loadError && (
            <p className="text-sm text-content-muted">Loading positions…</p>
          )}
          {positions && positions.length === 0 && (
            <p className="text-sm text-content-muted">No positions yet.</p>
          )}
          {positions && positions.length > 0 && (
            <ul className="space-y-3" data-testid="positions-list">
              {positions.map((position) => (
                <li
                  key={position.id}
                  className="rounded-lg border border-border bg-surface-1 p-4"
                  data-testid={`position-row-${position.name}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-content-strong">
                        {position.name}
                        <span
                          className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-content-default"
                          data-testid={`position-level-${position.name}`}
                        >
                          L{position.level}
                        </span>
                        {position.track && (
                          <span className="ml-1.5 rounded bg-accent-primary/10 px-1.5 py-0.5 text-xs font-medium text-accent-primary">
                            {position.track}
                          </span>
                        )}
                      </h3>
                      {position.payGrade && (
                        <p className="mt-1 text-sm text-content-muted">
                          Pay grade: {position.payGrade}
                        </p>
                      )}
                      {position.description && (
                        <p className="mt-1 text-sm text-content-muted">
                          {position.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(position)}
                      disabled={deletingId === position.id}
                      data-testid={`delete-position-${position.name}`}
                      className="rounded-md border border-border px-3 py-1.5 text-sm text-status-critical transition hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${position.name}`}
                    >
                      {deletingId === position.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
