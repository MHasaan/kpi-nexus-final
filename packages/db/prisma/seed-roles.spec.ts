/**
 * Guards the demo seed's RBAC data against the canonical contracts
 * (audit BE-002 / BE-011). Pure — no database.
 */
import { DOMAIN_DEFAULT_SCOPE, DomainSchema, PermissionKey, ScopeSchema } from '@kpi-nexus/contracts';
import { describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS, ROLE_INHERITANCE, ROLE_SPECS } from './seed-roles.js';

const CANONICAL = new Set<string>(Object.values(PermissionKey));
const byName = new Map(ROLE_SPECS.map((r) => [r.name, r]));

/** Effective permissions under the resolver's rule: a child inherits its parent's (transitively). */
function effective(roleName: string, seen = new Set<string>()): Set<string> {
  if (seen.has(roleName)) return new Set();
  seen.add(roleName);
  const perms = new Set<string>(byName.get(roleName)!.permissions);
  for (const e of ROLE_INHERITANCE) {
    if (e.child === roleName && e.inheritsPermissions) for (const p of effective(e.parent, seen)) perms.add(p);
  }
  return perms;
}

describe('seed roles (BE-011): only canonical keys', () => {
  it('ALL_PERMISSIONS is exactly the canonical PermissionKey set', () => {
    expect(new Set(ALL_PERMISSIONS)).toEqual(CANONICAL);
  });

  it.each(ROLE_SPECS.map((r) => [r.name, r] as const))('%s: every permission is a real PermissionKey', (_n, role) => {
    expect(role.permissions.filter((p) => !CANONICAL.has(p))).toEqual([]);
  });

  it.each(ROLE_SPECS.map((r) => [r.name, r] as const))('%s: scopeConfig uses real domains + scopes', (_n, role) => {
    for (const [domain, scope] of Object.entries(role.scopeConfig ?? {})) {
      expect(DomainSchema.safeParse(domain).success, `domain ${domain}`).toBe(true);
      expect(ScopeSchema.safeParse(scope).success, `scope ${scope}`).toBe(true);
    }
  });
});

describe('seed role inheritance (BE-002): never grants more than a role declares', () => {
  it('every edge references seeded roles', () => {
    for (const e of ROLE_INHERITANCE) {
      expect(byName.has(e.parent), e.parent).toBe(true);
      expect(byName.has(e.child), e.child).toBe(true);
    }
  });

  it.each(ROLE_SPECS.map((r) => [r.name] as const))('%s: effective permissions == declared permissions', (name) => {
    expect([...effective(name)].sort()).toEqual([...byName.get(name)!.permissions].sort());
  });

  it('the Contributor really is least-privilege (the audited regression: it inherited Department Manager rights)', () => {
    const contributor = effective('Contributor');
    for (const p of ['KPI_CREATE', 'KPI_EDIT', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'GROUPS_VIEW']) {
      expect(contributor.has(p), p).toBe(false);
    }
  });
});

// QA-M4 (plan 5.6): the seeded Department Manager saw fewer OKRs than the
// Contributor, because the manager's role narrowed OKRs to "their units" while
// the contributor's left the default — the whole organisation.
describe('seed role scopes: a more senior role never sees less than a more junior one', () => {
  const rank = (scope: string) => ScopeSchema.options.indexOf(scope as (typeof ScopeSchema.options)[number]);
  const effective = (role: (typeof ROLE_SPECS)[number], domain: (typeof DomainSchema.options)[number]) =>
    (role.scopeConfig as Record<string, string> | undefined)?.[domain] ?? DOMAIN_DEFAULT_SCOPE[domain];
  const ranked = ROLE_SPECS.filter((r) => !r.isAdmin);

  for (const domain of DomainSchema.options) {
    it(`${domain}: scope does not shrink with seniority`, () => {
      const offenders: string[] = [];
      for (const senior of ranked) {
        for (const junior of ranked) {
          if (senior.level >= junior.level) continue; // a lower level number is more senior
          const s = effective(senior, domain);
          const j = effective(junior, domain);
          if (rank(s) < rank(j)) offenders.push(`${senior.name} (${s}) < ${junior.name} (${j})`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
