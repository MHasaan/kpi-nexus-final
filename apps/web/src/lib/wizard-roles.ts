import { DEFAULT_ROLES, type OnboardingDraftInput } from '@kpi-nexus/contracts';

import { nameKey } from './wizard-structure';

type Draft = OnboardingDraftInput;
type Role = NonNullable<Draft['roles']>[number];

/** The standard roles this draft does not have yet — the same four a plain registration creates. */
export function standardRolesToAdd(roles: readonly Role[]): Role[] {
  const have = new Set(roles.map((r) => nameKey(r.name)));
  return DEFAULT_ROLES.filter((r) => !have.has(nameKey(r.name))).map((r) => ({
    name: r.name,
    isAdmin: r.isAdmin,
    level: r.level,
    color: r.color,
    permissions: [...r.permissions],
  }));
}

/**
 * Whether this is the only administrator role. It cannot be removed or made
 * an ordinary role: an organisation nobody can administer cannot be created.
 */
export function isLastAdminRole(roles: readonly Role[], index: number): boolean {
  return Boolean(roles[index]?.isAdmin) && roles.filter((r) => r.isAdmin).length === 1;
}

/** Tick or untick one permission on a role. */
export function togglePermission(role: Role, key: string): Role {
  const current = role.permissions ?? [];
  return { ...role, permissions: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] };
}

/** Give a role every permission in `keys`, or take them all away. */
export function setPermissions(role: Role, keys: readonly string[], granted: boolean): Role {
  const current = role.permissions ?? [];
  const rest = current.filter((k) => !keys.includes(k));
  return { ...role, permissions: granted ? [...rest, ...keys] : rest };
}

const follow = (value: string | undefined, from: string, to: string): string | undefined =>
  value !== undefined && nameKey(value) === from ? to : value;

function retarget(draft: Draft, field: 'role' | 'position', from: string, to: string | null): Draft['team'] | undefined {
  if (!from || !draft.team?.some((p) => nameKey(p[field]) === from)) return undefined;
  return draft.team.map((person) => {
    if (nameKey(person[field]) !== from) return person;
    if (to !== null) return { ...person, [field]: follow(person[field], from, to) };
    const { [field]: _dropped, ...rest } = person;
    return rest;
  });
}

/** Rename a role, and on everyone invited with it. */
export function renameRole(draft: Draft, index: number, name: string): Partial<Draft> {
  const roles = draft.roles ?? [];
  const team = retarget(draft, 'role', nameKey(roles[index]?.name), name);
  return { roles: roles.map((r, i) => (i === index ? { ...r, name } : r)), ...(team ? { team } : {}) };
}

/** Remove a role; people invited with it are left with none (they can be given one later). */
export function removeRole(draft: Draft, index: number): Partial<Draft> {
  const roles = draft.roles ?? [];
  const team = retarget(draft, 'role', nameKey(roles[index]?.name), null);
  return { roles: roles.filter((_, i) => i !== index), ...(team ? { team } : {}) };
}

/** Rename a position, and on everyone invited with it. */
export function renamePosition(draft: Draft, index: number, name: string): Partial<Draft> {
  const positions = draft.positions ?? [];
  const team = retarget(draft, 'position', nameKey(positions[index]?.name), name);
  return { positions: positions.map((p, i) => (i === index ? { ...p, name } : p)), ...(team ? { team } : {}) };
}

/** Remove a position; people invited with it are left with none. */
export function removePosition(draft: Draft, index: number): Partial<Draft> {
  const positions = draft.positions ?? [];
  const team = retarget(draft, 'position', nameKey(positions[index]?.name), null);
  return { positions: positions.filter((_, i) => i !== index), ...(team ? { team } : {}) };
}

export const POSITION_TRACK_OPTIONS = [
  { value: 'INDIVIDUAL_CONTRIBUTOR', label: 'Individual contributor' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'EXECUTIVE', label: 'Executive' },
] as const;

/** The track to show for a stored value (`IC` is the same thing as `INDIVIDUAL_CONTRIBUTOR`). */
export function trackValue(track: string | undefined): string {
  return !track || track === 'IC' ? 'INDIVIDUAL_CONTRIBUTOR' : track;
}
