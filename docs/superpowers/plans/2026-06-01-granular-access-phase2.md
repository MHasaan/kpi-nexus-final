# Granular Access — Phase 2: Configurable & Enforced Scope

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Make per-domain **scope** configurable per role (`RoleDefinition.scopeConfig`) and actually
**enforce** it — the first phase where access narrows beyond parity. KPI list visibility is driven by the
configured scope ladder (`SELF ⊂ DIRECT_REPORTS ⊂ UNITS ⊂ ORG`); dashboards narrow shared-visibility by
scope. Default (unset) config == today's behaviour, so the 12-case KPI test + cross-tenant fuzz stay green.

**Architecture:** Extends Phase 0+1. `AccessContextService` now reads the role's `scopeConfig` (falling back
to the derived default `UNITS` for non-admins) and the KPI visibility builder branches on
`profile.scopeByDomain.KPIS`. Dashboards consult `scopeByDomain.DASHBOARDS`. Scope config is set via the
existing `PATCH /roles/:id` (ROLES_MANAGE), which invalidates the access/permission caches.

**Tech Stack:** NestJS 11 (Fastify) · Prisma 6 · Zod (`@kpi-nexus/contracts`) · Vitest · Next.js 15.

**Spec:** `docs/superpowers/specs/2026-06-01-granular-access-control-design.md` §3, §6, §8, §10 (Phase 2).

**Scope decision (grounded in code audit):** Only the **KPI** domain has a real scope model (ORG_WIDE/
PER_UNIT/PER_USER + orgUnit/user assignments). **Dashboards** have `ownerUserId` + `isShared` (narrowable by
scope without schema change). **Reports / Alerts / AlertRules / OKRs are effectively org-wide** with no scope
relations — meaningfully scoping them needs new visibility enums + assignment tables, so they are **DEFERRED to
a Phase 2.5** (schema-bearing) follow-up. This plan ships KPI + dashboard scope: real enforcement, low regression risk.

---

## Scope → `where` mapping (the crux — must stay parity-equal at `UNITS`)

For a **non-admin** principal, KPI list rows by configured `scopeByDomain.KPIS`:

| Scope | ORG_WIDE | PER_UNIT (orgUnitAssignments) | PER_USER (userAssignments) |
|---|---|---|---|
| `ORG` | all KPIs in tenant (no branches) | — | — |
| `UNITS` *(default = legacy)* | ✓ | managed ∪ member units | self ∪ reports |
| `DIRECT_REPORTS` | ✓ | *(none)* | self ∪ reports |
| `SELF` | ✓ | *(none)* | self only |

Admin ⇒ always all (unchanged). The default scope for every non-admin is `UNITS`, whose mapping is **exactly**
today's `buildKpiVisibilityWhere` output (managed∪member units + self∪reports) → parity holds when `scopeConfig`
is unset. An admin can narrow a role to `DIRECT_REPORTS`/`SELF` or widen to `ORG`.

Dashboards by `scopeByDomain.DASHBOARDS` (non-admin): `SELF` ⇒ `ownerUserId = me` only; `DIRECT_REPORTS`/
`UNITS`/`ORG` ⇒ `ownerUserId = me OR isShared` (today's behaviour). Default `UNITS` ⇒ parity.

---

## File structure

**Create**
- `packages/db/prisma/migrations/20260601030000_p_role_scope_config/migration.sql` — `RoleDefinition.scopeConfig jsonb`.

**Modify**
- `packages/contracts/src/access.ts` — `ScopeConfigSchema` (`Partial<Record<Domain,Scope>>`); export.
- `apps/api/src/rbac/services/access-context.service.ts` — default scope `UNITS`; merge role `scopeConfig`; `invalidateAll()`.
- `apps/api/src/rbac/services/access-context.service.spec.ts` — default `UNITS`; scopeConfig override test.
- `apps/api/src/rbac/visibility/kpi-visibility.ts` — `scope` on `KpiVisibilityContext`; `buildKpiVisibilityWhere` branches on it; bridge passes `scopeByDomain.KPIS`.
- `apps/api/src/rbac/visibility/kpi-visibility.spec.ts` — per-scope cases; parity (`UNITS` == legacy).
- `apps/api/src/dashboards/dashboards.service.ts` — scope-narrow `list()` via `AccessContextService`.
- `apps/api/src/dashboards/*.spec.ts` (or new) — SELF excludes shared.
- `apps/api/src/roles/dto/update-role.dto.ts` — optional `scopeConfig`.
- `apps/api/src/roles/roles.service.ts` — persist `scopeConfig`; surface on `PublicRole`; invalidate caches on update.
- `apps/api/src/roles/roles.service.spec.ts` (or controller spec) — update persists + clamps unknown domains.

---

## Task 1: `ScopeConfigSchema` contract

**Files:** Modify `packages/contracts/src/access.ts`; Test `packages/contracts/src/access.spec.ts`.

- [ ] **Step 1:** Add after `ScopeSchema`:
```ts
/** Layer-2 config — per-domain scope override on a role/override (partial; unset domain ⇒ default). */
export const ScopeConfigSchema = z.record(DomainSchema, ScopeSchema);
export type ScopeConfig = z.infer<typeof ScopeConfigSchema>;
```
- [ ] **Step 2:** Add a test: parses `{ KPIS: 'SELF', DASHBOARDS: 'ORG' }`; rejects `{ KPIS: 'NOPE' }`.
- [ ] **Step 3:** Build contracts: `pnpm --filter @kpi-nexus/contracts build`. Run the contracts spec → green.
- [ ] **Step 4: Commit** `feat(contracts): ScopeConfig (per-domain scope override)`.

## Task 2: `RoleDefinition.scopeConfig` migration

**Files:** Create the migration SQL; modify `packages/db/prisma/schema.prisma`.

- [ ] **Step 1:** Add to the `RoleDefinition` model (after `canAccessModules`): `scopeConfig Json?`.
- [ ] **Step 2:** Write `migration.sql` (additive, TimescaleDB-safe):
```sql
ALTER TABLE "RoleDefinition" ADD COLUMN IF NOT EXISTS "scopeConfig" jsonb;
```
- [ ] **Step 3:** Apply: kill the API server first (Prisma client DLL lock on Windows), then
  `pnpm --filter @kpi-nexus/db exec prisma migrate deploy` (or `db execute` the SQL) and `prisma generate`.
- [ ] **Step 4:** Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='RoleDefinition' AND column_name='scopeConfig';` returns the row.
- [ ] **Step 5: Commit** `feat(db): RoleDefinition.scopeConfig (additive)`.

## Task 3: AccessContextService — default `UNITS` + merge role scopeConfig

**Files:** Modify `access-context.service.ts` + spec.

- [ ] **Step 1:** Change the non-admin derived default to `UNITS` for every domain (parity with the KPI
  `UNITS` mapping). Replace the `defaultScope` derivation:
```ts
const defaultScope: Scope = isAdmin ? 'ORG' : 'UNITS';
```
- [ ] **Step 2:** Load the role's `scopeConfig` (direct role only this phase; inherited-role scope deferred)
  and merge per domain. After resolving capabilities, before building `scopeByDomain`:
```ts
let roleScope: Partial<Record<Domain, Scope>> = {};
if (!isAdmin && ctx.roleId) {
  const role = await this.prisma.roleDefinition.findUnique({
    where: { id: ctx.roleId },
    select: { scopeConfig: true },
  });
  const parsed = ScopeConfigSchema.safeParse(role?.scopeConfig ?? {});
  if (parsed.success) roleScope = parsed.data;
}
const scopeByDomain = Object.fromEntries(
  DOMAINS.map((d) => [d, isAdmin ? 'ORG' : (roleScope[d] ?? defaultScope)]),
) as Record<Domain, Scope>;
```
  (Import `ScopeConfigSchema` + `type Scope` from contracts.)
- [ ] **Step 3:** Add `invalidateAll(): void { this.cache.clear(); }`.
- [ ] **Step 4:** Update the spec: the "individual ⇒ DIRECT_REPORTS" test becomes "individual ⇒ UNITS default";
  add a test where a fake role `scopeConfig = { KPIS: 'SELF' }` ⇒ `profile.scopeByDomain.KPIS === 'SELF'`
  while another domain stays `UNITS`. (Extend `FakePrisma` with `roleDefinition.findUnique`.)
- [ ] **Step 5:** Run `vitest run src/rbac/services/access-context.service.spec.ts` → green.
- [ ] **Step 6: Commit** `feat(rbac): AccessContext merges role scopeConfig (default UNITS)`.

## Task 4: KPI visibility branches on scope

**Files:** Modify `kpi-visibility.ts` + spec.

- [ ] **Step 1:** Add `scope: Scope` to `KpiVisibilityContext` (import `type { Scope }` from contracts).
- [ ] **Step 2:** Rewrite `buildKpiVisibilityWhere` to branch (keep admin short-circuit):
```ts
if (ctx.isAdmin || ctx.scope === 'ORG') return { organizationId: ctx.organizationId };
const branches: KpiVisibilityOrBranch[] = [{ scope: 'ORG_WIDE' }];
if (ctx.scope === 'UNITS') {
  const orgUnitIds = uniq([...ctx.managedOrgUnitIds, ...ctx.memberOrgUnitIds]);
  if (orgUnitIds.length > 0) {
    branches.push({ scope: 'PER_UNIT', orgUnitAssignments: { some: { orgUnitId: { in: orgUnitIds } } } });
  }
}
const userIds = ctx.scope === 'SELF' ? [ctx.userId] : uniq([ctx.userId, ...ctx.directReportIds]);
branches.push({ scope: 'PER_USER', userAssignments: { some: { userId: { in: userIds } } } });
return { organizationId: ctx.organizationId, OR: branches };
```
- [ ] **Step 3:** `kpiContextFromProfile` sets `scope: profile.scopeByDomain.KPIS ?? 'UNITS'`.
- [ ] **Step 4:** Spec: add `scope` to the four role fixtures (ADMIN any; MANAGER/EMPLOYEE/VIEWER `'UNITS'`)
  so the existing 12-case matrix is unchanged (parity). Add a `describe('scope ladder')` block asserting:
  `SELF` ⇒ no PER_UNIT branch + PER_USER userIds == `[userId]`; `DIRECT_REPORTS` ⇒ no PER_UNIT + PER_USER
  includes reports; `ORG` ⇒ `{ organizationId }` only; and `UNITS` output `toEqual` the pre-change legacy
  output (parity). Update the bridge-parity block's `profileFor` to set `scopeByDomain.KPIS: ctx.scope`.
- [ ] **Step 5:** Run `vitest run src/rbac src/kpis src/nlq` → all green (parity preserved). `tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat(rbac): enforce KPI scope ladder (SELF/DIRECT_REPORTS/UNITS/ORG)`.

## Task 5: Dashboards narrow shared-visibility by scope

**Files:** Modify `dashboards.service.ts` (+ spec).

- [ ] **Step 1:** Inject `AccessContextService`. In `list()`, replace the `isShared` OR branch with a
  scope-aware one:
```ts
if (!profile.isAdmin) {
  const seeShared = profile.scopeByDomain.DASHBOARDS !== 'SELF';
  where.OR = seeShared
    ? [{ ownerUserId: ctx.userId }, { isShared: true }]
    : [{ ownerUserId: ctx.userId }];
}
```
  (Resolve `profile = await this.accessContext.resolveForCurrentPrincipal()`; keep the existing `isAdmin`
  short-circuit semantics — admin still sees all.)
- [ ] **Step 2:** Test: a non-admin with `DASHBOARDS:'SELF'` sees only own dashboards (shared excluded);
  default (`UNITS`) sees own + shared (parity). Mock prisma + AccessContextService.
- [ ] **Step 3:** Run the dashboards specs → green. `tsc --noEmit` clean.
- [ ] **Step 4: Commit** `feat(rbac): dashboards honour DASHBOARDS scope (SELF hides shared)`.

## Task 6: Persist scopeConfig via PATCH /roles/:id + cache invalidation

**Files:** Modify `update-role.dto.ts`, `roles.service.ts` (+ spec).

- [ ] **Step 1:** Add `scopeConfig: ScopeConfigSchema.optional()` to `UpdateRoleDtoSchema`.
- [ ] **Step 2:** In `RolesService.update`, write `scopeConfig` when present; include it in the `PublicRole`
  projection. After a successful update, invalidate caches: `this.accessContext.invalidateAll()` and the
  resolver's cache (add an `invalidateAll()` to `PermissionResolverService` if absent and call it). Inject
  both services into `RolesService`.
- [ ] **Step 3:** Test: `update(id, { scopeConfig: { KPIS: 'SELF' } })` persists + returns it; an invalid
  domain/scope is rejected at the DTO layer (400).
- [ ] **Step 4:** Run `vitest run src/roles` → green. `tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(roles): PATCH /roles/:id sets scopeConfig + invalidates access cache`.

## Task 7: Full verification (enforcement + parity gate)

- [ ] **Step 1:** Full API suite `pnpm --filter @kpi-nexus/api exec vitest run` → green except the known
  `onboarding-cleanup` flake. Full web suite → green. Both typechecks clean. `next build` → 64 routes.
- [ ] **Step 2:** Rebuild API (`pnpm --filter @kpi-nexus/api build`) + restart (`node --env-file=../../.env
  --env-file=.env dist/main.js` from `apps/api`).
- [ ] **Step 3:** Live smoke: set a non-admin demo role's `scopeConfig` to `{ KPIS: 'SELF' }` via
  `PATCH /roles/:id` (admin token); confirm that user's `GET /kpis` returns strictly fewer rows (only
  ORG_WIDE + their own PER_USER) than at `UNITS`, and admins are unaffected. Revert. `GET /auth/me` shows the
  configured `scopeByDomain.KPIS`.
- [ ] **Step 4: Commit** `test(rbac): verify Phase 2 scope enforcement + parity` (if fixtures changed).

---

## Deferred (explicit — do NOT silently skip)
- **Reports / Alerts / AlertRules / OKRs scope** — need schema (visibility enum + orgUnit/user assignment
  relations) before scope is meaningful → **Phase 2.5**.
- **Per-user scope override** (`UserAccessOverride`) → Phase 5.
- **Inherited-role scope merge** (most-restrictive across parent roles) → with Phase 5 resolver work.
- **Access Center role-scope editor UI** (the admin picker) → Phase 6. This phase sets scope via the API only
  (+ existing `/roles` Patch); a minimal FE picker is out of scope here.
