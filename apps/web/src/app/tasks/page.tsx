'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

import { ApiError, getAccessToken, listUsers, type UserSummary } from '../../lib/api-client';
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
import { PageHeader, Input, Select, Label, Badge, Skeleton, type BadgeTone } from '../../components/ui';

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'BLOCKED', label: 'Blocked' },
  { status: 'DONE', label: 'Done' },
  { status: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

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

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');

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
  }, []);

  const addTaskTo = async (status: TaskStatus, value: string) => {
    if (!value.trim()) return;
    try {
      await createTask({ title: value.trim(), status, priority: 'MEDIUM' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create task');
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

  return (
    <AppShell title="Tasks" crumbs={[{ label: 'Tasks' }]}>
      <PageHeader
        title="Tasks"
        subtitle="Drag cards across the lifecycle — moves are optimistic"
      />

      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="tasks-error"
        >
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="task-filters">
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
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="kanban">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
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
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      data-testid={`task-${task.id}`}
                      draggable
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setOverCol(null);
                      }}
                      className="group cursor-grab rounded-lg border border-border bg-surface-bg p-3 shadow-xs active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-sm font-medium text-content-strong ${col.status === 'DONE' ? 'line-through opacity-70' : ''}`}
                          data-testid="task-title"
                        >
                          {task.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeTask(task.id)}
                          className="shrink-0 rounded p-0.5 text-content-muted opacity-0 transition-opacity hover:text-status-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                          aria-label="Delete task"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      <div className="mt-2">
                        <Badge tone={PRIORITY_TONE[task.priority] ?? 'neutral'}>{task.priority}</Badge>
                      </div>
                    </div>
                  ))}
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
    </AppShell>
  );
}
