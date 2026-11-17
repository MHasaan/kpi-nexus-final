'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  Ban,
  MailX,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import { UserEditPanel } from '../../components/users/user-edit-panel';
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
  cancelInvite,
  clearTokens,
  getAccessToken,
  inviteUser,
  listPositions,
  listRoles,
  listUsers,
  meRequest,
  offboardUser,
  purgeUser,
  reactivateUser,
  resendInvite,
  restoreUser,
  suspendUser,
  type PositionSummary,
  type RoleSummary,
  type UserSummary,
} from '../../lib/api-client';
import { inviteFeedback, type InviteFeedback } from '../../lib/invite-feedback';
import { useConfirm } from '../../lib/use-confirm';
import { useToast } from '../../lib/use-toast';
import { directoryTab, successorCandidates, userActions } from '../../lib/user-directory';
import {
  pluralize,
  useTerminology,
} from '../../lib/terminology-context';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { useAllowed } from '../../lib/use-allowed';

export default function UsersPage() {
  return (
    <UsersPageInner />
  );
}

function UsersPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  // What the archive dialog's two pickers hold; read when it is confirmed.
  const archiveChoice = useRef({ transferKpisTo: '', reparentDirectReportsTo: '' });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lifecycle filter + per-row action state
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteManagerId, setInviteManagerId] = useState('');
  const [invitePositionId, setInvitePositionId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<InviteFeedback | null>(null);

  // Nothing is asked for until the person is known to be allowed this page.
  const allowed = useAllowed('USERS_VIEW');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    void refresh();
    // Who is signed in: they cannot change their own role (the API refuses it).
    meRequest()
      .then(({ user }) => setMeId(user.id))
      .catch(() => undefined);
  }, [router, allowed]);

  async function refresh() {
    setLoadError(null);
    try {
      const [usersData, rolesData, positionsData] = await Promise.all([
        listUsers(),
        listRoles(),
        // Positions only fill a picker: without them the page still works.
        listPositions().catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 403) return [];
          throw err;
        }),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
      setPositions(positionsData);
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
    setInviteNotice(null);
    const email = inviteEmail.trim();
    try {
      const result = await inviteUser({
        email,
        fullName: inviteName.trim(),
        roleId: inviteRoleId || undefined,
        managerId: inviteManagerId || undefined,
        positionId: invitePositionId || undefined,
      });
      setInviteEmail('');
      setInviteName('');
      setInviteRoleId('');
      setInviteManagerId('');
      setInvitePositionId('');
      // Say whether the email really went out (UI-016). A link the server hands
      // back (outside production), or an unsent invitation, stays on the page.
      const feedback = inviteFeedback(result, email);
      if (feedback.tone === 'success') toast.success(feedback.title, feedback.description);
      else toast.error(feedback.title, feedback.description);
      setInviteNotice(feedback.url || feedback.tone === 'error' ? feedback : null);
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

  // Suspended people stay under Active; purged people and withdrawn invitations are in neither list.
  const visibleUsers = useMemo(() => {
    if (!users) return users;
    return users.filter((u) => directoryTab(u.status) === statusFilter);
  }, [users, statusFilter]);

  async function handleResend(user: UserSummary) {
    setBusyUserId(user.id);
    try {
      const feedback = inviteFeedback(await resendInvite(user.id), user.email);
      if (feedback.tone === 'success') toast.success(feedback.title, feedback.description);
      else toast.error(feedback.title, feedback.description);
      setInviteNotice(feedback.url || feedback.tone === 'error' ? feedback : null);
    } catch (err) {
      toast.error('Could not resend the invitation', err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusyUserId(null);
    }
  }

  const handleCancelInvite = (user: UserSummary) =>
    confirm({
      title: `Cancel the invitation for ${user.fullName}?`,
      description: `The link sent to ${user.email} stops working. You can invite this address again later.`,
      confirmLabel: 'Cancel invitation',
      cancelLabel: 'Keep it',
      tone: 'danger',
      testId: 'user-cancel-invite-confirm',
      action: async () => {
        await cancelInvite(user.id);
        if (editingId === user.id) setEditingId(null);
        await refresh();
        toast.success('Invitation cancelled');
      },
    });

  const handleArchive = (user: UserSummary) => {
    archiveChoice.current = { transferKpisTo: '', reparentDirectReportsTo: '' };
    const successors = successorCandidates(users ?? [], user.id);
    const picker = (key: 'transferKpisTo' | 'reparentDirectReportsTo', label: string, none: string, testId: string) => (
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-content-strong">{label}</span>
        <Select
          defaultValue=""
          onChange={(e) => {
            archiveChoice.current[key] = e.target.value;
          }}
          data-testid={testId}
        >
          <option value="">{none}</option>
          {successors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </Select>
      </label>
    );
    return confirm({
      title: `Archive ${user.fullName}?`,
      description:
        'They can no longer sign in and leave their units. What they recorded is kept, and you can restore them later.',
      body: (
        <>
          {picker('transferKpisTo', 'Hand the KPIs they own to', '(nobody — leave them without an owner)', 'archive-transfer-kpis')}
          {picker('reparentDirectReportsTo', 'People who report to them now report to', '(nobody)', 'archive-reassign-reports')}
        </>
      ),
      confirmLabel: 'Archive',
      tone: 'danger',
      testId: 'user-archive-confirm',
      action: async () => {
        const { transferKpisTo, reparentDirectReportsTo } = archiveChoice.current;
        await offboardUser(user.id, {
          ...(transferKpisTo ? { transferKpisTo } : {}),
          ...(reparentDirectReportsTo ? { reparentDirectReportsTo } : {}),
        });
        if (editingId === user.id) setEditingId(null);
        await refresh();
        toast.success(`${user.fullName} was archived`);
      },
    });
  };

  const handleRestore = (user: UserSummary) =>
    runLifecycleAction(user.id, async () => {
      const restored = await restoreUser(user.id);
      toast.success(
        `${user.fullName} was restored`,
        restored.status === 'INVITED' ? 'They never accepted their invitation — send it again.' : undefined,
      );
    });

  const handlePurge = (user: UserSummary) =>
    confirm({
      title: `Permanently remove ${user.fullName}?`,
      description:
        'Their name, email and sign-in are erased and cannot be recovered. What they recorded stays, without their name.',
      confirmLabel: 'Remove permanently',
      tone: 'danger',
      confirmText: user.email,
      testId: 'user-purge-confirm',
      action: async () => {
        await purgeUser(user.id);
        await refresh();
        toast.success('Person removed');
      },
    });

  // Someone can report to anyone who is still part of the organisation.
  const managerCandidates = useMemo(
    () => (users ?? []).filter((u) => u.status === 'ACTIVE' || u.status === 'INVITED' || u.status === 'PENDING_VERIFICATION'),
    [users],
  );

  const editingUser = users?.find((u) => u.id === editingId) ?? null;

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
                <Card data-testid="users-empty">
                  <EmptyState
                    icon={UsersIcon}
                    title={
                      statusFilter === 'archived'
                        ? `No archived ${memberLabelPlural.toLowerCase()}`
                        : `No ${memberLabelPlural.toLowerCase()} yet`
                    }
                    description={
                      statusFilter === 'archived'
                        ? `Archived ${memberLabelPlural.toLowerCase()} appear here, and can be restored.`
                        : `Invite your first ${memberLabelLower} to get started.`
                    }
                  />
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
                                  onEdit={() => setEditingId(user.id)}
                                  onResend={() => void handleResend(user)}
                                  onCancelInvite={() => void handleCancelInvite(user)}
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
                                  onArchive={() => void handleArchive(user)}
                                  onRestore={() => void handleRestore(user)}
                                  onPurge={() => void handlePurge(user)}
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
              <div className="flex flex-col gap-6 lg:sticky lg:top-2">
              {editingUser && (
                <UserEditPanel
                  user={editingUser}
                  isSelf={editingUser.id === meId}
                  roles={roles ?? []}
                  positions={positions}
                  people={managerCandidates}
                  roleLabel={terminology.roleLabel}
                  onSaved={refresh}
                  onClose={() => setEditingId(null)}
                />
              )}
              <Card data-testid="invite-section">
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
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-manager-select">Reports to</Label>
                    <Select
                      id="invite-manager-select"
                      value={inviteManagerId}
                      onChange={(e) => setInviteManagerId(e.target.value)}
                      disabled={inviting || !users}
                      data-testid="invite-manager-select"
                    >
                      <option value="">(nobody)</option>
                      {managerCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {positions.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="invite-position-select">Position</Label>
                      <Select
                        id="invite-position-select"
                        value={invitePositionId}
                        onChange={(e) => setInvitePositionId(e.target.value)}
                        disabled={inviting}
                        data-testid="invite-position-select"
                      >
                        <option value="">(no position)</option>
                        {positions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
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
                  {inviteNotice && (
                    <div
                      role={inviteNotice.tone === 'error' ? 'alert' : 'status'}
                      data-testid={inviteNotice.tone === 'error' ? 'invite-email-warning' : 'invite-success'}
                      className={
                        inviteNotice.tone === 'error'
                          ? 'rounded-md border border-status-warning/40 bg-status-warning-bg px-3 py-2.5 text-sm text-content-strong'
                          : 'rounded-md border border-status-success/40 bg-status-success-bg px-3 py-2.5 text-sm text-status-success'
                      }
                    >
                      <p className="font-medium">{inviteNotice.title}</p>
                      <p className="mt-0.5 text-xs">{inviteNotice.description}</p>
                      {inviteNotice.url && (
                        <a
                          href={inviteNotice.url}
                          className="mt-1 block break-all font-mono text-xs underline"
                          data-testid="invite-accept-url"
                        >
                          {inviteNotice.url}
                        </a>
                      )}
                    </div>
                  )}
                </form>
              </Card>
              </div>
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
  onEdit,
  onResend,
  onCancelInvite,
  onSuspend,
  onReactivate,
  onArchive,
  onRestore,
  onPurge,
}: {
  user: UserSummary;
  busy: boolean;
  onEdit: () => void;
  onResend: () => void;
  onCancelInvite: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const actions = userActions(user.status);
  const can = (action: (typeof actions)[number]) => actions.includes(action);
  return (
    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {can('edit') && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          leftIcon={<Pencil aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-edit-${user.email}`}
        >
          Edit
        </Button>
      )}
      {can('resend') && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={busy}
          onClick={onResend}
          leftIcon={<Send aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-resend-${user.email}`}
        >
          Resend invite
        </Button>
      )}
      {can('cancel-invite') && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancelInvite}
          leftIcon={<MailX aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-cancel-invite-${user.email}`}
          className="text-status-critical hover:bg-status-critical-bg"
        >
          Cancel invite
        </Button>
      )}
      {can('suspend') && (
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
      {can('reactivate') && (
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
      {can('archive') && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onArchive}
          leftIcon={<Archive aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-archive-${user.email}`}
        >
          Archive
        </Button>
      )}
      {can('restore') && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={busy}
          onClick={onRestore}
          leftIcon={<RotateCcw aria-hidden className="h-3.5 w-3.5" />}
          data-testid={`user-restore-${user.email}`}
        >
          Restore
        </Button>
      )}
      {can('purge') && (
        <Button
          size="sm"
          variant="danger"
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
