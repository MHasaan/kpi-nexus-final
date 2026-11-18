'use client';

import { RequirePermission } from '../../components/auth/require-permission';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Briefcase, Plus } from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import {
  ApiError,
  clearTokens,
  createPosition,
  deletePosition,
  updatePosition,
  getAccessToken,
  listPositions,
  type PositionSummary,
  type PositionTrack,
} from '../../lib/api-client';
import {
  pluralize,
  useTerminology,
} from '../../lib/terminology-context';
import { useConfirm } from '../../lib/use-confirm';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { inSentence } from '../../lib/sentence-case';

const TRACK_ORDER: Array<PositionTrack | 'OTHER'> = [
  'EXECUTIVE',
  'MANAGEMENT',
  'IC',
  'OTHER',
];
const TRACK_LABEL: Record<PositionTrack | 'OTHER', string> = {
  EXECUTIVE: 'Executive',
  MANAGEMENT: 'Management',
  IC: 'Individual contributor',
  OTHER: 'Other',
};

export default function PositionsPage() {
  // Positions are managed with POSITIONS_MANAGE — the sidebar link's key and the API's key for every change (UI-013).
  return (
    <RequirePermission permission="POSITIONS_MANAGE">
      <PositionsPageInner />
    </RequirePermission>
  );
}

function PositionsPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const confirm = useConfirm();
  const [positions, setPositions] = useState<PositionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create-position form state
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState<string>('1');
  const [newTrack, setNewTrack] = useState<PositionTrack | ''>('');
  const [newPayGrade, setNewPayGrade] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Editing one position in place
  const [editing, setEditing] = useState<{ id: string; name: string; level: string; track: PositionTrack | ''; payGrade: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const level = Number.parseInt(editing.level, 10);
    if (editing.name.trim().length < 2) {
      setEditError('Give the position a name of at least two characters.');
      return;
    }
    if (!Number.isFinite(level) || level < 0 || level > 100) {
      setEditError('A level is a whole number from 0 to 100.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updatePosition(editing.id, {
        name: editing.name.trim(),
        level,
        track: editing.track || null,
        payGrade: editing.payGrade.trim() || null,
      });
      setEditing(null);
      await refresh();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not save the position');
    } finally {
      setSavingEdit(false);
    }
  }

  // Per-row delete tracking
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
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
        router.replace(currentLoginRedirect());
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load positions');
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
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create position');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(position: PositionSummary) {
    const ok = await confirm({
      title: `Delete the position “${position.name}”?`,
      description: 'People who hold it are left without a position. This cannot be undone.',
      confirmLabel: 'Delete position',
      tone: 'danger',
      testId: 'position-delete-confirm',
    });
    if (!ok) return;
    setDeletingId(position.id);
    setDeleteError(null);
    try {
      await deletePosition(position.id);
      await refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : `Failed to delete ${position.name}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<PositionTrack | 'OTHER', PositionSummary[]>();
    for (const p of positions ?? []) {
      const key = (p.track ?? 'OTHER') as PositionTrack | 'OTHER';
      const bucket = map.get(key) ?? [];
      bucket.push(p);
      map.set(key, bucket);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => b.level - a.level);
    return map;
  }, [positions]);

  return (
    <AppShell title="Positions" crumbs={['People', 'Positions']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Positions"
          titleTestId="positions-heading"
          subtitle={
            <>
              Job positions used across the org structure. Positions are independent of{' '}
              {inSentence(pluralize(terminology.roleLabel))} — two people with the same
              position can have different permissions.
            </>
          }
          actions={
            <Button
              leftIcon={<Plus aria-hidden className="h-4 w-4" />}
              onClick={() => document.getElementById('position-name-input')?.focus()}
            >
              New position
            </Button>
          }
        />

        {loadError && (
          <div
            role="alert"
            data-testid="positions-load-error"
            className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}
        {deleteError && (
          <div
            role="alert"
            className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {deleteError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
          <Card data-testid="create-position-section" className="lg:sticky lg:top-2">
            <div className="border-b border-border-divider px-4 py-3.5">
              <h2 className="text-sm font-semibold text-content-strong">New position</h2>
              <p className="mt-1 text-xs text-content-muted">
                Level orders positions in the hierarchy (higher = more senior).
              </p>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="position-name-input" required>
                  Name
                </Label>
                <Input
                  id="position-name-input"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                  data-testid="position-name-input"
                  placeholder="Senior Engineer"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="position-track-select">Track</Label>
                  <Select
                    id="position-track-select"
                    value={newTrack}
                    onChange={(e) => setNewTrack(e.target.value as PositionTrack | '')}
                    disabled={creating}
                    data-testid="position-track-select"
                  >
                    <option value="">(none)</option>
                    <option value="IC">IC</option>
                    <option value="MANAGEMENT">Management</option>
                    <option value="EXECUTIVE">Executive</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="position-level-input" required>
                    Level
                  </Label>
                  <Input
                    id="position-level-input"
                    required
                    type="number"
                    min={0}
                    max={100}
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value)}
                    disabled={creating}
                    data-testid="position-level-input"
                    className="tabular-nums"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="position-paygrade-input">Pay grade</Label>
                <Input
                  id="position-paygrade-input"
                  value={newPayGrade}
                  onChange={(e) => setNewPayGrade(e.target.value)}
                  disabled={creating}
                  data-testid="position-paygrade-input"
                  placeholder="(optional)"
                />
              </div>
              <Button type="submit" isLoading={creating} data-testid="position-submit-button" className="w-full">
                {creating ? 'Creating…' : 'Add position'}
              </Button>
              {createError && (
                <p role="alert" data-testid="position-error" className="text-sm text-status-critical">
                  {createError}
                </p>
              )}
            </form>
          </Card>

          <section data-testid="positions-list-section">
            {positions === null && !loadError ? (
              <Card>
                <div className="flex flex-col gap-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </Card>
            ) : positions && positions.length === 0 ? (
              <Card data-testid="positions-empty">
                <EmptyState
                  icon={Briefcase}
                  title="No positions yet"
                  description="Create your first position with the form on the left."
                />
              </Card>
            ) : positions ? (
              <div className="flex flex-col gap-5" data-testid="positions-list">
                {editing && (
                  <Card className="p-4">
                    <form onSubmit={(e) => void saveEdit(e)} data-testid="position-edit-form" className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="position-edit-name" required>
                          Name
                        </Label>
                        <Input
                          id="position-edit-name"
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          disabled={savingEdit}
                          maxLength={60}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="position-edit-track">Track</Label>
                        <Select
                          id="position-edit-track"
                          value={editing.track}
                          onChange={(e) => setEditing({ ...editing, track: e.target.value as PositionTrack | '' })}
                          disabled={savingEdit}
                        >
                          <option value="">(none)</option>
                          <option value="IC">IC</option>
                          <option value="MANAGEMENT">Management</option>
                          <option value="EXECUTIVE">Executive</option>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="position-edit-level" required>
                          Level
                        </Label>
                        <Input
                          id="position-edit-level"
                          type="number"
                          min={0}
                          max={100}
                          value={editing.level}
                          onChange={(e) => setEditing({ ...editing, level: e.target.value })}
                          disabled={savingEdit}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="position-edit-paygrade">Pay grade</Label>
                        <Input
                          id="position-edit-paygrade"
                          value={editing.payGrade}
                          onChange={(e) => setEditing({ ...editing, payGrade: e.target.value })}
                          disabled={savingEdit}
                          maxLength={20}
                          placeholder="(none)"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" isLoading={savingEdit}>
                          Save
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={savingEdit}>
                          Cancel
                        </Button>
                      </div>
                      {editError && (
                        <p role="alert" data-testid="position-edit-error" className="text-sm text-status-critical sm:col-span-5">
                          {editError}
                        </p>
                      )}
                    </form>
                  </Card>
                )}
                {TRACK_ORDER.filter((t) => (grouped.get(t)?.length ?? 0) > 0).map((track) => (
                  <div key={track} data-testid={`positions-group-${track}`}>
                    <div className="kn-eyebrow mb-2">{TRACK_LABEL[track]}</div>
                    <Card className="overflow-hidden p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Position</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Pay grade</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(grouped.get(track) ?? []).map((position) => (
                            <TableRow
                              key={position.id}
                              data-testid={`position-row-${position.name}`}
                            >
                              <TableCell>
                                <span className="font-semibold">{position.name}</span>
                                {position.description && (
                                  <p className="mt-0.5 text-xs text-content-muted">
                                    {position.description}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  tone="neutral"
                                  className="font-mono tabular-nums"
                                  data-testid={`position-level-${position.name}`}
                                >
                                  L{position.level}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-content-muted">
                                {position.payGrade ?? '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditError(null);
                                    setEditing({
                                      id: position.id,
                                      name: position.name,
                                      level: String(position.level),
                                      track: position.track ?? '',
                                      payGrade: position.payGrade ?? '',
                                    });
                                  }}
                                  data-testid={`edit-position-${position.name}`}
                                  aria-label={`Edit ${position.name}`}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(position)}
                                  disabled={deletingId === position.id}
                                  data-testid={`delete-position-${position.name}`}
                                  className="text-status-critical hover:bg-status-critical/10"
                                  aria-label={`Delete ${position.name}`}
                                >
                                  {deletingId === position.id ? 'Deleting…' : 'Delete'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
