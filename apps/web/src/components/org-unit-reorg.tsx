'use client';

/**
 * OrgUnitReorg — compact reorganization panel rendered inside an expanded
 * org-unit row. Provides:
 *   - Rename (inline edit)
 *   - Merge into <other unit>
 *   - Split (new unit name + pick members to move)
 *   - Move selected members to another unit
 * Every action is gated by GROUPS_MANAGE.
 */

import { useState, type FormEvent } from 'react';

import { PermissionGuard } from './auth/permission-guard';
import {
  ApiError,
  getOrgUnitNameHistory,
  mergeOrgUnit,
  moveOrgUnitUsers,
  renameOrgUnit,
  splitOrgUnit,
  type OrgUnitMember,
  type OrgUnitNameHistoryEntry,
  type OrgUnitSummary,
} from '../lib/api-client';

interface Props {
  unit: OrgUnitSummary;
  /** All units in the org (for merge/move-to selects). */
  allUnits: OrgUnitSummary[];
  /** Active members of this unit (already loaded by the parent). */
  members: OrgUnitMember[];
  /** Called after any successful mutation so the parent can refresh. */
  onRefresh: () => Promise<void>;
}

export function OrgUnitReorg({ unit, allUnits, members, onRefresh }: Props) {
  const otherUnits = allUnits.filter((u) => u.id !== unit.id);
  const activeMembers = members.filter((m) => !m.leftAt);

  // ---- Rename ----
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(unit.name);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    setRenameLoading(true);
    setRenameError(null);
    try {
      await renameOrgUnit(unit.id, renameName.trim());
      setRenaming(false);
      await onRefresh();
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : 'Rename failed');
    } finally {
      setRenameLoading(false);
    }
  }

  // ---- Merge ----
  const [merging, setMerging] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  async function handleMerge(e: FormEvent) {
    e.preventDefault();
    if (!mergeTargetId) return;
    setMergeLoading(true);
    setMergeError(null);
    try {
      await mergeOrgUnit(unit.id, mergeTargetId);
      setMerging(false);
      await onRefresh();
    } catch (err) {
      setMergeError(err instanceof ApiError ? err.message : 'Merge failed');
    } finally {
      setMergeLoading(false);
    }
  }

  // ---- Split ----
  const [splitting, setSplitting] = useState(false);
  const [splitName, setSplitName] = useState('');
  const [splitMemberIds, setSplitMemberIds] = useState<Set<string>>(new Set());
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  function toggleSplitMember(userId: string) {
    setSplitMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSplit(e: FormEvent) {
    e.preventDefault();
    setSplitLoading(true);
    setSplitError(null);
    try {
      await splitOrgUnit(unit.id, {
        newUnitName: splitName.trim(),
        memberUserIds: [...splitMemberIds],
      });
      setSplitting(false);
      setSplitName('');
      setSplitMemberIds(new Set());
      await onRefresh();
    } catch (err) {
      setSplitError(err instanceof ApiError ? err.message : 'Split failed');
    } finally {
      setSplitLoading(false);
    }
  }

  // ---- Move members ----
  const [moving, setMoving] = useState(false);
  const [moveMemberIds, setMoveMemberIds] = useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  function toggleMoveMember(userId: string) {
    setMoveMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleMove(e: FormEvent) {
    e.preventDefault();
    if (!moveTargetId) return;
    setMoveLoading(true);
    setMoveError(null);
    try {
      await moveOrgUnitUsers({
        userIds: [...moveMemberIds],
        fromUnitId: unit.id,
        toUnitId: moveTargetId,
      });
      setMoving(false);
      setMoveMemberIds(new Set());
      setMoveTargetId('');
      await onRefresh();
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : 'Move failed');
    } finally {
      setMoveLoading(false);
    }
  }

  // ---- Name history ----
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<OrgUnitNameHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function handleShowHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await getOrgUnitNameHistory(unit.id);
      setHistory(data);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }

  const inputCls =
    'rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30';
  const btnCls =
    'rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-default transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50';
  const primaryBtnCls =
    'rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50';
  const errorCls = 'mt-1 text-xs text-status-critical';

  return (
    <div
      className="mt-4 rounded-md border border-border bg-surface-2 p-3"
      data-testid={`reorg-panel-${unit.name}`}
    >
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
        Reorganize
      </h5>

      {/* ---- Mutation controls (GROUPS_MANAGE only) ---- */}
      <PermissionGuard permission="GROUPS_MANAGE">
        <div className="flex flex-wrap gap-2">
          {/* Rename trigger */}
          <button
            type="button"
            onClick={() => { setRenaming((v) => !v); setRenameError(null); setRenameName(unit.name); }}
            data-testid={`reorg-rename-toggle-${unit.name}`}
            className={btnCls}
          >
            Rename
          </button>

          {/* Merge trigger */}
          {otherUnits.length > 0 && (
            <button
              type="button"
              onClick={() => { setMerging((v) => !v); setMergeError(null); }}
              data-testid={`reorg-merge-toggle-${unit.name}`}
              className={btnCls}
            >
              Merge into…
            </button>
          )}

          {/* Split trigger */}
          {activeMembers.length > 0 && (
            <button
              type="button"
              onClick={() => { setSplitting((v) => !v); setSplitError(null); setSplitName(''); setSplitMemberIds(new Set()); }}
              data-testid={`reorg-split-toggle-${unit.name}`}
              className={btnCls}
            >
              Split…
            </button>
          )}

          {/* Move members trigger */}
          {activeMembers.length > 0 && otherUnits.length > 0 && (
            <button
              type="button"
              onClick={() => { setMoving((v) => !v); setMoveError(null); setMoveMemberIds(new Set()); setMoveTargetId(''); }}
              data-testid={`reorg-move-toggle-${unit.name}`}
              className={btnCls}
            >
              Move members…
            </button>
          )}
        </div>

        {/* ---- Rename form ---- */}
        {renaming && (
          <form
            onSubmit={(e) => void handleRename(e)}
            className="mt-3 flex flex-wrap items-end gap-2"
            data-testid={`rename-form-${unit.name}`}
          >
            <label className="block">
              <span className="text-xs font-medium text-content-default">New name</span>
              <input
                required
                minLength={2}
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                disabled={renameLoading}
                data-testid={`rename-input-${unit.name}`}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <button type="submit" disabled={renameLoading} className={primaryBtnCls}>
              {renameLoading ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setRenaming(false)} className={btnCls}>
              Cancel
            </button>
            {renameError && <p role="alert" className={`w-full ${errorCls}`}>{renameError}</p>}
          </form>
        )}

        {/* ---- Merge form ---- */}
        {merging && (
          <form
            onSubmit={(e) => void handleMerge(e)}
            className="mt-3 flex flex-wrap items-end gap-2"
            data-testid={`merge-form-${unit.name}`}
          >
            <label className="block">
              <span className="text-xs font-medium text-content-default">Merge into</span>
              <select
                required
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                disabled={mergeLoading}
                data-testid={`merge-target-select-${unit.name}`}
                className={`mt-1 ${inputCls}`}
              >
                <option value="">(select target unit)</option>
                {otherUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={mergeLoading || !mergeTargetId} className={primaryBtnCls}>
              {mergeLoading ? 'Merging…' : 'Confirm merge'}
            </button>
            <button type="button" onClick={() => setMerging(false)} className={btnCls}>
              Cancel
            </button>
            {mergeError && <p role="alert" className={`w-full ${errorCls}`}>{mergeError}</p>}
          </form>
        )}

        {/* ---- Split form ---- */}
        {splitting && (
          <form
            onSubmit={(e) => void handleSplit(e)}
            className="mt-3"
            data-testid={`split-form-${unit.name}`}
          >
            <label className="block">
              <span className="text-xs font-medium text-content-default">New unit name</span>
              <input
                required
                minLength={2}
                value={splitName}
                onChange={(e) => setSplitName(e.target.value)}
                disabled={splitLoading}
                data-testid={`split-name-input-${unit.name}`}
                className={`mt-1 ${inputCls} w-full`}
              />
            </label>
            <p className="mt-2 text-xs font-medium text-content-default">
              Members to move to the new unit:
            </p>
            <ul className="mt-1 space-y-1">
              {activeMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    id={`split-member-${m.userId}`}
                    checked={splitMemberIds.has(m.userId)}
                    onChange={() => toggleSplitMember(m.userId)}
                    disabled={splitLoading}
                    data-testid={`split-member-check-${m.userId}`}
                    className="h-3 w-3"
                  />
                  <label htmlFor={`split-member-${m.userId}`} className="text-content-default">
                    {m.userId}
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={splitLoading} className={primaryBtnCls}>
                {splitLoading ? 'Splitting…' : 'Create split'}
              </button>
              <button type="button" onClick={() => setSplitting(false)} className={btnCls}>
                Cancel
              </button>
            </div>
            {splitError && <p role="alert" className={`mt-1 ${errorCls}`}>{splitError}</p>}
          </form>
        )}

        {/* ---- Move members form ---- */}
        {moving && (
          <form
            onSubmit={(e) => void handleMove(e)}
            className="mt-3"
            data-testid={`move-form-${unit.name}`}
          >
            <p className="text-xs font-medium text-content-default">Select members to move:</p>
            <ul className="mt-1 space-y-1">
              {activeMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    id={`move-member-${m.userId}`}
                    checked={moveMemberIds.has(m.userId)}
                    onChange={() => toggleMoveMember(m.userId)}
                    disabled={moveLoading}
                    data-testid={`move-member-check-${m.userId}`}
                    className="h-3 w-3"
                  />
                  <label htmlFor={`move-member-${m.userId}`} className="text-content-default">
                    {m.userId}
                  </label>
                </li>
              ))}
            </ul>
            <label className="mt-2 block">
              <span className="text-xs font-medium text-content-default">Move to (required)</span>
              <select
                required
                value={moveTargetId}
                onChange={(e) => setMoveTargetId(e.target.value)}
                disabled={moveLoading}
                data-testid={`move-target-select-${unit.name}`}
                className={`mt-1 ${inputCls} w-full`}
              >
                <option value="">(select destination unit)</option>
                {otherUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="submit"
                disabled={moveLoading || moveMemberIds.size === 0 || !moveTargetId}
                data-testid={`move-confirm-${unit.name}`}
                className={primaryBtnCls}
              >
                {moveLoading ? 'Moving…' : 'Move'}
              </button>
              <button type="button" onClick={() => setMoving(false)} className={btnCls}>
                Cancel
              </button>
            </div>
            {moveError && <p role="alert" className={`mt-1 ${errorCls}`}>{moveError}</p>}
          </form>
        )}
      </PermissionGuard>

      {/* ---- Name history (visible to any GROUPS_VIEW user) ---- */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => void handleShowHistory()}
          data-testid={`reorg-history-toggle-${unit.name}`}
          className={btnCls}
        >
          {showHistory ? 'Hide history' : 'Name history'}
        </button>
        {showHistory && (
          <div className="mt-3" data-testid={`name-history-${unit.name}`}>
            {historyLoading && <p className="text-xs text-content-muted">Loading history…</p>}
            {historyError && <p className={errorCls}>{historyError}</p>}
            {history && history.length === 0 && (
              <p className="text-xs text-content-muted">No renames recorded.</p>
            )}
            {history && history.length > 0 && (
              <ul className="space-y-1 text-xs text-content-default">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center gap-1">
                    <span className="line-through text-content-muted">{h.oldName}</span>
                    <span>→</span>
                    <span className="font-medium">{h.newName}</span>
                    <span className="ml-auto text-content-muted">
                      {new Date(h.changedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
