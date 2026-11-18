/**
 * What a role gets from the roles above it. An edge `{ parentRoleId, childRoleId }`
 * means the child inherits the parent's permissions — the direction the API's
 * permission resolver walks.
 */
export interface RoleEdge {
  parentRoleId: string;
  childRoleId: string;
}

interface RoleLite {
  id: string;
  name: string;
  permissions: string[];
}

/**
 * The roles `roleId` inherits from, nearest first, and the permissions they add
 * to its own (sorted). A loop in the data is walked once and no further.
 */
export function inheritedFrom(roleId: string, roles: readonly RoleLite[], edges: readonly RoleEdge[]): { from: string[]; permissions: string[] } {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const own = new Set(byId.get(roleId)?.permissions ?? []);
  const seen = new Set<string>([roleId]);
  const from: string[] = [];
  const added = new Set<string>();
  let frontier = [roleId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of edges) {
        if (edge.childRoleId !== id || seen.has(edge.parentRoleId)) continue;
        seen.add(edge.parentRoleId);
        const parent = byId.get(edge.parentRoleId);
        if (!parent) continue;
        from.push(parent.name);
        for (const p of parent.permissions) if (!own.has(p)) added.add(p);
        next.push(parent.id);
      }
    }
    frontier = next;
  }
  return { from, permissions: [...added].sort() };
}
