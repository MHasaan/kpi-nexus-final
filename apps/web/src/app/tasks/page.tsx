'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlignLeft, ExternalLink, MessageSquare, Plus, Trash2, X } from 'lucide-react';

import {
  ApiError,
  type KpiSummary,
  type UserSummary,
  getAccessToken,
  listKpis,
  listUsers,
} from '../../lib/api-client';
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from '../../lib/collab-client';
import { AppShell } from '../../components/app-shell';
import { CommentsDrawer } from '../../components/comments-drawer';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { KpiPicker } from '../../components/dashboard-grid/kpi-picker';
import {
  Avatar,
  Badge,
  Button,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  type BadgeTone,
} from '../../components/ui';

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

const COLUMNS: { status: TaskStatus; label: string }[] = STATUSES.map((s) => ({
  status: s,
  label: STATUS_LABEL[s],
}));

const PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

const PRIORITY_RANK: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

type SortKey = 'due' | 'priority' | 'created';

const DONE_LIKE = (s: TaskStatus) => s === 'DONE' || s === 'CANCELLED';

/** Short date like "Jun 6" (or "Jun 6, 2027" when not the current year). */
function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}

/** Days from now until `iso` (negative = past). null when unparseable. */
function daysUntil(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Tone for a due date relative to a task's status. */
function dueTone(iso: string, status: TaskStatus): 'overdue' | 'soon' | 'normal' {
  if (DONE_LIKE(status)) return 'normal';
  const d = daysUntil(iso);
  if (d == null) return 'normal';
  if (d < 0) return 'overdue';
  if (d <= 3) return 'soon';
  return 'normal';
}

/** Per-column quick-add: type a title + Enter to create a task directly in that column. */
function QuickAdd({
  status,
  onAdd,
}: {
  status: TaskStatus;
  onAdd: (status: TaskStatus, title: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  return (
    <Input
      data-testid={`quick-add-${status}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Add task…"
      aria-label={`Add task to ${status}`}
      className="h-8 text-[13px]"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          void onAdd(status, value.trim());
          setValue('');
        }
      }}
    />
  );
}

interface CreateState {
  title: string;
  description: string;
  assigneeUserId: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  kpiId: string | undefined;
}

const EMPTY_CREATE: CreateState = {
  title: '',
  description: '',
  assigneeUserId: '',
  dueAt: '',
  priority: 'MEDIUM',
  status: 'TODO',
  kpiId: undefined,
};

interface EditState {
  title: string;
  description: string;
  assigneeUserId: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  kpiId: string | undefined;
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  // Filters + search + sort
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due');

  // Full-create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [create, setCreate] = useState<CreateState>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);

  // Detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [confirmDeleteDetail, setConfirmDeleteDetail] = useState(false);
  const [deletingDetail, setDeletingDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(
        await listTasks({
          ...(priorityFilter ? { priority: priorityFilter } : {}),
          ...(assigneeFilter ? { assigneeUserId: assigneeFilter } : {}),
        }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, assigneeFilter]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
    listKpis()
      .then(setKpis)
      .catch(() => setKpis([]));
  }, []);

  const userById = useCallback(
    (uid: string | null): UserSummary | undefined => (uid ? users.find((u) => u.id === uid) : undefined),
    [users],
  );
  const kpiById = useCallback(
    (kid: string | null): KpiSummary | undefined => (kid ? kpis.find((k) => k.id === kid) : undefined),
    [kpis],
  );

  // Close drawers/modals on Escape.
  useEffect(() => {
    if (!detailId && !createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailId(null);
        setCreateOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId, createOpen]);

  const addTaskTo = async (status: TaskStatus, value: string) => {
    if (!value.trim()) return;
    try {
      await createTask({ title: value.trim(), status, priority: 'MEDIUM' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create task');
    }
  };

  const submitCreate = async () => {
    if (!create.title.trim()) return;
    setCreating(true);
    try {
      await createTask({
        title: create.title.trim(),
        description: create.description.trim() || null,
        assigneeUserId: create.assigneeUserId || null,
        dueAt: create.dueAt ? new Date(create.dueAt).toISOString() : null,
        priority: create.priority,
        status: create.status,
        kpiId: create.kpiId ?? null,
      });
      setCreate(EMPTY_CREATE);
      setCreateOpen(false);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create task');
    } finally {
      setCreating(false);
    }
  };

  const onDrop = async (status: TaskStatus) => {
    setOverCol(null);
    if (!draggedId) return;
    try {
      await updateTask(draggedId, { status });
      setDraggedId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not move task');
    }
  };

  const removeTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete task');
    }
  };

  // --- Detail drawer ---
  const detailTask = useMemo(() => tasks.find((t) => t.id === detailId) ?? null, [tasks, detailId]);

  const openDetail = (task: Task) => {
    setConfirmDeleteDetail(false);
    setDetailId(task.id);
    setEdit({
      title: task.title,
      description: task.description ?? '',
      assigneeUserId: task.assigneeUserId ?? '',
      dueAt: task.dueAt ? task.dueAt.slice(0, 10) : '',
      priority: task.priority,
      status: task.status,
      kpiId: task.kpiId ?? undefined,
    });
  };

  const closeDetail = () => {
    setDetailId(null);
    setEdit(null);
    setConfirmDeleteDetail(false);
  };

  const saveDetail = async () => {
    if (!detailId || !edit || !edit.title.trim()) return;
    setSavingDetail(true);
    try {
      await updateTask(detailId, {
        title: edit.title.trim(),
        description: edit.description.trim() || null,
        assigneeUserId: edit.assigneeUserId || null,
        dueAt: edit.dueAt ? new Date(edit.dueAt).toISOString() : null,
        priority: edit.priority,
        status: edit.status,
        kpiId: edit.kpiId ?? null,
      });
      setError(null);
      await load();
      closeDetail();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update task');
    } finally {
      setSavingDetail(false);
    }
  };

  const deleteFromDetail = async () => {
    if (!detailId) return;
    setDeletingDetail(true);
    try {
      await deleteTask(detailId);
      setError(null);
      await load();
      closeDetail();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete task');
    } finally {
      setDeletingDetail(false);
    }
  };

  // Apply client-side search + sort within each column's tasks.
  const visibleByColumn = useCallback(
    (status: TaskStatus): Task[] => {
      const q = search.trim().toLowerCase();
      const rows = tasks.filter(
        (t) => t.status === status && (q === '' || t.title.toLowerCase().includes(q)),
      );
      const sorted = [...rows].sort((a, b) => {
        if (sortKey === 'priority') {
          return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        }
        if (sortKey === 'created') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        // due — nulls last, then ascending by date.
        const at = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const bt = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
      });
      return sorted;
    },
    [tasks, search, sortKey],
  );

  const userOptions = users.map((u) => (
    <option key={u.id} value={u.id}>
      {u.fullName}
    </option>
  ));

  return (
    <AppShell title="Tasks" crumbs={[{ label: 'Tasks' }]}>
      <PageHeader
        title="Tasks"
        subtitle="Drag cards across the lifecycle — moves are optimistic"
        actions={
          <PermissionGuard permission="KPI_CREATE">
            <Button
              size="sm"
              data-testid="task-new"
              onClick={() => {
                setCreate(EMPTY_CREATE);
                setCreateOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" aria-hidden />}
            >
              New task
            </Button>
          </PermissionGuard>
        }
      />

      {error && (
        <p
          className="mb-4 mt-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="tasks-error"
        >
          {error}
        </p>
      )}

      <div className="mb-4 mt-4 flex flex-wrap items-end gap-3" data-testid="task-filters">
        <div className="w-56 flex-1 sm:max-w-xs">
          <Label htmlFor="task-search-input">Search</Label>
          <Input
            id="task-search-input"
            data-testid="task-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            type="search"
          />
        </div>
        <div className="w-40">
          <Label htmlFor="task-priority-filter">Priority</Label>
          <Select
            id="task-priority-filter"
            data-testid="filter-priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')}
          >
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        {users.length > 0 && (
          <div className="w-56">
            <Label htmlFor="task-assignee-filter">Assignee</Label>
            <Select
              id="task-assignee-filter"
              data-testid="filter-assignee"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="">All assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-40">
          <Label htmlFor="task-sort-select">Sort by</Label>
          <Select
            id="task-sort-select"
            data-testid="task-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="created">Created</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="kanban">
        {COLUMNS.map((col) => {
          const colTasks = visibleByColumn(col.status);
          const isOver = overCol === col.status && draggedId !== null;
          return (
            <div
              key={col.status}
              data-testid={`column-${col.status}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== col.status) setOverCol(col.status);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setOverCol((c) => (c === col.status ? null : c));
              }}
              onDrop={() => onDrop(col.status)}
              className={`flex min-h-[200px] flex-col gap-2 rounded-xl border p-3 transition-colors duration-fast ${
                isOver ? 'border-accent-primary bg-accent-bg' : 'border-border bg-surface-1'
              }`}
            >
              <div className="flex items-center gap-2 px-0.5">
                <span className="text-sm font-semibold text-content-strong">{col.label}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-content-muted">
                  {colTasks.length}
                </span>
              </div>

              <QuickAdd status={col.status} onAdd={addTaskTo} />

              {loading ? (
                <Skeleton className="h-16 w-full rounded-lg" />
              ) : (
                <>
                  {colTasks.map((task) => {
                    const assignee = userById(task.assigneeUserId);
                    const kpi = kpiById(task.kpiId);
                    const tone = task.dueAt ? dueTone(task.dueAt, task.status) : 'normal';
                    return (
                      <div
                        key={task.id}
                        data-testid={`task-${task.id}`}
                        draggable
                        onDragStart={() => setDraggedId(task.id)}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setOverCol(null);
                        }}
                        onClick={() => openDetail(task)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail(task);
                          }
                        }}
                        className="group cursor-pointer rounded-lg border border-border bg-surface-bg p-3 shadow-xs transition-colors hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`text-sm font-medium text-content-strong ${DONE_LIKE(task.status) ? 'line-through opacity-70' : ''}`}
                            data-testid="task-title"
                          >
                            {task.title}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeTask(task.id);
                            }}
                            className="shrink-0 rounded p-0.5 text-content-muted opacity-0 transition-opacity hover:text-status-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                            aria-label="Delete task"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>

                        {/* Linked KPI badge */}
                        {kpi && (
                          <div className="mt-2">
                            <Link
                              href={`/kpis/${kpi.id}`}
                              data-testid={`task-kpi-${task.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-accent-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title={kpi.name}
                            >
                              <span className="truncate">{kpi.name}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                            </Link>
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge tone={PRIORITY_TONE[task.priority] ?? 'neutral'}>{task.priority}</Badge>
                          {task.dueAt && (
                            <span
                              data-testid={`task-due-${task.id}`}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                                tone === 'overdue'
                                  ? 'bg-status-critical-bg text-status-critical'
                                  : tone === 'soon'
                                    ? 'bg-status-warning-bg text-status-warning'
                                    : 'bg-surface-2 text-content-muted'
                              }`}
                              title={tone === 'overdue' ? 'Overdue' : tone === 'soon' ? 'Due soon' : 'Due date'}
                            >
                              {formatDue(task.dueAt)}
                            </span>
                          )}
                          {task.description && (
                            <span className="text-content-disabled" title="Has description">
                              <AlignLeft className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          )}
                          <span
                            className="text-content-disabled"
                            title="Open to comment"
                            aria-hidden
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          {assignee ? (
                            <span
                              className="inline-flex items-center gap-1.5"
                              data-testid={`task-assignee-${task.id}`}
                            >
                              <Avatar name={assignee.fullName} size="sm" />
                              <span className="truncate text-xs text-content-muted">{assignee.fullName}</span>
                            </span>
                          ) : (
                            <span
                              className="text-xs text-content-disabled"
                              data-testid={`task-assignee-${task.id}`}
                            >
                              Unassigned
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className="flex h-14 items-center justify-center rounded-lg border border-dashed border-border text-xs text-content-disabled">
                      Drop here
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Full-create modal */}
      {createOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            aria-hidden
            onClick={() => setCreateOpen(false)}
          />
          <div
            data-testid="task-create"
            role="dialog"
            aria-label="New task"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface-bg shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-content-strong">New task</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setCreateOpen(false)}
                className="rounded-md p-1 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="task-create-title" required>
                    Title
                  </Label>
                  <Input
                    id="task-create-title"
                    data-testid="task-create-title"
                    value={create.title}
                    onChange={(e) => setCreate({ ...create, title: e.target.value })}
                    placeholder="What needs doing?"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="task-create-description">Description</Label>
                  <Textarea
                    id="task-create-description"
                    data-testid="task-create-description"
                    rows={3}
                    value={create.description}
                    onChange={(e) => setCreate({ ...create, description: e.target.value })}
                    placeholder="Optional details"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="task-create-assignee">Assignee</Label>
                    <Select
                      id="task-create-assignee"
                      data-testid="task-create-assignee"
                      value={create.assigneeUserId}
                      onChange={(e) => setCreate({ ...create, assigneeUserId: e.target.value })}
                      className="mt-1"
                    >
                      <option value="">Unassigned</option>
                      {userOptions}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="task-create-due">Due date</Label>
                    <Input
                      id="task-create-due"
                      data-testid="task-create-due"
                      type="date"
                      value={create.dueAt}
                      onChange={(e) => setCreate({ ...create, dueAt: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="task-create-priority">Priority</Label>
                    <Select
                      id="task-create-priority"
                      data-testid="task-create-priority"
                      value={create.priority}
                      onChange={(e) => setCreate({ ...create, priority: e.target.value as TaskPriority })}
                      className="mt-1"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="task-create-status">Status</Label>
                    <Select
                      id="task-create-status"
                      data-testid="task-create-status"
                      value={create.status}
                      onChange={(e) => setCreate({ ...create, status: e.target.value as TaskStatus })}
                      className="mt-1"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <KpiPicker
                  value={create.kpiId}
                  onChange={(kpiId) => setCreate({ ...create, kpiId })}
                  kpis={kpis}
                  label="Linked KPI (optional)"
                  testId="task-create-kpi"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                size="sm"
                data-testid="task-create-submit"
                onClick={() => void submitCreate()}
                isLoading={creating}
                disabled={creating || !create.title.trim()}
              >
                Create task
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Task detail drawer */}
      {detailId && detailTask && edit && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeDetail}
          />
          <div
            data-testid="task-detail"
            role="dialog"
            aria-label="Task detail"
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[440px] max-w-full flex-col border-l border-border bg-surface-bg shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-content-strong">Task detail</h2>
              <button
                type="button"
                aria-label="Close"
                data-testid="task-detail-close"
                onClick={closeDetail}
                className="rounded-md p-1 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="task-detail-title" required>
                    Title
                  </Label>
                  <Input
                    id="task-detail-title"
                    data-testid="task-detail-title"
                    value={edit.title}
                    onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="task-detail-description">Description</Label>
                  <Textarea
                    id="task-detail-description"
                    data-testid="task-detail-description"
                    rows={3}
                    value={edit.description}
                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="task-detail-assignee">Assignee</Label>
                    <Select
                      id="task-detail-assignee"
                      data-testid="task-detail-assignee"
                      value={edit.assigneeUserId}
                      onChange={(e) => setEdit({ ...edit, assigneeUserId: e.target.value })}
                      className="mt-1"
                    >
                      <option value="">Unassigned</option>
                      {userOptions}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="task-detail-due">Due date</Label>
                    <Input
                      id="task-detail-due"
                      data-testid="task-detail-due"
                      type="date"
                      value={edit.dueAt}
                      onChange={(e) => setEdit({ ...edit, dueAt: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="task-detail-priority">Priority</Label>
                    <Select
                      id="task-detail-priority"
                      data-testid="task-detail-priority"
                      value={edit.priority}
                      onChange={(e) => setEdit({ ...edit, priority: e.target.value as TaskPriority })}
                      className="mt-1"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="task-detail-status">Status</Label>
                    <Select
                      id="task-detail-status"
                      data-testid="task-detail-status"
                      value={edit.status}
                      onChange={(e) => setEdit({ ...edit, status: e.target.value as TaskStatus })}
                      className="mt-1"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <KpiPicker
                  value={edit.kpiId}
                  onChange={(kpiId) => setEdit({ ...edit, kpiId })}
                  kpis={kpis}
                  label="Linked KPI (optional)"
                  testId="task-detail-kpi"
                />

                <div className="border-t border-border pt-3">
                  <CommentsDrawer entityType="task" entityId={detailTask.id} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
              {confirmDeleteDetail ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs text-content-muted">Delete task?</span>
                  <Button
                    size="sm"
                    variant="danger"
                    data-testid="task-detail-delete"
                    onClick={() => void deleteFromDetail()}
                    isLoading={deletingDetail}
                    disabled={deletingDetail}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDeleteDetail(false)}
                    disabled={deletingDetail}
                    aria-label="Cancel delete"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="task-detail-delete-trigger"
                  onClick={() => setConfirmDeleteDetail(true)}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                >
                  Delete
                </Button>
              )}
              <Button
                size="sm"
                data-testid="task-detail-save"
                onClick={() => void saveDetail()}
                isLoading={savingDetail}
                disabled={savingDetail || !edit.title.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
