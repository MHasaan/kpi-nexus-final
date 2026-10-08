'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, ChevronDown, Network, Plus, UserPlus, Users } from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { OrgUnitReorg } from '../../components/org-unit-reorg';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import { cn } from '../../lib/cn';
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
import { currentLoginRedirect } from '../../lib/auth-redirect';

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
      router.replace(currentLoginRedirect());
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
        router.replace(currentLoginRedirect());
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load org units');
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
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create org unit');
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
      setLoadError(err instanceof ApiError ? err.message : `Failed to delete ${unit.name}`);
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
      setMembersError(err instanceof ApiError ? err.message : 'Failed to load members');
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
      setAddMemberError(err instanceof ApiError ? err.message : 'Failed to add member');
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
      setMembersError(err instanceof ApiError ? err.message : 'Failed to remove member');
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

  // Depth of each unit in the tree (for the indented tree view).
  function depthOf(unit: OrgUnitSummary): number {
    let depth = 0;
    let current: OrgUnitSummary | undefined = unit;
    const seen = new Set<string>();
    while (current?.parentUnitId && !seen.has(current.id)) {
      seen.add(current.id);
      current = unitsById.get(current.parentUnitId);
      if (!current) break;
      depth += 1;
    }
    return depth;
  }

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
  const groupLabelLower = terminology.groupLabel.toLowerCase();

  return (
    <AppShell title={groupLabelPlural} crumbs={['People', groupLabelPlural]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={groupLabelPlural}
          titleTestId="org-units-heading"
          subtitle={
            <>
              Build the {groupLabelLower} hierarchy — members drive PER_UNIT KPI visibility.
            </>
          }
          actions={
            <PermissionGuard permission="GROUPS_MANAGE">
              <Button
                leftIcon={<Plus aria-hidden className="h-4 w-4" />}
                onClick={() => document.getElementById('unit-name-input')?.focus()}
              >
                New {groupLabelLower}
              </Button>
            </PermissionGuard>
          }
        />

        {loadError && (
          <div
            role="alert"
            data-testid="org-units-load-error"
            className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <PermissionGuard permission="GROUPS_MANAGE">
          <Card data-testid="create-unit-section">
            <div className="border-b border-border-divider px-4 py-3.5">
              <h2 className="text-sm font-semibold text-content-strong">
                Create a {groupLabelLower}
              </h2>
            </div>
            <form
              onSubmit={handleCreate}
              className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unit-name-input" required>
                  Name
                </Label>
                <Input
                  id="unit-name-input"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                  data-testid="unit-name-input"
                  placeholder="Engineering"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unit-parent-select">Parent</Label>
                <Select
                  id="unit-parent-select"
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  disabled={creating || !units}
                  data-testid="unit-parent-select"
                >
                  <option value="">(top level)</option>
                  {units?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unit-description-input">Description</Label>
                <Input
                  id="unit-description-input"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  disabled={creating}
                  data-testid="unit-description-input"
                  placeholder="(optional)"
                />
              </div>
              <Button type="submit" isLoading={creating} data-testid="unit-submit-button">
                {creating ? 'Creating…' : 'Create'}
              </Button>
              {createError && (
                <p
                  role="alert"
                  data-testid="unit-error"
                  className="text-sm text-status-critical sm:col-span-4"
                >
                  {createError}
                </p>
              )}
            </form>
          </Card>
        </PermissionGuard>

        <section data-testid="units-list-section">
          {units === null && !loadError ? (
            <Card>
              <div className="flex flex-col gap-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </Card>
          ) : units && units.length === 0 ? (
            <Card>
              <EmptyState
                icon={Network}
                title={`No ${groupLabelPlural.toLowerCase()} yet`}
                description="Create one above to start building the org structure."
              />
              <span data-testid="units-empty" className="sr-only" />
            </Card>
          ) : units ? (
            <ul className="flex flex-col gap-3" data-testid="units-list">
              {units.map((unit) => {
                const parent = unit.parentUnitId ? unitsById.get(unit.parentUnitId) : null;
                const isExpanded = expandedUnitId === unit.id;
                const depth = depthOf(unit);
                return (
                  <li key={unit.id} data-testid={`unit-row-${unit.name}`}>
                    <Card className="overflow-hidden">
                      <div
                        className="flex flex-wrap items-start justify-between gap-3 p-4"
                        style={{ paddingInlineStart: 16 + depth * 20 }}
                      >
                        <div className="flex items-start gap-2.5">
                          {depth === 0 ? (
                            <Building2 aria-hidden className="mt-0.5 h-4 w-4 text-content-muted" />
                          ) : (
                            <Users aria-hidden className="mt-0.5 h-4 w-4 text-content-muted" />
                          )}
                          <div>
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-content-strong">
                              {unit.name}
                              <Badge tone="neutral" className="font-mono text-[10px]">
                                {unit.status}
                              </Badge>
                            </h3>
                            {parent && (
                              <p className="mt-0.5 text-xs text-content-muted">
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
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleExpand(unit)}
                            data-testid={`expand-unit-${unit.name}`}
                            rightIcon={
                              <ChevronDown
                                aria-hidden
                                className={cn(
                                  'h-3.5 w-3.5 transition-transform',
                                  isExpanded && 'rotate-180',
                                )}
                              />
                            }
                          >
                            {isExpanded ? 'Hide members' : 'Members'}
                          </Button>
                          <PermissionGuard permission="GROUPS_MANAGE">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDelete(unit)}
                              disabled={deletingId === unit.id}
                              data-testid={`delete-unit-${unit.name}`}
                              className="text-status-critical hover:bg-status-critical/10"
                            >
                              {deletingId === unit.id ? 'Deleting…' : 'Delete'}
                            </Button>
                          </PermissionGuard>
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          className="border-t border-border-divider bg-surface-1 p-4"
                          data-testid={`members-panel-${unit.name}`}
                        >
                          <div className="kn-eyebrow mb-2">Members</div>
                          {membersError && (
                            <p
                              role="alert"
                              data-testid="members-error"
                              className="mb-2 text-sm text-status-critical"
                            >
                              {membersError}
                            </p>
                          )}
                          {membersLoading && (
                            <div className="flex flex-col gap-2">
                              <Skeleton className="h-8 w-full" />
                              <Skeleton className="h-8 w-2/3" />
                            </div>
                          )}
                          {unitMembers &&
                            unitMembers.filter((m) => !m.leftAt).length === 0 && (
                              <p className="text-sm text-content-muted">No active members.</p>
                            )}
                          {unitMembers && (
                            <ul className="flex flex-col gap-1.5">
                              {unitMembers
                                .filter((m) => !m.leftAt)
                                .map((m) => {
                                  const user = usersById.get(m.userId);
                                  return (
                                    <li
                                      key={m.id}
                                      data-testid={`unit-member-${m.userId}`}
                                      className="flex items-center justify-between rounded-md bg-surface-bg px-3 py-2 text-sm"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className="text-content-strong">
                                          {user?.fullName ?? user?.email ?? m.userId}
                                        </span>
                                        <Badge
                                          tone={
                                            m.memberRole === 'MANAGER' ? 'info' : 'neutral'
                                          }
                                          className="font-mono text-[10px]"
                                        >
                                          {m.memberRole}
                                        </Badge>
                                      </span>
                                      <PermissionGuard permission="GROUPS_MANAGE">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleRemoveMember(unit.id, m.userId)
                                          }
                                          data-testid={`remove-member-${m.userId}`}
                                          className="text-xs font-medium text-status-critical hover:underline"
                                        >
                                          Remove
                                        </button>
                                      </PermissionGuard>
                                    </li>
                                  );
                                })}
                            </ul>
                          )}

                          <PermissionGuard permission="GROUPS_MANAGE">
                            <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`add-member-select-${unit.id}`}>
                                  Add a {terminology.memberLabel.toLowerCase()}
                                </Label>
                                <Select
                                  id={`add-member-select-${unit.id}`}
                                  value={memberUserId}
                                  onChange={(e) => setMemberUserId(e.target.value)}
                                  disabled={addingMember || availableUsers.length === 0}
                                  data-testid="add-member-select"
                                >
                                  <option value="">
                                    (select a {terminology.memberLabel.toLowerCase()})
                                  </option>
                                  {availableUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.fullName} · {u.email}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`add-member-role-${unit.id}`}>Role</Label>
                                <Select
                                  id={`add-member-role-${unit.id}`}
                                  value={memberRole}
                                  onChange={(e) =>
                                    setMemberRole(e.target.value as OrgUnitMemberRole)
                                  }
                                  disabled={addingMember}
                                  data-testid="add-member-role"
                                >
                                  <option value="MEMBER">Member</option>
                                  <option value="LEAD">Lead</option>
                                  <option value="MANAGER">Manager</option>
                                  <option value="DEPUTY">Deputy</option>
                                </Select>
                              </div>
                              <Button
                                onClick={() => void handleAddMember(unit)}
                                disabled={addingMember || !memberUserId}
                                isLoading={addingMember}
                                data-testid="add-member-button"
                                leftIcon={<UserPlus aria-hidden className="h-4 w-4" />}
                              >
                                Add
                              </Button>
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
                          </PermissionGuard>

                          {unitMembers && (
                            <OrgUnitReorg
                              unit={unit}
                              allUnits={units ?? []}
                              members={unitMembers}
                              onRefresh={async () => {
                                await refresh();
                                if (expandedUnitId) {
                                  try {
                                    const refreshed =
                                      await listOrgUnitMembers(expandedUnitId);
                                    setUnitMembers(refreshed);
                                  } catch {
                                    // ignore
                                  }
                                }
                              }}
                            />
                          )}
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
