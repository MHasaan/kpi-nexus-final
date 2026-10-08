'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  Ban,
  Play,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeTone,
} from '../../components/ui';
import {
  ApiError,
  clearTokens,
  getAccessToken,
  inviteUser,
  listRoles,
  listUsers,
  offboardUser,
  purgeUser,
  reactivateUser,
  suspendUser,
  type RoleSummary,
  type UserSummary,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';
import { currentLoginRedirect } from '../../lib/auth-redirect';

export default function UsersPage() {
  return (
    <TerminologyProvider>
      <UsersPageInner />
    </TerminologyProvider>
  );
}

function UsersPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lifecycle filter + per-row action state
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

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
      const [usersData, rolesData] = await Promise.all([listUsers(), listRoles()]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      // 403 USERS_VIEW missing is still a loadError — surface it, don't crash
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load users');
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviting(true);
    setInviteError(null);
    setLastInviteUrl(null);
    try {
      const result = await inviteUser({
        email: inviteEmail.trim(),
        fullName: inviteName.trim(),
        roleId: inviteRoleId.trim() || undefined,
      });
      setInviteEmail('');
      setInviteName('');
      setInviteRoleId('');
      if (result.acceptUrl) {
        // dev mode — surface the link so the admin can copy/test it without
        // reading the api log
        setLastInviteUrl(result.acceptUrl);
      }
      await refresh();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  }

  async function runLifecycleAction(
    userId: string,
    action: () => Promise<unknown>,
  ) {
    setBusyUserId(userId);
    setLoadError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      // Surface API rejections (e.g. offboard needs reassignment) without crashing
      setLoadError(
        err instanceof ApiError ? err.message : 'Action failed',
      );
    } finally {
      setBusyUserId(null);
    }
  }

  const memberLabelPlural = pluralize(terminology.memberLabel);
  const memberLabelLower = terminology.memberLabel.toLowerCase();

  // Default hides ARCHIVED/DELETED; the "Archived" toggle reveals ARCHIVED/SUSPENDED.
  const visibleUsers = useMemo(() => {
    if (!users) return users;
    return users.filter((u) =>
      statusFilter === 'archived'
        ? u.status === 'ARCHIVED' || u.status === 'SUSPENDED'
        : u.status !== 'ARCHIVED' && u.status !== 'DELETED',
    );
  }, [users, statusFilter]);

  return (
    <AppShell title={memberLabelPlural} crumbs={['People', memberLabelPlural]}>
      <RequirePermission permission="USERS_VIEW">
        <div className="flex flex-col gap-6">
          <PageHeader
            title={memberLabelPlural}
            titleTestId="users-heading"
            subtitle={
              <>
                Directory, invite &amp; manage status — invited{' '}
                {memberLabelPlural.toLowerCase()} stay{' '}
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-content-default">
                  INVITED
                </span>{' '}
                until they accept.
              </>
            }
            actions={
              <PermissionGuard permission="USERS_MANAGE">
                <Button
                  leftIcon={<UserPlus aria-hidden className="h-4 w-4" />}
                  onClick={() =>
                    document.getElementById('invite-email-input')?.focus()
                  }
                >
                  Invite {memberLabelLower}
                </Button>
              </PermissionGuard>
            }
          />

          {loadError && (
            <div
              role="alert"
              data-testid="users-load-error"
              className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
            >
              {loadError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
            <section data-testid="users-list-section">
              <div className="mb-4 flex items-center justify-between gap-3">
                <Segmented
                  aria-label="Filter by lifecycle status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
              </div>
              {users === null && !loadError ? (
                <Card>
                  <div className="flex flex-col gap-3 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                </Card>
              ) : visibleUsers && visibleUsers.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={UsersIcon}
                    title={
                      statusFilter === 'archived'
                        ? `No archived ${memberLabelPlural.toLowerCase()}`
                        : `No ${memberLabelPlural.toLowerCase()} yet`
                    }
                    description={
                      statusFilter === 'archived'
                        ? `Suspended and archived ${memberLabelPlural.toLowerCase()} will appear here.`
                        : `Invite your first ${memberLabelLower} to get started.`
                    }
                  />
                  <span data-testid="users-list" className="sr-only" />
                </Card>
              ) : visibleUsers ? (
                <Card className="overflow-hidden p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Manager</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>{terminology.roleLabel}</TableHead>
                        <PermissionGuard permission="USERS_MANAGE">
                          <TableHead className="text-right">Actions</TableHead>
                        </PermissionGuard>
                      </TableRow>
                    </TableHeader>
                    <TableBody data-testid="users-list">
                      {visibleUsers.map((user) => {
                        const role = roles?.find((r) => r.id === user.roleId);
                        const managerName =
                          users?.find((u) => u.id === user.managerId)?.fullName ?? '—';
                        const dim =
                          user.status === 'ARCHIVED' ||
                          user.status === 'SUSPENDED' ||
                          user.status === 'DELETED';
                        return (
                          <TableRow
                            key={user.id}
                            data-testid={`user-row-${user.email}`}
                            className={dim ? 'opacity-60' : undefined}
                          >
                            <TableCell>
                              <Link
                                href={`/users/${user.id}`}
                                className="inline-flex items-center gap-2.5 hover:text-accent-primary"
                              >
                                <Avatar name={user.fullName} size="sm" />
                                <span className="font-semibold">{user.fullName}</span>
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-content-muted">
                              {user.email}
                            </TableCell>
                            <TableCell className="text-content-default">
                              {managerName}
                            </TableCell>
                            <TableCell>
                              <UserStatusBadge status={user.status} />
                            </TableCell>
                            <TableCell className="text-content-default">
                              {role?.name ?? '—'}
                            </TableCell>
                            <PermissionGuard permission="USERS_MANAGE">
                              <TableCell className="text-right">
                                <UserLifecycleActions
                                  user={user}
                                  busy={busyUserId === user.id}
                                  onSuspend={() =>
                                    runLifecycleAction(user.id, () =>
                                      suspendUser(user.id),
                                    )
                                  }
                                  onReactivate={() =>
                                    runLifecycleAction(user.id, () =>
                                      reactivateUser(user.id),
                                    )
                                  }
                                  onArchive={() =>
                                    runLifecycleAction(user.id, () =>
                                      offboardUser(user.id),
                                    )
                                  }
                                  onPurge={() => {
                                    if (
                                      !window.confirm(
                                        `Permanently purge ${user.fullName}? This cannot be undone.`,
                                      )
                                    )
                                      return;
                                    void runLifecycleAction(user.id, () =>
                                      purgeUser(user.id),
                                    );
                                  }}
                                />
                              </TableCell>
                            </PermissionGuard>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              ) : null}
            </section>

            <PermissionGuard permission="USERS_MANAGE">
              <Card data-testid="invite-section" className="lg:sticky lg:top-2">
                <div className="border-b border-border-divider px-4 py-3.5">
                  <h2 className="text-sm font-semibold text-content-strong">
                    Invite a {memberLabelLower}
                  </h2>
                  <p className="mt-1 text-xs text-content-muted">
                    They'll receive a one-time link to set a password and sign in.
                  </p>
                </div>
                <form onSubmit={handleInvite} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-email-input" required>
                      Email
                    </Label>
                    <Input
                      id="invite-email-input"
                      required
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={inviting}
                      data-testid="invite-email-input"
                      placeholder="alice@example.com"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-name-input" required>
                      Full name
                    </Label>
                    <Input
                      id="invite-name-input"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      disabled={inviting}
                      data-testid="invite-name-input"
                      placeholder="Alice Lee"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-role-select">{terminology.roleLabel}</Label>
                    <Select
                      id="invite-role-select"
                      value={inviteRoleId}
                      onChange={(e) => setInviteRoleId(e.target.value)}
                      disabled={inviting || !roles}
                      data-testid="invite-role-select"
                    >
                      <option value="">(no {terminology.roleLabel.toLowerCase()})</option>
                      {roles?.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    type="submit"
                    isLoading={inviting}
                    data-testid="invite-submit-button"
                    className="w-full"
                  >
                    {inviting ? 'Sending…' : 'Send invite'}
                  </Button>
                  {inviteError && (
                    <p
                      role="alert"
                      data-testid="invite-error"
                      className="text-sm text-status-critical"
                    >
                      {inviteError}
                    </p>
                  )}
                  {lastInviteUrl && (
                    <div
                      data-testid="invite-success"
                      className="rounded-md border border-status-success/40 bg-status-success-bg px-3 py-2.5 text-sm text-status-success"
                    >
                      <p className="font-medium">
                        Invite created — share the accept URL:
                      </p>
                      <a
                        href={lastInviteUrl}
                        className="mt-1 block break-all font-mono text-xs underline"
                        data-testid="invite-accept-url"
                      >
                        {lastInviteUrl}
                      </a>
                    </div>
                  )}
                </form>
              </Card>
            </PermissionGuard>
          </div>
        </div>
      </RequirePermission>
    </AppShell>
  );
}

function UserLifecycleActions({
  user,
  busy,
  onSuspend,
  onReactivate,
  onArchive,
  onPurge,
}: {
  user: UserSummary;
  busy: boolean;
  onSuspend: () => void;
  onReactivate: () => void;
  onArchive: () => void;
  onPurge: () => void;
}) {
  const archived = user.status === 'ARCHIVED' || user.status === 'DELETED';
  return (
    <div className="inline-flex items-center justify-end gap-1.5">
      {user.status === 'ACTIVE' && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={busy}
          onClick={onSuspend}
          leftIcon={<Ban aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-suspend-${user.email}`}
        >
          Suspend
        </Button>
      )}
      {user.status === 'SUSPENDED' && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={busy}
          onClick={onReactivate}
          leftIcon={<Play aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-reactivate-${user.email}`}
        >
          Reactivate
        </Button>
      )}
      {!archived && (
        <Button
          size="sm"
          variant="ghost"
          isLoading={busy}
          onClick={onArchive}
          leftIcon={<Archive aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-archive-${user.email}`}
        >
          Archive
        </Button>
      )}
      {user.status === 'ARCHIVED' && (
        <Button
          size="sm"
          variant="danger"
          isLoading={busy}
          onClick={onPurge}
          leftIcon={<Trash2 aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-purge-${user.email}`}
        >
          Purge
        </Button>
      )}
    </div>
  );
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
