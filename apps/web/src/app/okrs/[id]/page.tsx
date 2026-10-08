'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ExternalLink, Pencil, RefreshCw, Trash2, X } from 'lucide-react';

import {
  ApiError,
  type KpiSummary,
  type UserSummary,
  getAccessToken,
  listKpis,
  listUsers,
} from '../../../lib/api-client';
import {
  type KeyResult,
  type Objective,
  type ObjectiveStatus,
  createKeyResult,
  deleteKeyResult,
  deleteObjective,
  getObjective,
  listKeyResults,
  listObjectives,
  syncObjectiveFromKpis,
  updateKeyResult,
  updateObjective,
} from '../../../lib/collab-client';
import { AppShell } from '../../../components/app-shell';
import { CommentsDrawer } from '../../../components/comments-drawer';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import { KpiPicker } from '../../../components/dashboard-grid/kpi-picker';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../../components/ui';
import type { BadgeTone } from '../../../components/ui';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

const STATUSES: ObjectiveStatus[] = ['DRAFT', 'ACTIVE', 'AT_RISK', 'ACHIEVED', 'MISSED', 'ARCHIVED'];

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'info',
  AT_RISK: 'warning',
  ACHIEVED: 'success',
  MISSED: 'error',
  ARCHIVED: 'neutral',
};

function ringColor(status: string): string {
  if (status === 'AT_RISK') return 'var(--status-warning, #d97706)';
  if (status === 'ACHIEVED') return 'var(--status-success, #16a34a)';
  if (status === 'MISSED') return 'var(--status-critical, #dc2626)';
  return 'var(--accent-primary, #6366f1)';
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

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

interface ObjEditState {
  name: string;
  description: string;
  ownerUserId: string;
  periodStart: string;
  periodEnd: string;
  status: ObjectiveStatus;
  parentObjectiveId: string;
}

interface KrEditState {
  name: string;
  description: string;
  baselineValue: string;
  targetValue: string;
  currentValue: string;
  weight: string;
  kpiId: string | undefined;
}

interface KrAddState {
  name: string;
  description: string;
  baselineValue: string;
  targetValue: string;
  currentValue: string;
  weight: string;
  kpiId: string | undefined;
}

const EMPTY_ADD: KrAddState = {
  name: '',
  description: '',
  baselineValue: '',
  targetValue: '',
  currentValue: '',
  weight: '1',
  kpiId: undefined,
};

export default function ObjectiveDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [objective, setObjective] = useState<Objective | null>(null);
  const [krs, setKrs] = useState<KeyResult[]>([]);
  const [allObjectives, setAllObjectives] = useState<Objective[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Objective edit / delete
  const [objEditing, setObjEditing] = useState(false);
  const [objEdit, setObjEdit] = useState<ObjEditState | null>(null);
  const [savingObj, setSavingObj] = useState(false);
  const [confirmDeleteObj, setConfirmDeleteObj] = useState(false);
  const [deletingObj, setDeletingObj] = useState(false);

  // KR edit / delete
  const [krEditingId, setKrEditingId] = useState<string | null>(null);
  const [krEdit, setKrEdit] = useState<KrEditState | null>(null);
  const [savingKr, setSavingKr] = useState(false);
  const [confirmDeleteKr, setConfirmDeleteKr] = useState<string | null>(null);
  const [deletingKr, setDeletingKr] = useState<string | null>(null);

  // KR add
  const [add, setAdd] = useState<KrAddState>(EMPTY_ADD);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [obj, krList, objs, us, kp] = await Promise.all([
        getObjective(id),
        listKeyResults(id),
        listObjectives().catch(() => [] as Objective[]),
        listUsers().catch(() => [] as UserSummary[]),
        listKpis().catch(() => [] as KpiSummary[]),
      ]);
      setObjective(obj);
      setKrs(krList);
      setAllObjectives(objs);
      setUsers(us);
      setKpis(kp);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load objective');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void load();
  }, [load, router]);

  const ownerName = useCallback(
    (uid: string): string => users.find((u) => u.id === uid)?.fullName ?? '—',
    [users],
  );
  const kpiById = useCallback((kid: string): KpiSummary | undefined => kpis.find((k) => k.id === kid), [kpis]);

  const parent = useMemo(
    () => (objective?.parentObjectiveId ? allObjectives.find((o) => o.id === objective.parentObjectiveId) ?? null : null),
    [allObjectives, objective],
  );
  const children = useMemo(
    () => (objective ? allObjectives.filter((o) => o.parentObjectiveId === objective.id) : []),
    [allObjectives, objective],
  );

  const overall = objective ? Math.round(objective.progress * 100) : 0;

  // --- Objective edit/delete ---
  const beginObjEdit = () => {
    if (!objective) return;
    setConfirmDeleteObj(false);
    setObjEdit({
      name: objective.name,
      description: objective.description ?? '',
      ownerUserId: objective.ownerUserId,
      periodStart: objective.periodStart.slice(0, 10),
      periodEnd: objective.periodEnd.slice(0, 10),
      status: objective.status,
      parentObjectiveId: objective.parentObjectiveId ?? '',
    });
    setObjEditing(true);
  };

  const saveObjEdit = async () => {
    if (!objEdit || !objEdit.name.trim()) return;
    setSavingObj(true);
    try {
      await updateObjective(id, {
        name: objEdit.name.trim(),
        description: objEdit.description.trim() || null,
        ownerUserId: objEdit.ownerUserId,
        parentObjectiveId: objEdit.parentObjectiveId || null,
        periodStart: objEdit.periodStart,
        periodEnd: objEdit.periodEnd,
        status: objEdit.status,
      });
      setObjEditing(false);
      setObjEdit(null);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update objective');
    } finally {
      setSavingObj(false);
    }
  };

  const removeObjective = async () => {
    setDeletingObj(true);
    try {
      await deleteObjective(id);
      router.push('/okrs');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete objective');
      setDeletingObj(false);
    }
  };

  // --- KR add ---
  const addKr = async () => {
    if (!add.name.trim() || add.targetValue.trim() === '') return;
    setAdding(true);
    try {
      await createKeyResult(id, {
        name: add.name.trim(),
        description: add.description.trim() || undefined,
        kpiId: add.kpiId,
        baselineValue: add.baselineValue.trim() === '' ? undefined : Number(add.baselineValue),
        targetValue: Number(add.targetValue),
        currentValue: add.currentValue.trim() === '' ? undefined : Number(add.currentValue),
        weight: add.weight.trim() === '' ? undefined : Number(add.weight),
      });
      setAdd(EMPTY_ADD);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add key result');
    } finally {
      setAdding(false);
    }
  };

  // --- KR quick current value ---
  const updateCurrent = async (krId: string, value: string) => {
    try {
      await updateKeyResult(id, krId, { currentValue: value.trim() === '' ? 0 : Number(value) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update key result');
    }
  };

  // --- KR edit/delete ---
  const beginKrEdit = (kr: KeyResult) => {
    setConfirmDeleteKr(null);
    setKrEditingId(kr.id);
    setKrEdit({
      name: kr.name,
      description: kr.description ?? '',
      baselineValue: kr.baselineValue == null ? '' : String(kr.baselineValue),
      targetValue: String(kr.targetValue),
      currentValue: kr.currentValue == null ? '' : String(kr.currentValue),
      weight: String(kr.weight),
      kpiId: kr.kpiId ?? undefined,
    });
  };

  const cancelKrEdit = () => {
    setKrEditingId(null);
    setKrEdit(null);
  };

  const saveKrEdit = async (krId: string) => {
    if (!krEdit || !krEdit.name.trim() || krEdit.targetValue.trim() === '') return;
    setSavingKr(true);
    try {
      await updateKeyResult(id, krId, {
        name: krEdit.name.trim(),
        description: krEdit.description.trim() || undefined,
        kpiId: krEdit.kpiId ?? null,
        baselineValue: krEdit.baselineValue.trim() === '' ? undefined : Number(krEdit.baselineValue),
        targetValue: Number(krEdit.targetValue),
        currentValue: krEdit.currentValue.trim() === '' ? undefined : Number(krEdit.currentValue),
        weight: krEdit.weight.trim() === '' ? 1 : Number(krEdit.weight),
      });
      cancelKrEdit();
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update key result');
    } finally {
      setSavingKr(false);
    }
  };

  const removeKr = async (krId: string) => {
    setDeletingKr(krId);
    try {
      await deleteKeyResult(id, krId);
      setConfirmDeleteKr(null);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete key result');
    } finally {
      setDeletingKr(null);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await syncObjectiveFromKpis(id);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sync from KPIs');
    } finally {
      setSyncing(false);
    }
  };

  const ownerOptions = users.map((u) => (
    <option key={u.id} value={u.id}>
      {u.fullName}
    </option>
  ));

  return (
    <AppShell
      title={objective?.name ?? 'Objective'}
      crumbs={[{ label: 'OKRs', href: '/okrs' }, { label: objective?.name ?? 'Objective' }]}
    >
      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="okr-error"
        >
          {error}
        </p>
      )}

      {loading && !objective ? (
        <div>
          <Skeleton className="mb-6 h-8 w-64" />
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : !objective ? (
        <EmptyState title="Objective not found" description="This objective may have been removed." />
      ) : (
        <>
          <PageHeader
            title={<span data-testid="objective-heading">{objective.name}</span>}
            subtitle="Progress rolls up from your key results and aligned objectives"
            actions={
              <div className="flex items-center gap-2">
                <PermissionGuard permission="KPI_EDIT">
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="okr-edit-objective"
                    onClick={beginObjEdit}
                    leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden />}
                  >
                    Edit
                  </Button>
                </PermissionGuard>
                <PermissionGuard permission="KPI_DELETE">
                  {confirmDeleteObj ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-xs text-content-muted">Delete objective?</span>
                      <Button
                        size="sm"
                        variant="danger"
                        data-testid="okr-delete-objective"
                        onClick={() => void removeObjective()}
                        isLoading={deletingObj}
                        disabled={deletingObj}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteObj(false)}
                        disabled={deletingObj}
                        aria-label="Cancel delete"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="okr-delete-objective-trigger"
                      onClick={() => setConfirmDeleteObj(true)}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                    >
                      Delete
                    </Button>
                  )}
                </PermissionGuard>
                <CommentsDrawer entityType="objective" entityId={objective.id} />
              </div>
            }
          />

          {/* Objective edit form */}
          {objEditing && objEdit && (
            <Card className="mb-6 border-accent-primary/40" data-testid="okr-edit-objective-form">
              <CardHeader>
                <CardTitle>Edit objective</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="obj-edit-name" required>
                      Name
                    </Label>
                    <Input
                      id="obj-edit-name"
                      data-testid="okr-edit-name"
                      value={objEdit.name}
                      onChange={(e) => setObjEdit({ ...objEdit, name: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="obj-edit-desc">Description</Label>
                    <Textarea
                      id="obj-edit-desc"
                      rows={2}
                      value={objEdit.description}
                      onChange={(e) => setObjEdit({ ...objEdit, description: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="obj-edit-owner">Owner</Label>
                    <Select
                      id="obj-edit-owner"
                      data-testid="okr-edit-owner"
                      value={objEdit.ownerUserId}
                      onChange={(e) => setObjEdit({ ...objEdit, ownerUserId: e.target.value })}
                      className="mt-1"
                    >
                      {objEdit.ownerUserId === '' && <option value="">Select owner…</option>}
                      {ownerOptions}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="obj-edit-status">Status</Label>
                    <Select
                      id="obj-edit-status"
                      data-testid="okr-edit-status"
                      value={objEdit.status}
                      onChange={(e) => setObjEdit({ ...objEdit, status: e.target.value as ObjectiveStatus })}
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
                    <Label htmlFor="obj-edit-start">Period start</Label>
                    <Input
                      id="obj-edit-start"
                      type="date"
                      value={objEdit.periodStart}
                      onChange={(e) => setObjEdit({ ...objEdit, periodStart: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="obj-edit-end">Period end</Label>
                    <Input
                      id="obj-edit-end"
                      type="date"
                      value={objEdit.periodEnd}
                      onChange={(e) => setObjEdit({ ...objEdit, periodEnd: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="obj-edit-parent">Aligns to (parent objective)</Label>
                    <Select
                      id="obj-edit-parent"
                      data-testid="okr-edit-parent"
                      value={objEdit.parentObjectiveId}
                      onChange={(e) => setObjEdit({ ...objEdit, parentObjectiveId: e.target.value })}
                      className="mt-1"
                    >
                      <option value="">None</option>
                      {allObjectives
                        .filter((p) => p.id !== id)
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
                    data-testid="okr-edit-save"
                    onClick={() => void saveObjEdit()}
                    isLoading={savingObj}
                    disabled={savingObj || !objEdit.name.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setObjEditing(false);
                      setObjEdit(null);
                    }}
                    disabled={savingObj}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Objective metadata header */}
          <Card className="mb-6">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                {objective.description && (
                  <p className="text-sm text-content-default" data-testid="objective-description">
                    {objective.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
                  <span>
                    Owner: <span className="text-content-strong">{ownerName(objective.ownerUserId)}</span>
                  </span>
                  <span aria-hidden>·</span>
                  <span data-testid="objective-period">{formatPeriod(objective.periodStart, objective.periodEnd)}</span>
                  <Badge tone={STATUS_TONE[objective.status] ?? 'neutral'} data-testid="objective-status">
                    {objective.status}
                  </Badge>
                </div>
              </div>
              {/* Progress ring */}
              <div className="flex shrink-0 items-center gap-3">
                <div
                  className="grid h-24 w-24 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(${ringColor(objective.status)} ${overall * 3.6}deg, var(--surface-2, #e5e7eb) 0deg)`,
                  }}
                  role="img"
                  aria-label={`Overall progress ${overall}%`}
                >
                  <div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-surface-bg">
                    <span className="text-xl font-bold tabular-nums text-content-strong" data-testid="objective-progress">
                      {overall}%
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alignment: parent + children */}
          {(parent || children.length > 0) && (
            <Card className="mb-6" data-testid="okr-alignment">
              <CardHeader>
                <CardTitle>Alignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {parent && (
                  <div>
                    <div className="kn-eyebrow mb-1">Aligns to</div>
                    <Link
                      href={`/okrs/${parent.id}`}
                      data-testid="okr-parent-link"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {parent.name}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                )}
                {children.length > 0 && (
                  <div>
                    <div className="kn-eyebrow mb-2">
                      Child objectives ({children.length}) — their progress rolls up into this one
                    </div>
                    <div className="space-y-2">
                      {children.map((c) => {
                        const cpct = Math.round(c.progress * 100);
                        return (
                          <div key={c.id} className="flex items-center gap-3">
                            <Link
                              href={`/okrs/${c.id}`}
                              data-testid={`okr-child-${c.id}`}
                              className="w-44 shrink-0 truncate text-sm text-content-strong hover:text-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title={c.name}
                            >
                              {c.name}
                            </Link>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                              <div className="h-full rounded-full bg-accent-primary" style={{ width: `${cpct}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs font-semibold tabular-nums text-content-strong">
                              {cpct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
            <Card data-testid="kr-list">
              <CardHeader className="flex items-center justify-between gap-2">
                <CardTitle>Key results</CardTitle>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="okr-sync"
                  onClick={sync}
                  isLoading={syncing}
                  disabled={syncing}
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                  title="Pulls the latest value of each linked KPI into its key result"
                >
                  Sync from linked KPIs
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {krs.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-content-muted" data-testid="kr-empty">
                    No key results yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border-divider">
                    {krs.map((kr) => {
                      const pct = Math.round(kr.progress * 100);
                      const linkedKpi = kr.kpiId ? kpiById(kr.kpiId) : undefined;
                      const unit = linkedKpi?.unit ?? '';
                      const isEditing = krEditingId === kr.id;

                      if (isEditing && krEdit) {
                        return (
                          <div key={kr.id} data-testid={`kr-${kr.id}`} className="space-y-3 bg-surface-2/40 px-4 py-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <Label htmlFor={`kr-edit-name-${kr.id}`} required>
                                  Name
                                </Label>
                                <Input
                                  id={`kr-edit-name-${kr.id}`}
                                  value={krEdit.name}
                                  onChange={(e) => setKrEdit({ ...krEdit, name: e.target.value })}
                                  className="mt-1"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <Label htmlFor={`kr-edit-desc-${kr.id}`}>Description</Label>
                                <Textarea
                                  id={`kr-edit-desc-${kr.id}`}
                                  rows={2}
                                  value={krEdit.description}
                                  onChange={(e) => setKrEdit({ ...krEdit, description: e.target.value })}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`kr-edit-baseline-${kr.id}`}>Baseline</Label>
                                <Input
                                  id={`kr-edit-baseline-${kr.id}`}
                                  type="number"
                                  value={krEdit.baselineValue}
                                  onChange={(e) => setKrEdit({ ...krEdit, baselineValue: e.target.value })}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`kr-edit-target-${kr.id}`} required>
                                  Target
                                </Label>
                                <Input
                                  id={`kr-edit-target-${kr.id}`}
                                  type="number"
                                  value={krEdit.targetValue}
                                  onChange={(e) => setKrEdit({ ...krEdit, targetValue: e.target.value })}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`kr-edit-current-${kr.id}`}>Current</Label>
                                <Input
                                  id={`kr-edit-current-${kr.id}`}
                                  type="number"
                                  value={krEdit.currentValue}
                                  onChange={(e) => setKrEdit({ ...krEdit, currentValue: e.target.value })}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`kr-edit-weight-${kr.id}`}>Weight</Label>
                                <Input
                                  id={`kr-edit-weight-${kr.id}`}
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  value={krEdit.weight}
                                  onChange={(e) => setKrEdit({ ...krEdit, weight: e.target.value })}
                                  className="mt-1"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <KpiPicker
                                  value={krEdit.kpiId}
                                  onChange={(kpiId) => setKrEdit({ ...krEdit, kpiId })}
                                  kpis={kpis}
                                  label="Linked KPI (optional)"
                                  testId={`kr-kpi-link-${kr.id}`}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                data-testid={`kr-edit-save-${kr.id}`}
                                onClick={() => void saveKrEdit(kr.id)}
                                isLoading={savingKr}
                                disabled={savingKr || !krEdit.name.trim() || krEdit.targetValue.trim() === ''}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelKrEdit} disabled={savingKr}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={kr.id} data-testid={`kr-${kr.id}`} className="px-4 py-4">
                          <div className="mb-2 flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-content-strong">{kr.name}</span>
                              {kr.description && (
                                <p className="mt-0.5 text-xs text-content-muted">{kr.description}</p>
                              )}
                            </div>
                            <span className="font-mono text-xs text-content-muted whitespace-nowrap">
                              {fmtNum(kr.baselineValue)} → <span className="text-content-strong">{fmtNum(kr.currentValue)}</span> →{' '}
                              {fmtNum(kr.targetValue)}
                              {unit && <span className="ml-1">{unit}</span>}
                            </span>
                            <span className="w-12 text-right text-sm font-bold tabular-nums text-content-strong">
                              {pct}% <span data-testid="kr-progress" />
                            </span>
                          </div>
                          <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-accent-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
                            <span>
                              Weight: <span className="font-medium text-content-strong">{fmtNum(kr.weight)}</span>
                            </span>
                            <span aria-hidden>·</span>
                            {linkedKpi ? (
                              <Link
                                href={`/kpis/${linkedKpi.id}`}
                                data-testid={`kr-kpi-link-${kr.id}`}
                                className="inline-flex items-center gap-1 text-accent-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {linkedKpi.name}
                                <ExternalLink className="h-3 w-3" aria-hidden />
                              </Link>
                            ) : kr.kpiId ? (
                              <span data-testid={`kr-kpi-link-${kr.id}`}>linked KPI</span>
                            ) : (
                              <span data-testid={`kr-kpi-link-${kr.id}`}>not linked</span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <PermissionGuard permission="KPI_EDIT">
                              <span className="flex items-center gap-2 text-sm text-content-muted">
                                <span>Current</span>
                                <Input
                                  data-testid={`kr-current-${kr.id}`}
                                  type="number"
                                  defaultValue={kr.currentValue ?? ''}
                                  onBlur={(e) => updateCurrent(kr.id, e.target.value)}
                                  className="h-8 w-28"
                                />
                              </span>
                            </PermissionGuard>
                            <span className="ml-auto flex items-center gap-1">
                              <PermissionGuard permission="KPI_EDIT">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  data-testid={`kr-edit-${kr.id}`}
                                  onClick={() => beginKrEdit(kr)}
                                >
                                  <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden /> Edit
                                </Button>
                              </PermissionGuard>
                              <PermissionGuard permission="KPI_DELETE">
                                {confirmDeleteKr === kr.id ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="text-xs text-content-muted">Delete?</span>
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      data-testid={`kr-delete-${kr.id}`}
                                      onClick={() => void removeKr(kr.id)}
                                      isLoading={deletingKr === kr.id}
                                      disabled={deletingKr === kr.id}
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setConfirmDeleteKr(null)}
                                      disabled={deletingKr === kr.id}
                                      aria-label="Cancel delete"
                                    >
                                      <X className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    data-testid={`kr-delete-trigger-${kr.id}`}
                                    onClick={() => setConfirmDeleteKr(kr.id)}
                                  >
                                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Delete
                                  </Button>
                                )}
                              </PermissionGuard>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-gradient-brand-soft">
                <CardContent className="text-center">
                  <div className="kn-eyebrow mb-1">Overall progress</div>
                  <div className="text-4xl font-bold tabular-nums text-content-strong">{overall}%</div>
                  <div className="mx-auto mt-3 h-2 max-w-[220px] overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent-primary" style={{ width: `${overall}%` }} />
                  </div>
                  <p className="mt-3 text-xs text-content-muted">
                    weighted across {krs.length} key result{krs.length === 1 ? '' : 's'}
                    {children.length > 0 ? ` + ${children.length} child objective${children.length === 1 ? '' : 's'}` : ''}
                  </p>
                </CardContent>
              </Card>

              {/* Progress breakdown */}
              {(krs.length > 0 || children.length > 0) && (
                <Card data-testid="okr-breakdown">
                  <CardHeader>
                    <CardTitle>Progress breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {krs.map((kr) => (
                      <div key={kr.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-content-default" title={kr.name}>
                          {kr.name}
                        </span>
                        <Badge tone="neutral">w {fmtNum(kr.weight)}</Badge>
                        <span className="w-10 text-right font-semibold tabular-nums text-content-strong">
                          {Math.round(kr.progress * 100)}%
                        </span>
                      </div>
                    ))}
                    {children.map((c) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-content-muted" title={c.name}>
                          ↳ {c.name}
                        </span>
                        <Badge tone="info">child</Badge>
                        <span className="w-10 text-right font-semibold tabular-nums text-content-strong">
                          {Math.round(c.progress * 100)}%
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <PermissionGuard permission="KPI_CREATE">
                <Card data-testid="kr-add">
                  <CardHeader>
                    <CardTitle>Add key result</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label htmlFor="kr-name-input" required>
                        Name
                      </Label>
                      <Input
                        id="kr-name-input"
                        data-testid="kr-name"
                        value={add.name}
                        onChange={(e) => setAdd({ ...add, name: e.target.value })}
                        placeholder="Key result name"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="kr-desc-input">Description</Label>
                      <Textarea
                        id="kr-desc-input"
                        data-testid="kr-description"
                        rows={2}
                        value={add.description}
                        onChange={(e) => setAdd({ ...add, description: e.target.value })}
                        placeholder="Optional"
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="kr-baseline-input">Baseline</Label>
                        <Input
                          id="kr-baseline-input"
                          data-testid="kr-baseline"
                          type="number"
                          value={add.baselineValue}
                          onChange={(e) => setAdd({ ...add, baselineValue: e.target.value })}
                          placeholder="0"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="kr-target-input" required>
                          Target
                        </Label>
                        <Input
                          id="kr-target-input"
                          data-testid="kr-target"
                          type="number"
                          value={add.targetValue}
                          onChange={(e) => setAdd({ ...add, targetValue: e.target.value })}
                          placeholder="100"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="kr-current-input">Current</Label>
                        <Input
                          id="kr-current-input"
                          data-testid="kr-current"
                          type="number"
                          value={add.currentValue}
                          onChange={(e) => setAdd({ ...add, currentValue: e.target.value })}
                          placeholder="0"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="kr-weight-input">Weight</Label>
                        <Input
                          id="kr-weight-input"
                          data-testid="kr-weight"
                          type="number"
                          min={0}
                          step="0.1"
                          value={add.weight}
                          onChange={(e) => setAdd({ ...add, weight: e.target.value })}
                          placeholder="1"
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <KpiPicker
                      value={add.kpiId}
                      onChange={(kpiId) => setAdd({ ...add, kpiId })}
                      kpis={kpis}
                      label="Linked KPI (optional)"
                      testId="kr-add-kpi-link"
                    />
                    <Button
                      data-testid="add-kr"
                      onClick={addKr}
                      isLoading={adding}
                      disabled={adding || !add.name.trim() || add.targetValue.trim() === ''}
                      className="w-full"
                    >
                      Add key result
                    </Button>
                  </CardContent>
                </Card>
              </PermissionGuard>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
