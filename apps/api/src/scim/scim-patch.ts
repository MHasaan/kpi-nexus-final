/**
 * Pure SCIM (RFC 7644) parsing helpers. No Nest/Prisma so they unit-test in
 * isolation. IdPs differ (Okta sends both flat and PatchOp shapes), so these
 * are deliberately lenient.
 */

export interface ScimUserPatch {
  active?: boolean;
  displayName?: string;
}

function coerceBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const l = v.trim().toLowerCase();
    if (l === 'true') return true;
    if (l === 'false') return false;
  }
  return undefined;
}

function displayNameFrom(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.displayName === 'string') return obj.displayName;
  const name = obj.name as { formatted?: string; givenName?: string; familyName?: string } | undefined;
  if (name) {
    if (typeof name.formatted === 'string') return name.formatted;
    const parts = [name.givenName, name.familyName].filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (parts.length > 0) return parts.join(' ');
  }
  return undefined;
}

function applyFlat(patch: ScimUserPatch, source: Record<string, unknown>): void {
  const active = coerceBool(source.active);
  if (active !== undefined) patch.active = active;
  const dn = displayNameFrom(source);
  if (dn !== undefined) patch.displayName = dn;
}

export function flattenScimUserPatch(body: unknown): ScimUserPatch {
  const patch: ScimUserPatch = {};
  const b = (body ?? {}) as Record<string, unknown>;

  if (Array.isArray(b.Operations)) {
    for (const raw of b.Operations as Array<Record<string, unknown>>) {
      const op = String(raw.op ?? '').toLowerCase();
      if (op === 'remove') continue; // unsupported on user attrs — ignore
      if (op !== 'replace' && op !== 'add') continue;
      const path = typeof raw.path === 'string' ? raw.path.toLowerCase() : undefined;
      if (path === 'active') {
        const active = coerceBool(raw.value);
        if (active !== undefined) patch.active = active;
      } else if (path === 'displayname') {
        if (typeof raw.value === 'string') patch.displayName = raw.value;
      } else if (!path && raw.value && typeof raw.value === 'object') {
        applyFlat(patch, raw.value as Record<string, unknown>);
      }
    }
    return patch;
  }

  applyFlat(patch, b);
  return patch;
}

/** Parse `<attr> eq "value"` (case-insensitive attr/op, single or double quotes). */
export function parseEqFilter(filter: string | undefined, attr: string): string | null {
  if (!filter) return null;
  const re = new RegExp(`${attr}\\s+eq\\s+["']([^"']+)["']`, 'i');
  const m = filter.match(re);
  return m ? m[1]! : null;
}

/** Parse Okta's `members[value eq "<id>"]` membership patch path. */
export function parseMemberValueFilter(path: string | undefined): string | null {
  if (!path) return null;
  const m = path.match(/members\[\s*value\s+eq\s+["']([^"']+)["']\s*\]/i);
  return m ? m[1]! : null;
}
