'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Archive, ArrowLeft, Ban, Play, Trash2, UserSquare2 } from 'lucide-react';

import { AppShell } from '../../../components/app-shell';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  ScopeBadge,
  Select,
  Skeleton,
  StatusBadge,
  type BadgeTone,
  type KpiStatus,
} from '../../../components/ui';
import {
  ApiError,
  assignKpiToUser,
  getAccessToken,
  getUser,
  listKpis,
  listRoles,
  listUserKpis,
  listUsers,
  offboardUser,
  purgeUser,
  reactivateUser,
  suspendUser,
  unassignUserKpi,
  type MyKpiRow,
  type UserSummary,
} from '../../../lib/api-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { canHoldKpis, personKpiCandidates } from '../../../lib/person-kpi-candidates';
import { useAsyncData } from '../../../lib/use-async-data';
import { useConfirm } from '../../../lib/use-confirm';
import { useToast } from '../../../lib/use-toast';

/** The person, or the fact that there is nobody with this id (or nobody the caller may see). */
type PersonLoad = { found: true; user: UserSummary } | { found: false };

async function loadPerson(id: string): Promise<PersonLoad> {
  try {
    return { found: true, user: await getUser(id) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { found: false };
    throw err;
  }
}

/** A list that only decorates the page: without it the page still works. */
async function optional<T>(load: Promise<T[]>): Promise<T[]> {
  try {
    return await load;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return [];
    throw err;
  }
}

function toStatus(raw: string | null | undefined): KpiStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'exceeded':
    case 'on_track':
    case 'on-track':
      return 'on-track';
    case 'at_risk':
    case 'at-risk':
      return 'at-risk';
    case 'behind':
    case 'off_track':
    case 'off-track':
      return 'off-track';
    default:
      return 'no-data';
  }
}

const USER_STATUS_META: Record<
  UserSummary['status'],
  { label: string; tone: BadgeTone }
> = {
  INVITED: { label: 'INVITED', tone: 'info' },
  PENDING_VERIFICATION: { label: 'PENDING', tone: 'warning' },
  ACTIVE: { label: 'ACTIVE', tone: 'success' },
  SUSPENDED: { label: 'SUSPENDED', tone: 'warning' },
  ARCHIVED: { label: 'ARCHIVED', tone: 'neutral' },
  DELETED: { label: 'DELETED', tone: 'neutral' },
  PURGED: { label: 'REMOVED', tone: 'neutral' },
};

function UserStatusBadge({ status }: { status: UserSummary['status'] }) {
  const meta = USER_STATUS_META[status] ?? USER_STATUS_META.ARCHIVED;
  return (
    <Badge tone={meta.tone} className="font-mono" data-testid="user-status-badge">
      {meta.label}
    </Badge>
  );
}

export default function UserKpiPanelPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const signedIn = typeof window !== 'undefined' && Boolean(getAccessToken());
  // Each request stands alone (plan 2.10): the person is loaded by id, and a
  // role or directory list the caller may not read no longer blanks the page.
  const person = useAsyncData(() => loadPerson(params.id), [params.id]);
  const kpiRows = useAsyncData(() => listUserKpis(params.id), [params.id]);
  const people = useAsyncData(() => optional(listUsers()), []);
  const roleList = useAsyncData(() => optional(listRoles()), []);
  const allKpis = useAsyncData(() => optional(listKpis()), []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const [assignKpiId, setAssignKpiId] = useState('');
  const [assignTarget, setAssignTarget] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) router.replace(currentLoginRedirect());
  }, [signedIn, router]);

  const refresh = async () => {
    person.reload();
    kpiRows.reload();
  };
  const setError = setActionError;

  async function runLifecycleAction(action: () => Promise<unknown>) {
    setActionBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      // Surface API rejections (e.g. offboard needs reassignment) — do not crash
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }

  const notFound = person.data?.found === false;
  const user = person.data?.found ? person.data.user : null;
  const rows: MyKpiRow[] | null = notFound ? null : kpiRows.data;
  const error = actionError ?? person.error ?? (notFound ? null : kpiRows.error);
  const roleName = user ? (roleList.data?.find((r) => r.id === user.roleId)?.name ?? null) : null;
  const managerName = user?.managerId
    ? (people.data?.find((u) => u.id === user.managerId)?.fullName ?? null)
    : null;
  const candidates = personKpiCandidates(allKpis.data ?? [], rows ?? []);

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setAssignError(null);
    const kpiId = assignKpiId || candidates[0]?.id;
    if (!kpiId) return;
    const targetValue = assignTarget.trim() === '' ? undefined : Number(assignTarget);
    if (targetValue !== undefined && !Number.isFinite(targetValue)) {
      setAssignError('The target must be a number.');
      return;
    }
    setAssigning(true);
    try {
      await assignKpiToUser(user.id, kpiId, targetValue);
      setAssignKpiId('');
      setAssignTarget('');
      kpiRows.reload();
      toast.success('KPI assigned');
    } catch (e) {
      setAssignError(e instanceof ApiError ? e.message : 'Could not assign this KPI.');
    } finally {
      setAssigning(false);
    }
  };

  const removeKpi = async (row: MyKpiRow) => {
    if (!user) return;
    await confirm({
      title: `Remove ${row.name} from ${user.fullName}?`,
      description: 'They stop holding this KPI. Values they already recorded are kept.',
      confirmLabel: 'Remove',
      tone: 'danger',
      testId: 'user-kpi-remove-confirm',
      action: async () => {
        await unassignUserKpi(row.assignmentId);
        kpiRows.reload();
        toast.success('KPI removed');
      },
    });
  };

  return (
    <AppShell title="User profile" crumbs={['People', 'Users', 'Profile']}>
      <RequirePermission permission="USERS_VIEW">
        <div className="flex flex-col gap-6">
          <div>
            <Link
              href="/users"
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-primary hover:underline"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" /> Back to users
            </Link>
            <PageHeader
              eyebrow="Person"
              title={user?.fullName ?? 'Profile'}
              subtitle="Their own KPIs, with what they have recorded."
            />
          </div>

          {error && (
            <div
              role="alert"
              data-testid="user-kpis-error"
              className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
            >
              {error}
            </div>
          )}

          {notFound ? (
            <Card data-testid="user-not-found">
              <EmptyState
                icon={UserSquare2}
                title="Person not found"
                description="There is nobody with this address in your organisation, or they are outside what you can see."
                action={
                  <Link href="/users" className="text-sm font-semibold text-accent-primary hover:underline">
                    Back to people
                  </Link>
                }
              />
            </Card>
          ) : user === null && !error ? (
            <Card>
              <div className="flex items-center gap-4 p-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            </Card>
          ) : user ? (
            <Card data-testid="user-header">
              <div className="flex flex-wrap items-center gap-4 p-4">
                <Avatar name={user.fullName} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2
                      className="text-lg font-semibold text-content-strong"
                      data-testid="user-header-name"
                    >
                      {user.fullName}
                    </h2>
                    <UserStatusBadge status={user.status} />
                  </div>
                  <p className="font-mono text-xs text-content-muted">{user.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-content-muted">
                    <span>
                      Role:{' '}
                      <span className="font-medium text-content-default">
                        {roleName ?? '—'}
                      </span>
                    </span>
                    <span>
                      Manager:{' '}
                      <span className="font-medium text-content-default">
                        {managerName ?? '—'}
                      </span>
                    </span>
                  </div>
                </div>
                <PermissionGuard permission="USERS_MANAGE">
                  <div
                    className="flex flex-wrap items-center justify-end gap-1.5"
                    data-testid="user-lifecycle-actions"
                  >
                    {user.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={actionBusy}
                        onClick={() =>
                          runLifecycleAction(() => suspendUser(user.id))
                        }
                        leftIcon={<Ban aria-hidden className="h-3.5 w-3.5" />}
                        data-testid="user-suspend-button"
                      >
                        Suspend
                      </Button>
                    )}
                    {user.status === 'SUSPENDED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={actionBusy}
                        onClick={() =>
                          runLifecycleAction(() => reactivateUser(user.id))
                        }
                        leftIcon={<Play aria-hidden className="h-3.5 w-3.5" />}
                        data-testid="user-reactivate-button"
                      >
                        Reactivate
                      </Button>
                    )}
                    {user.status !== 'ARCHIVED' &&
                      user.status !== 'DELETED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={actionBusy}
                          onClick={() =>
                            runLifecycleAction(() => offboardUser(user.id))
                          }
                          leftIcon={
                            <Archive aria-hidden className="h-3.5 w-3.5" />
                          }
                          data-testid="user-archive-button"
                        >
                          Archive
                        </Button>
                      )}
                    {user.status === 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="danger"
                        isLoading={actionBusy}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Permanently purge ${user.fullName}? This cannot be undone.`,
                            )
                          )
                            return;
                          // After a successful purge the user is gone — return to
                          // the directory rather than refetching a 404 profile.
                          setActionBusy(true);
                          setError(null);
                          try {
                            await purgeUser(user.id);
                            router.replace('/users');
                          } catch (e) {
                            setError(
                              e instanceof ApiError
                                ? e.message
                                : 'Action failed',
                            );
                            setActionBusy(false);
                          }
                        }}
                        leftIcon={
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        }
                        data-testid="user-purge-button"
                      >
                        Purge
                      </Button>
                    )}
                  </div>
                </PermissionGuard>
              </div>
            </Card>
          ) : null}

          {user && canHoldKpis(user.status) && (
            <PermissionGuard permission="KPI_CREATE">
              <PermissionGuard permission="USERS_MANAGE">
                <Card data-testid="user-kpi-assign-section">
                  <form onSubmit={assign} className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="user-kpi-assign-select">Assign a KPI</Label>
                      <Select
                        id="user-kpi-assign-select"
                        value={assignKpiId || candidates[0]?.id || ''}
                        onChange={(e) => setAssignKpiId(e.target.value)}
                        disabled={assigning || candidates.length === 0}
                        data-testid="user-kpi-assign-select"
                      >
                        {candidates.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.name}
                          </option>
                        ))}
                        {candidates.length === 0 && <option value="">No per-person KPI left to assign</option>}
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="user-kpi-assign-target">Target (optional)</Label>
                      <Input
                        id="user-kpi-assign-target"
                        type="number"
                        step="any"
                        value={assignTarget}
                        onChange={(e) => setAssignTarget(e.target.value)}
                        disabled={assigning || candidates.length === 0}
                        data-testid="user-kpi-assign-target"
                      />
                    </div>
                    <Button
                      type="submit"
                      isLoading={assigning}
                      disabled={candidates.length === 0}
                      data-testid="user-kpi-assign-button"
                    >
                      Assign
                    </Button>
                    {candidates.length === 0 && allKpis.data && (
                      <p className="text-xs text-content-muted sm:col-span-3">
                        Only KPIs recorded per person can be assigned here.{' '}
                        <Link href="/kpis/new" className="font-medium text-accent-primary hover:underline">
                          Create one
                        </Link>
                      </p>
                    )}
                    {assignError && (
                      <p
                        role="alert"
                        data-testid="user-kpi-assign-error"
                        className="text-sm text-status-critical sm:col-span-3"
                      >
                        {assignError}
                      </p>
                    )}
                  </form>
                </Card>
              </PermissionGuard>
            </PermissionGuard>
          )}

          {notFound ? null : rows === null && !error ? (
            <Card>
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </Card>
          ) : rows && rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={UserSquare2}
                title="No KPIs assigned"
                description="This person holds no KPIs of their own yet."
              />
              <span data-testid="user-kpis-empty" className="sr-only" />
            </Card>
          ) : rows ? (
            <Card className="overflow-hidden p-0" data-testid="user-kpis-list">
              {rows.map((r, i) => (
                <div
                  key={r.assignmentId}
                  className={
                    'grid grid-cols-[2fr_1fr_1.1fr_auto] items-center gap-3 px-4 py-3.5' +
                    (i ? ' border-t border-border-divider' : '')
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <ScopeBadge scope="PER_USER" />
                    <Link
                      href={`/kpis/${r.kpiId}`}
                      className="font-semibold text-content-strong hover:text-accent-primary"
                    >
                      {r.name}
                    </Link>
                  </span>
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold text-content-strong">
                      {r.currentValue ?? '—'}
                      {r.unit ? ` ${r.unit}` : ''}
                    </span>
                    {r.targetValue !== null && (
                      <span className="text-content-muted"> / {r.targetValue}</span>
                    )}
                  </span>
                  <span className="justify-self-end">
                    <StatusBadge status={toStatus(r.status)} />
                  </span>
                  <PermissionGuard permission="KPI_CREATE">
                    <PermissionGuard permission="USERS_MANAGE">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-status-critical hover:bg-status-critical-bg"
                        data-testid={`user-kpi-remove-${r.assignmentId}`}
                        onClick={() => void removeKpi(r)}
                      >
                        Remove
                      </Button>
                    </PermissionGuard>
                  </PermissionGuard>
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      </RequirePermission>
    </AppShell>
  );
}
