'use client';

import { useState, type FormEvent } from 'react';

import {
  ApiError,
  getDashboard,
  updateDashboard,
  type Dashboard,
} from '../../lib/api-client';

interface DashboardSettingsFormProps {
  dashboard: Dashboard;
  onSaved: (updated: Dashboard) => void;
  onClose: () => void;
}

interface ConflictState {
  mine: { name: string; description: string; isShared: boolean };
  theirs: Dashboard;
}

export function DashboardSettingsForm({
  dashboard,
  onSaved,
  onClose,
}: DashboardSettingsFormProps) {
  // `base` is the version this form started editing from. After a Discard,
  // it advances to the server's version so the next save uses a fresh ETag.
  const [baseVersion, setBaseVersion] = useState(dashboard.version);
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description ?? '');
  const [isShared, setIsShared] = useState(dashboard.isShared);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  function currentPatch() {
    return {
      name: name.trim(),
      description: description.trim(),
      isShared,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateDashboard(
        dashboard.id,
        currentPatch(),
        baseVersion,
      );
      setBaseVersion(updated.version);
      setSaved(true);
      onSaved(updated);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        // Concurrent edit: fetch the server's current state and open the
        // 3-way diff dialog.
        try {
          const theirs = await getDashboard(dashboard.id);
          setConflict({ mine: currentPatch(), theirs });
        } catch {
          setError('Conflict detected, but failed to load the latest version.');
        }
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Conflict resolution: force my values onto the server's current version.
  async function keepMine() {
    if (!conflict) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDashboard(
        dashboard.id,
        conflict.mine,
        conflict.theirs.version,
      );
      setBaseVersion(updated.version);
      setConflict(null);
      setSaved(true);
      onSaved(updated);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to overwrite.');
    } finally {
      setSaving(false);
    }
  }

  // Conflict resolution: abandon my edits and load their values into the form.
  function discardMine() {
    if (!conflict) return;
    const { theirs } = conflict;
    setName(theirs.name);
    setDescription(theirs.description ?? '');
    setIsShared(theirs.isShared);
    setBaseVersion(theirs.version);
    setConflict(null);
    onSaved(theirs);
  }

  // Conflict resolution: dismiss the dialog and keep editing my draft. The
  // next save will re-conflict until resolved, but the user stays in control.
  function keepEditing() {
    setConflict(null);
  }

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-surface-1 p-6"
      data-testid="dashboard-settings-form"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-content-strong">
          Dashboard settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          data-testid="dashboard-settings-close"
          className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-content-muted hover:bg-surface-2"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
        <label className="block">
          <span className="text-sm font-medium text-content-default">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            data-testid="dashboard-name-input"
            maxLength={120}
            className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-content-default">
            Description <span className="text-content-muted">(optional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            data-testid="dashboard-description-input"
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isShared}
            onChange={(e) => setIsShared(e.target.checked)}
            disabled={saving}
            data-testid="dashboard-shared-toggle"
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm text-content-default">
            Shared with the whole organization
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            data-testid="dashboard-settings-save"
            className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span
              role="status"
              data-testid="dashboard-settings-saved"
              className="text-sm text-status-success"
            >
              Saved.
            </span>
          )}
        </div>

        {error && (
          <p
            role="alert"
            data-testid="dashboard-settings-error"
            className="text-sm text-status-critical"
          >
            {error}
          </p>
        )}
      </form>

      {conflict && (
        <ConflictDialog
          mine={conflict.mine}
          theirs={conflict.theirs}
          busy={saving}
          onKeepMine={keepMine}
          onDiscardMine={discardMine}
          onKeepEditing={keepEditing}
        />
      )}
    </section>
  );
}

interface ConflictDialogProps {
  mine: { name: string; description: string; isShared: boolean };
  theirs: Dashboard;
  busy: boolean;
  onKeepMine: () => void;
  onDiscardMine: () => void;
  onKeepEditing: () => void;
}

function ConflictDialog({
  mine,
  theirs,
  busy,
  onKeepMine,
  onDiscardMine,
  onKeepEditing,
}: ConflictDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolve edit conflict"
      data-testid="dashboard-conflict-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-2xl rounded-lg border border-border bg-surface-1 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-content-strong">
          This dashboard was changed by someone else
        </h3>
        <p className="mt-1 text-sm text-content-muted">
          Your edits conflict with a newer version (v{theirs.version}). Choose
          how to resolve.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-accent-primary/40 bg-accent-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-primary">
              Your changes
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <DiffRow label="Name" testid="conflict-mine-name" value={mine.name} />
              <DiffRow
                label="Description"
                value={mine.description || '—'}
              />
              <DiffRow
                label="Shared"
                value={mine.isShared ? 'Yes' : 'No'}
              />
            </dl>
          </div>
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
              Their changes (current)
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <DiffRow
                label="Name"
                testid="conflict-theirs-name"
                value={theirs.name}
              />
              <DiffRow
                label="Description"
                value={theirs.description || '—'}
              />
              <DiffRow
                label="Shared"
                value={theirs.isShared ? 'Yes' : 'No'}
              />
            </dl>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onKeepEditing}
            disabled={busy}
            data-testid="conflict-keep-editing"
            className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2 disabled:opacity-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscardMine}
            disabled={busy}
            data-testid="conflict-discard-mine"
            className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2 disabled:opacity-50"
          >
            Discard mine
          </button>
          <button
            type="button"
            onClick={onKeepMine}
            disabled={busy}
            data-testid="conflict-keep-mine"
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Keep mine'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffRow({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid?: string;
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-content-muted">{label}</dt>
      <dd
        data-testid={testid}
        className="break-words font-medium text-content-strong"
      >
        {value}
      </dd>
    </div>
  );
}
