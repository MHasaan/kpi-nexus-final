'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  addOrgUnitMember,
  ApiError,
  clearTokens,
  createOrgUnit,
  deleteOrgUnit,
  getAccessToken,
  listOrgUnitMembers,
  listOrgUnits,
  listUsers,
  removeOrgUnitMember,
  type OrgUnitMember,
  type OrgUnitMemberRole,
  type OrgUnitSummary,
  type UserSummary,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

export default function OrgUnitsPage() {
  return (
    <TerminologyProvider>
      <OrgUnitsPageInner />
    </TerminologyProvider>
  );
}

function OrgUnitsPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [units, setUnits] = useState<OrgUnitSummary[] | null>(null);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create-unit form state
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Per-unit expansion state (which unit's members are visible)
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [unitMembers, setUnitMembers] = useState<OrgUnitMember[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Add-member form state
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<OrgUnitMemberRole>('MEMBER');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const [unitsData, usersData] = await Promise.all([listOrgUnits(), listUsers()]);
      setUnits(unitsData);
      setUsers(usersData);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load org units',
      );
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createOrgUnit({
        name: newName.trim(),
        parentUnitId: newParentId.trim() || undefined,
        description: newDescription.trim() || undefined,
      });
      setNewName('');
      setNewParentId('');
      setNewDescription('');
      await refresh();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Failed to create org unit',
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(unit: OrgUnitSummary) {
    setDeletingId(unit.id);
    try {
      await deleteOrgUnit(unit.id);
      if (expandedUnitId === unit.id) {
        setExpandedUnitId(null);
        setUnitMembers(null);
      }
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : `Failed to delete ${unit.name}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExpand(unit: OrgUnitSummary) {
    if (expandedUnitId === unit.id) {
      setExpandedUnitId(null);
      setUnitMembers(null);
      return;
    }
    setExpandedUnitId(unit.id);
    setMembersLoading(true);
    setMembersError(null);
    setUnitMembers(null);
    setMemberUserId('');
    setMemberRole('MEMBER');
    try {
      const data = await listOrgUnitMembers(unit.id);
      setUnitMembers(data);
    } catch (err) {
      setMembersError(
        err instanceof ApiError ? err.message : 'Failed to load members',
      );
    } finally {
      setMembersLoading(false);
    }
  }

  async function handleAddMember(unit: OrgUnitSummary) {
    setAddingMember(true);
    setAddMemberError(null);
    try {
      await addOrgUnitMember(unit.id, { userId: memberUserId, memberRole });
      const refreshed = await listOrgUnitMembers(unit.id);
      setUnitMembers(refreshed);
      setMemberUserId('');
    } catch (err) {
      setAddMemberError(
        err instanceof ApiError ? err.message : 'Failed to add member',
      );
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(unitId: string, userId: string) {
    try {
      await removeOrgUnitMember(unitId, userId);
      const refreshed = await listOrgUnitMembers(unitId);
      setUnitMembers(refreshed);
    } catch (err) {
      setMembersError(
        err instanceof ApiError ? err.message : 'Failed to remove member',
      );
    }
  }

  const unitsById = useMemo(() => {
    const map = new Map<string, OrgUnitSummary>();
    for (const u of units ?? []) map.set(u.id, u);
    return map;
  }, [units]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserSummary>();
    for (const u of users ?? []) map.set(u.id, u);
    return map;
  }, [users]);

  // Users who can be added to the currently expanded unit — exclude those
  // already in it (active membership: leftAt = null).
  const availableUsers = useMemo(() => {
    if (!users || !unitMembers) return users ?? [];
    const activeMemberIds = new Set(
      unitMembers.filter((m) => !m.leftAt).map((m) => m.userId),
    );
    return users.filter((u) => !activeMemberIds.has(u.id));
  }, [users, unitMembers]);

  const groupLabelPlural = pluralize(terminology.groupLabel);

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
            <nav className="flex flex-wrap gap-4 text-sm">
              <Link href="/dashboard" className="text-content-muted hover:text-content-strong">
                Dashboard
              </Link>
              <Link href="/users" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.memberLabel)}
              </Link>
              <Link href="/roles" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link href="/positions" className="text-content-muted hover:text-content-strong">
                Positions
              </Link>
              <Link
                href="/org-units"
                className="font-medium text-accent-primary"
                data-testid="nav-org-units"
              >
                {groupLabelPlural}
              </Link>
              <Link href="/profile" className="text-content-muted hover:text-content-strong">
                Profile
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
            data-testid="org-units-heading"
          >
            {groupLabelPlural}
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            The organization's structural tree. A {terminology.groupLabel.toLowerCase()}{' '}
            can have a parent (creating a hierarchy) and members (the{' '}
            {pluralize(terminology.memberLabel.toLowerCase())} who belong to it).
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="org-units-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <section
          className="mb-8 rounded-lg border border-border bg-surface-1 p-6"
          data-testid="create-unit-section"
        >
          <h2 className="text-lg font-semibold text-content-strong">
            Create a {terminology.groupLabel.toLowerCase()}
          </h2>
          <form
            onSubmit={handleCreate}
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
          >
            <label className="block">
              <span className="text-sm font-medium text-content-default">Name</span>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                data-testid="unit-name-input"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="Engineering"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Parent</span>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                disabled={creating || !units}
                data-testid="unit-parent-select"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              >
                <option value="">(top level)</option>
                {units?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Description</span>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={creating}
                data-testid="unit-description-input"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="(optional)"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              data-testid="unit-submit-button"
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
          {createError && (
            <p
              role="alert"
              data-testid="unit-error"
              className="mt-3 text-sm text-status-critical"
            >
              {createError}
            </p>
          )}
        </section>

        <section data-testid="units-list-section">
          {units === null && !loadError && (
            <p className="text-sm text-content-muted">
              Loading {groupLabelPlural.toLowerCase()}…
            </p>
          )}
          {units && units.length === 0 && (
            <p
              className="text-sm text-content-muted"
              data-testid="units-empty"
            >
              No {groupLabelPlural.toLowerCase()} yet. Create one above.
            </p>
          )}
          {units && units.length > 0 && (
            <ul className="space-y-3" data-testid="units-list">
              {units.map((unit) => {
                const parent = unit.parentUnitId
                  ? unitsById.get(unit.parentUnitId)
                  : null;
                const isExpanded = expandedUnitId === unit.id;
                return (
                  <li
                    key={unit.id}
                    className="rounded-lg border border-border bg-surface-1"
                    data-testid={`unit-row-${unit.name}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div>
                        <h3 className="text-base font-semibold text-content-strong">
                          {unit.name}
                          <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-content-default">
                            {unit.status}
                          </span>
                        </h3>
                        {parent && (
                          <p className="mt-0.5 text-sm text-content-muted">
                            Parent:{' '}
                            <span className="font-medium text-content-default">
                              {parent.name}
                            </span>
                          </p>
                        )}
                        {unit.description && (
                          <p className="mt-1 text-sm text-content-muted">
                            {unit.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleExpand(unit)}
                          data-testid={`expand-unit-${unit.name}`}
                          className="rounded-md border border-border px-3 py-1.5 text-sm text-content-default transition hover:bg-surface-2"
                        >
                          {isExpanded ? 'Hide members' : 'Members'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(unit)}
                          disabled={deletingId === unit.id}
                          data-testid={`delete-unit-${unit.name}`}
                          className="rounded-md border border-border px-3 py-1.5 text-sm text-status-critical transition hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === unit.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div
                        className="border-t border-border bg-surface-bg p-4"
                        data-testid={`members-panel-${unit.name}`}
                      >
                        <h4 className="text-sm font-semibold text-content-strong">
                          Members
                        </h4>
                        {membersError && (
                          <p
                            role="alert"
                            data-testid="members-error"
                            className="mt-2 text-sm text-status-critical"
                          >
                            {membersError}
                          </p>
                        )}
                        {membersLoading && (
                          <p className="mt-2 text-sm text-content-muted">Loading…</p>
                        )}
                        {unitMembers && unitMembers.filter((m) => !m.leftAt).length === 0 && (
                          <p className="mt-2 text-sm text-content-muted">
                            No active members.
                          </p>
                        )}
                        {unitMembers && (
                          <ul className="mt-2 space-y-1.5 text-sm">
                            {unitMembers
                              .filter((m) => !m.leftAt)
                              .map((m) => {
                                const user = usersById.get(m.userId);
                                return (
                                  <li
                                    key={m.id}
                                    data-testid={`unit-member-${m.userId}`}
                                    className="flex items-center justify-between rounded bg-surface-1 px-3 py-1.5"
                                  >
                                    <span>
                                      {user?.email ?? m.userId}{' '}
                                      <span className="ml-1 rounded bg-accent-primary/10 px-1.5 py-0.5 text-xs font-medium text-accent-primary">
                                        {m.memberRole}
                                      </span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveMember(unit.id, m.userId)}
                                      data-testid={`remove-member-${m.userId}`}
                                      className="text-xs text-status-critical hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </li>
                                );
                              })}
                          </ul>
                        )}

                        <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                          <label className="block">
                            <span className="text-sm font-medium text-content-default">
                              Add a {terminology.memberLabel.toLowerCase()}
                            </span>
                            <select
                              value={memberUserId}
                              onChange={(e) => setMemberUserId(e.target.value)}
                              disabled={addingMember || availableUsers.length === 0}
                              data-testid="add-member-select"
                              className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                            >
                              <option value="">(select a {terminology.memberLabel.toLowerCase()})</option>
                              {availableUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.email}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-content-default">Role</span>
                            <select
                              value={memberRole}
                              onChange={(e) =>
                                setMemberRole(e.target.value as OrgUnitMemberRole)
                              }
                              disabled={addingMember}
                              data-testid="add-member-role"
                              className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                            >
                              <option value="MEMBER">Member</option>
                              <option value="LEAD">Lead</option>
                              <option value="MANAGER">Manager</option>
                              <option value="DEPUTY">Deputy</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleAddMember(unit)}
                            disabled={addingMember || !memberUserId}
                            data-testid="add-member-button"
                            className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {addingMember ? 'Adding…' : 'Add'}
                          </button>
                        </div>
                        {addMemberError && (
                          <p
                            role="alert"
                            data-testid="add-member-error"
                            className="mt-2 text-sm text-status-critical"
                          >
                            {addMemberError}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
