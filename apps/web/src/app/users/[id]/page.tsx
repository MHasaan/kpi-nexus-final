'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  PageHeader,
  ScopeBadge,
  Skeleton,
  StatusBadge,
  type BadgeTone,
  type KpiStatus,
} from '../../../components/ui';
import {
  ApiError,
  getAccessToken,
  listRoles,
  listUserKpis,
  listUsers,
  offboardUser,
  purgeUser,
  reactivateUser,
  suspendUser,
  type MyKpiRow,
  type RoleSummary,
  type UserSummary,
} from '../../../lib/api-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

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
  const [rows, setRows] = useState<MyKpiRow[] | null>(null);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const [kpiRows, usersData, rolesData] = await Promise.all([
        listUserKpis(params.id),
        listUsers(),
        listRoles(),
      ]);
      setRows(kpiRows);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void refresh();
  }, [params.id, router]);

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

  const user = users?.find((u) => u.id === params.id) ?? null;
  const roleName = user
    ? (roles?.find((r) => r.id === user.roleId)?.name ?? null)
    : null;
  const managerName = user?.managerId
    ? (users?.find((u) => u.id === user.managerId)?.fullName ?? null)
    : null;

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
              eyebrow="PER_USER KPI assignments"
              title="Assigned KPIs"
              subtitle="This person's personally-assigned KPIs with their recorded values."
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

          {user === null && users === null && !error ? (
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

          {rows === null && !error ? (
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
                description="This user has no PER_USER KPI assignments yet."
              />
              <span data-testid="user-kpis-empty" className="sr-only" />
            </Card>
          ) : rows ? (
            <Card className="overflow-hidden p-0" data-testid="user-kpis-list">
              {rows.map((r, i) => (
                <div
                  key={r.assignmentId}
                  className={
                    'grid grid-cols-[2fr_1fr_1.1fr] items-center gap-3 px-4 py-3.5' +
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
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      </RequirePermission>
    </AppShell>
  );
}
