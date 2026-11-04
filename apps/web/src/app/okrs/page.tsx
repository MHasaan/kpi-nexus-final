'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Pencil, Trash2, X } from 'lucide-react';

import { ApiError, type UserSummary, getAccessToken, listUsers, meRequest } from '../../lib/api-client';
import {
  type Objective,
  type ObjectiveStatus,
  createObjective,
  deleteObjective,
  listObjectives,
  updateObjective,
} from '../../lib/collab-client';
import { cn } from '../../lib/cn';
import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import {
  PageHeader,
  Card,
  CardContent,
  Input,
  Textarea,
  Select,
  Label,
  Button,
  Badge,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from '../../components/ui';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { buildAlignmentTree } from '../../lib/okr-tree';

const STATUSES: ObjectiveStatus[] = ['DRAFT', 'ACTIVE', 'AT_RISK', 'ACHIEVED', 'MISSED', 'ARCHIVED'];

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'info',
  AT_RISK: 'warning',
  ACHIEVED: 'success',
  MISSED: 'error',
  ARCHIVED: 'neutral',
};

function barColor(status: string): string {
  if (status === 'AT_RISK') return 'bg-status-warning';
  if (status === 'ACHIEVED') return 'bg-status-success';
  if (status === 'MISSED') return 'bg-status-critical';
  return 'bg-accent-primary';
}

/** First/last day of the quarter containing `now`, as YYYY-MM-DD (computed, never hardcoded). */
function currentQuarterRange(now = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3); // 0..3
  const startMonth = q * 3; // 0,3,6,9
  const start = new Date(y, startMonth, 1);
  const end = new Date(y, startMonth + 3, 0); // day 0 of next quarter = last day of this one
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

/** "Apr 1 – Jun 30, 2026" (or includes both years when they differ). */
function formatPeriod(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (start.getFullYear() === end.getFullYear()) {
    return `${md(start)} – ${md(end)}, ${end.getFullYear()}`;
  }
  return `${md(start)}, ${start.getFullYear()} – ${md(end)}, ${end.getFullYear()}`;
}

interface EditState {
  name: string;
  description: string;
  ownerUserId: string;
  periodStart: string;
  periodEnd: string;
  status: ObjectiveStatus;
  parentObjectiveId: string;
}

export default function OkrsPage() {
  const router = useRouter();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  // Filters
  const [filterStatus, setFilterStatus] = useState<'ALL' | ObjectiveStatus>('ALL');
  const [filterOwner, setFilterOwner] = useState<'ALL' | string>('ALL');

  // Create form
  const quarter = useMemo(() => currentQuarterRange(), []);
  const [cName, setCName] = useState('');
  const [cDescription, setCDescription] = useState('');
  const [cOwner, setCOwner] = useState('');
  const [cPeriodStart, setCPeriodStart] = useState(quarter.start);
  const [cPeriodEnd, setCPeriodEnd] = useState(quarter.end);
  const [cStatus, setCStatus] = useState<ObjectiveStatus>('DRAFT');
  const [cParent, setCParent] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit / delete
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [objs, us] = await Promise.all([listObjectives(), listUsers().catch(() => [] as UserSummary[])]);
      setObjectives(objs);
      setUsers(us);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load objectives');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    meRequest()
      .then((r) => {
        setCurrentUserId(r.user.id);
        setCOwner((prev) => prev || r.user.id);
      })
      .catch(() => undefined);
    void load();
  }, [load, router]);

  const ownerName = useCallback(
    (id: string): string => users.find((u) => u.id === id)?.fullName ?? '—',
    [users],
  );

  const filtering = filterStatus !== 'ALL' || filterOwner !== 'ALL';

  const filtered = useMemo(
    () =>
      objectives.filter(
        (o) =>
          (filterStatus === 'ALL' || o.status === filterStatus) &&
          (filterOwner === 'ALL' || o.ownerUserId === filterOwner),
      ),
    [objectives, filterStatus, filterOwner],
  );

  // Alignment tree: top-level = no parent OR parent not in the visible set;
  // objectives caught in a parent cycle are promoted to roots (FE-003).
  const tree = useMemo(() => buildAlignmentTree(objectives), [objectives]);

  const resetCreate = () => {
    setCName('');
    setCDescription('');
    setCOwner(currentUserId);
    setCPeriodStart(quarter.start);
    setCPeriodEnd(quarter.end);
    setCStatus('DRAFT');
    setCParent('');
  };

  const create = async () => {
    if (!cName.trim()) return;
    setCreating(true);
    try {
      let owner = cOwner;
      if (!owner) {
        owner = currentUserId || (await meRequest()).user.id;
      }
      await createObjective({
        name: cName.trim(),
        description: cDescription.trim() || undefined,
        ownerUserId: owner,
        parentObjectiveId: cParent || undefined,
        periodStart: cPeriodStart,
        periodEnd: cPeriodEnd,
        status: cStatus,
      });
      resetCreate();
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create objective');
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (o: Objective) => {
    setConfirmingDelete(null);
    setEditingId(o.id);
    setEditState({
      name: o.name,
      description: o.description ?? '',
      ownerUserId: o.ownerUserId,
      periodStart: o.periodStart.slice(0, 10),
      periodEnd: o.periodEnd.slice(0, 10),
      status: o.status,
      parentObjectiveId: o.parentObjectiveId ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEdit = async (id: string) => {
    if (!editState || !editState.name.trim()) return;
    setSavingEdit(true);
    try {
      await updateObjective(id, {
        name: editState.name.trim(),
        description: editState.description.trim() || null,
        ownerUserId: editState.ownerUserId,
        parentObjectiveId: editState.parentObjectiveId || null,
        periodStart: editState.periodStart,
        periodEnd: editState.periodEnd,
        status: editState.status,
      });
      cancelEdit();
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update objective');
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteObjective(id);
      setConfirmingDelete(null);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete objective');
    } finally {
      setDeletingId(null);
    }
  };

  const ownerOptions = users.map((u) => (
    <option key={u.id} value={u.id}>
      {u.fullName}
    </option>
  ));

  function objectiveRow(o: Objective, depth: number) {
    const pct = Math.round(o.progress * 100);
    const isEditing = editingId === o.id;

    if (isEditing && editState) {
      return (
        <Card key={o.id} data-testid={`okr-row-${o.id}`} className="border-accent-primary/40">
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`edit-name-${o.id}`} required>
                  Name
                </Label>
                <Input
                  id={`edit-name-${o.id}`}
                  data-testid={`okr-edit-${o.id}`}
                  value={editState.name}
                  onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`edit-desc-${o.id}`}>Description</Label>
                <Textarea
                  id={`edit-desc-${o.id}`}
                  rows={2}
                  value={editState.description}
                  onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`edit-owner-${o.id}`}>Owner</Label>
                <Select
                  id={`edit-owner-${o.id}`}
                  value={editState.ownerUserId}
                  onChange={(e) => setEditState({ ...editState, ownerUserId: e.target.value })}
                  className="mt-1"
                >
                  {ownerOptions}
                </Select>
              </div>
              <div>
                <Label htmlFor={`edit-status-${o.id}`}>Status</Label>
                <Select
                  id={`edit-status-${o.id}`}
                  value={editState.status}
                  onChange={(e) => setEditState({ ...editState, status: e.target.value as ObjectiveStatus })}
                  className="mt-1"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`edit-start-${o.id}`}>Period start</Label>
                <Input
                  id={`edit-start-${o.id}`}
                  type="date"
                  value={editState.periodStart}
                  onChange={(e) => setEditState({ ...editState, periodStart: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`edit-end-${o.id}`}>Period end</Label>
                <Input
                  id={`edit-end-${o.id}`}
                  type="date"
                  value={editState.periodEnd}
                  onChange={(e) => setEditState({ ...editState, periodEnd: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`edit-parent-${o.id}`}>Parent objective</Label>
                <Select
                  id={`edit-parent-${o.id}`}
                  value={editState.parentObjectiveId}
                  onChange={(e) => setEditState({ ...editState, parentObjectiveId: e.target.value })}
                  className="mt-1"
                >
                  <option value="">None</option>
                  {objectives
                    .filter((p) => p.id !== o.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                data-testid={`okr-edit-save-${o.id}`}
                onClick={() => void saveEdit(o.id)}
                isLoading={savingEdit}
                disabled={savingEdit || !editState.name.trim()}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={savingEdit}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card
        key={o.id}
        data-testid={`okr-row-${o.id}`}
        className={cn('kn-card-hover', depth > 0 && 'border-l-2 border-l-border')}
        style={depth > 0 ? { marginLeft: depth * 20 } : undefined}
      >
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <Flag className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <Link
                href={`/okrs/${o.id}`}
                data-testid={`objective-${o.id}`}
                className="block truncate text-sm font-semibold leading-snug text-content-strong hover:text-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {o.name}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-content-muted">
                <span>{ownerName(o.ownerUserId)}</span>
                <span aria-hidden>·</span>
                <span>{formatPeriod(o.periodStart, o.periodEnd)}</span>
              </div>
            </div>
            <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-content-muted">Progress</span>
              <span className="text-lg font-bold tabular-nums text-content-strong">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full ${barColor(o.status)}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PermissionGuard permission="KPI_CREATE">
              <Button
                size="sm"
                variant="ghost"
                data-testid={`okr-edit-trigger-${o.id}`}
                onClick={() => beginEdit(o)}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden /> Edit
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="KPI_DELETE">
              {confirmingDelete === o.id ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs text-content-muted">Delete?</span>
                  <Button
                    size="sm"
                    variant="danger"
                    data-testid={`okr-delete-${o.id}`}
                    onClick={() => void remove(o.id)}
                    isLoading={deletingId === o.id}
                    disabled={deletingId === o.id}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingDelete(null)}
                    disabled={deletingId === o.id}
                    aria-label="Cancel delete"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid={`okr-delete-trigger-${o.id}`}
                  onClick={() => setConfirmingDelete(o.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Delete
                </Button>
              )}
            </PermissionGuard>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderTree(o: Objective, depth: number): React.ReactNode {
    const children = tree.childrenOf.get(o.id) ?? [];
    return (
      <div key={o.id} className="space-y-3">
        {objectiveRow(o, depth)}
        {children.length > 0 && <div className="space-y-3">{children.map((c) => renderTree(c, depth + 1))}</div>}
      </div>
    );
  }

  return (
    <AppShell title="Objectives" crumbs={[{ label: 'OKRs' }]}>
      <PageHeader
        title="Objectives"
        subtitle="Goals that frame your KPIs — progress rolls up from key results"
      />

      <PermissionGuard permission="KPI_CREATE">
        <Card className="mb-6">
          <CardContent className="space-y-3">
            <h2 className="text-sm font-semibold text-content-strong">New objective</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="create-name" required>
                  Name
                </Label>
                <Input
                  id="create-name"
                  data-testid="okr-create-name"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="e.g. Grow ARR to $5M"
                  className="mt-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && cName.trim()) void create();
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="create-desc">Description</Label>
                <Textarea
                  id="create-desc"
                  rows={2}
                  value={cDescription}
                  onChange={(e) => setCDescription(e.target.value)}
                  placeholder="What does success look like?"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="create-owner">Owner</Label>
                <Select
                  id="create-owner"
                  data-testid="okr-create-owner"
                  value={cOwner}
                  onChange={(e) => setCOwner(e.target.value)}
                  className="mt-1"
                >
                  {cOwner === '' && <option value="">Select owner…</option>}
                  {ownerOptions}
                </Select>
              </div>
              <div>
                <Label htmlFor="create-status">Status</Label>
                <Select
                  id="create-status"
                  data-testid="okr-create-status"
                  value={cStatus}
                  onChange={(e) => setCStatus(e.target.value as ObjectiveStatus)}
                  className="mt-1"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="create-start">Period start</Label>
                <Input
                  id="create-start"
                  type="date"
                  data-testid="okr-create-period-start"
                  value={cPeriodStart}
                  onChange={(e) => setCPeriodStart(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="create-end">Period end</Label>
                <Input
                  id="create-end"
                  type="date"
                  data-testid="okr-create-period-end"
                  value={cPeriodEnd}
                  onChange={(e) => setCPeriodEnd(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="create-parent">Parent objective</Label>
                <Select
                  id="create-parent"
                  data-testid="okr-create-parent"
                  value={cParent}
                  onChange={(e) => setCParent(e.target.value)}
                  className="mt-1"
                >
                  <option value="">None</option>
                  {objectives.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                data-testid="okr-create-submit"
                onClick={create}
                isLoading={creating}
                disabled={creating || !cName.trim()}
              >
                {creating ? 'Creating…' : 'Create objective'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </PermissionGuard>

      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="okrs-error"
        >
          {error}
        </p>
      )}

      {/* Filters */}
      {!loading && objectives.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="okr-filter-status">Status</Label>
            <Select
              id="okr-filter-status"
              data-testid="okr-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'ALL' | ObjectiveStatus)}
              className="mt-1 w-40"
            >
              <option value="ALL">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="okr-filter-owner">Owner</Label>
            <Select
              id="okr-filter-owner"
              data-testid="okr-filter-owner"
              value={filterOwner}
              onChange={(e) => setFilterOwner(e.target.value)}
              className="mt-1 w-48"
            >
              <option value="ALL">All owners</option>
              {ownerOptions}
            </Select>
          </div>
          <span className="pb-2 text-sm text-content-muted" data-testid="okr-result-count">
            {filtered.length} of {objectives.length}
          </span>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : objectives.length === 0 ? (
        <EmptyState
          icon={Flag}
          data-testid="okrs-empty"
          title="No objectives yet"
          description="Create your first objective to start framing KPIs into measurable goals."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Flag}
          data-testid="okrs-no-matches"
          title="No matching objectives"
          description="No objectives match the current filters. Try clearing the status or owner filter."
        />
      ) : filtering ? (
        // When filtering, flatten to the matching objectives.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="objective-grid">
          {filtered.map((o) => objectiveRow(o, 0))}
        </div>
      ) : (
        // No filter: render the alignment tree (parents with nested children).
        <div className="space-y-3" data-testid="objective-grid">
          {tree.roots.map((o) => renderTree(o, 0))}
        </div>
      )}
    </AppShell>
  );
}
