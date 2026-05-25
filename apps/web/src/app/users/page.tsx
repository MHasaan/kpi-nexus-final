'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  inviteUser,
  listRoles,
  listUsers,
  type RoleSummary,
  type UserSummary,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

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

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
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
        router.replace('/login');
        return;
      }
      // 403 USERS_VIEW missing is still a loadError — surface it, don't crash
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load users',
      );
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
      setInviteError(
        err instanceof ApiError ? err.message : 'Failed to invite user',
      );
    } finally {
      setInviting(false);
    }
  }

  const memberLabelPlural = pluralize(terminology.memberLabel);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-content-muted hover:text-content-strong">
                Dashboard
              </Link>
              <Link
                href="/users"
                className="font-medium text-accent-primary"
                data-testid="nav-users"
              >
                {memberLabelPlural}
              </Link>
              <Link href="/roles" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link
                href="/settings/organization"
                className="text-content-muted hover:text-content-strong"
              >
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1
            className="text-2xl font-semibold text-content-strong"
            data-testid="users-heading"
          >
            {memberLabelPlural}
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            People with access to this organization. Invited{' '}
            {memberLabelPlural.toLowerCase()} stay in
            <span className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-content-default">
              INVITED
            </span>
            until they accept and set a password.
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="users-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <section
          className="mb-8 rounded-lg border border-border bg-surface-1 p-6"
          data-testid="invite-section"
        >
          <h2 className="text-lg font-semibold text-content-strong">
            Invite a {terminology.memberLabel.toLowerCase()}
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            They'll receive a one-time link to set their password and sign in.
          </p>
          <form
            onSubmit={handleInvite}
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          >
            <label className="block">
              <span className="text-sm font-medium text-content-default">Email</span>
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviting}
                data-testid="invite-email-input"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="alice@example.com"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Full name</span>
              <input
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                disabled={inviting}
                data-testid="invite-name-input"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="Alice Lee"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">
                {terminology.roleLabel}
              </span>
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                disabled={inviting || !roles}
                data-testid="invite-role-select"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              >
                <option value="">(no role)</option>
                {roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={inviting}
              data-testid="invite-submit-button"
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </form>
          {inviteError && (
            <p
              role="alert"
              data-testid="invite-error"
              className="mt-3 text-sm text-status-critical"
            >
              {inviteError}
            </p>
          )}
          {lastInviteUrl && (
            <div
              data-testid="invite-success"
              className="mt-4 rounded-md border border-status-success/40 bg-status-success/10 px-4 py-3 text-sm text-status-success"
            >
              <p className="font-medium">
                Invitation sent. Dev-mode link (copy this to test the accept flow):
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
        </section>

        <section data-testid="users-list-section">
          {users === null && !loadError && (
            <p className="text-sm text-content-muted">
              Loading {memberLabelPlural.toLowerCase()}…
            </p>
          )}
          {users && users.length === 0 && (
            <p className="text-sm text-content-muted">
              No {memberLabelPlural.toLowerCase()} yet.
            </p>
          )}
          {users && users.length > 0 && (
            <ul className="space-y-3" data-testid="users-list">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="rounded-lg border border-border bg-surface-1 p-4"
                  data-testid={`user-row-${user.email}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-content-strong">
                        {user.fullName}
                      </h3>
                      <p className="mt-0.5 text-sm text-content-muted">
                        {user.email}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        <StatusBadge status={user.status} />
                        {user.roleId &&
                          (() => {
                            const role = roles?.find((r) => r.id === user.roleId);
                            return role ? (
                              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-content-default">
                                {role.name}
                              </span>
                            ) : null;
                          })()}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: UserSummary['status'] }) {
  const config = {
    INVITED: { label: 'invited', cls: 'bg-accent-primary/10 text-accent-primary' },
    PENDING_VERIFICATION: {
      label: 'pending verification',
      cls: 'bg-status-warning/10 text-status-warning',
    },
    ACTIVE: { label: 'active', cls: 'bg-status-success/10 text-status-success' },
    SUSPENDED: { label: 'suspended', cls: 'bg-status-warning/10 text-status-warning' },
    ARCHIVED: { label: 'archived', cls: 'bg-surface-2 text-content-muted' },
    DELETED: { label: 'deleted', cls: 'bg-surface-2 text-content-muted' },
  } as const;
  const { label, cls } = config[status];
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-medium ${cls}`}
      data-testid="user-status-badge"
    >
      {label}
    </span>
  );
}
