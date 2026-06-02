# Granular Access — Phase 5: Per-User Overrides

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** A per-user `UserAccessOverride` (one row per user) that, on top of the role, **grants/revokes
capabilities** and **overrides scope / data-type / limits** — the "assign permissions per user for every
aspect" mechanism. Unset ⇒ role value (parity); admins are immune.

**Architecture (from a 2-agent code audit — the load-bearing insight):**
- **Capability** grant/revoke MUST be applied in **`PermissionResolverService.resolveForUser`** — the
  `PermissionsGuard` calls it directly and never touches `AccessContextService`, so a capability change
  applied only in AccessContext would NOT gate endpoints. `AccessContextService` then inherits the merged
  capability set automatically (it reads `resolver.resolveForUser().permissions`).
- **Scope / dataType / limits** override is applied in **`AccessContextService`** (the only consumer),
  per-field REPLACE when set.
- Both services skip overrides for **admins**.

**Resolution (spec §3 step 3):** capabilities = `(roleCaps ∪ grant) − revoke` (revoke wins). scope/
dataType/limits: the override REPLACES the role's value per-field when present (matches "set data-type/
limits" + "tighten **or widen** scope"). `null`/absent ⇒ role value ⇒ parity.

**Tech Stack:** NestJS 11 · Prisma 6 · Zod (`@kpi-nexus/contracts`) · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-granular-access-control-design.md` §3, §4, §6, §7, §10 (Phase 5).

---

## Task 1: model + migration + contract
- [ ] **schema.prisma** — new `UserAccessOverride` (id, organizationId, userId, grantCapabilities String[],
  revokeCapabilities String[], scopeConfig Json?, dataTypeConfig Json?, dataLimits Json?, updatedById,
  createdAt, updatedAt; `@@unique([organizationId, userId])`, `@@index([organizationId])`; relations to
  Organization + User, both `onDelete: Cascade`). Add the back-relations on `User` + `Organization`.
  (`pageAccess` deferred to Phase 7.)
- [ ] **migration** `packages/db/prisma/migrations/20260603000000_p5_user_access_override/migration.sql` —
  hand-written CREATE TABLE + unique + index + 2 FKs (mirror existing generated SQL). Apply: kill API,
  `prisma db execute` + `migrate resolve --applied` + `prisma generate`.
- [ ] **contracts** `access.ts`: `UserAccessOverrideSchema = z.object({ grantCapabilities:
  z.array(PermissionKeySchema), revokeCapabilities: z.array(PermissionKeySchema), scopeConfig:
  ScopeConfigSchema.optional(), dataTypeConfig: DataTypeConfigSchema.optional(), dataLimits:
  DataLimitsConfigSchema.optional() })` (+ type) + test.
- [ ] **Commit** `feat(access): UserAccessOverride model + contract + migration`.

## Task 2: resolver integration
- [ ] **PermissionResolverService.resolveForUser** — after delegations, before cache.set: if `!isAdmin`,
  `const ov = await this.prisma.userAccessOverride.findFirst({ where: { organizationId, userId },
  select: { grantCapabilities: true, revokeCapabilities: true } });` then
  `ov?.grantCapabilities.forEach(p => permissions.add(p)); ov?.revokeCapabilities.forEach(p => permissions.delete(p));`.
  (Validate keys are real `PermissionKey` on the WRITE side, not here.) Admins skip.
- [ ] **AccessContextService** — add `loadUserOverride(orgId, userId)` (org-scoped findFirst, safeParse
  scope/dataType/limits). In `resolveForCurrentPrincipal`, after `loadRoleConfig`, if `!isAdmin` load the
  override and: `scopeByDomain[d] = override.scope[d] ?? roleConfig.scope[d] ?? default`;
  `kpiCategoryIds = override.dataType.kpiCategoryIds ?? roleConfig.dataType.kpiCategoryIds ?? null`;
  each dataLimit field `override.limits.X ?? roleConfig.limits.X ?? null`. (Capabilities already merged
  via the resolver.) A short comment explains the cross-cutting split.
- [ ] Tests: resolver spec (grant adds / revoke removes / revoke-wins / admin immune); access-context spec
  (override scope/dataType/limits replace role; admin immune; capability merge visible via resolver mock).
- [ ] **Commit** `feat(rbac): per-user override — capability grant/revoke + scope/type/limits replace`.

## Task 3: endpoint
- [ ] **DTO** `users/dto/upsert-access-override.dto.ts` = `UserAccessOverrideSchema` (partial-friendly).
- [ ] **users.service**: `getAccessOverride(userId)` (org-scoped) + `upsertAccessOverride(userId, dto)`:
  verify the user is in-tenant; tenant-validate `dataTypeConfig.kpiCategoryIds` (reuse the roles pattern);
  reject unknown capability keys (Zod `PermissionKeySchema` already does); `prisma.userAccessOverride.upsert`;
  then invalidate **both** caches for that user (`resolver.invalidate(org,userId)` +
  `accessContext.invalidate(org,userId)`). + `deleteAccessOverride(userId)` to clear. Inject the two services.
- [ ] **users.controller**: `GET/PUT/DELETE /users/:id/access-override` `@RequirePermissions(USERS_MANAGE)`.
- [ ] Tests: upsert persists + invalidates; unknown category ⇒ 400; get/delete.
- [ ] **Commit** `feat(users): /users/:id/access-override (USERS_MANAGE)`.

## Task 4: verify
- [ ] Full API + web suites + typecheck. Adversarial review (guard honors revoke; admin immunity in BOTH
  services; cross-tenant org-scoping of the override read/write; scope widen+narrow; cache coherency
  resolver+accessContext; capability key validation). Fix confirmed.
- [ ] Rebuild + restart. Live: pick a manager; `PUT /users/:id/access-override` revoking a capability +
  narrowing `scopeConfig.KPIS` to SELF → that user's gated endpoint 403s + `/kpis` shrinks, while a peer
  on the same role is unchanged; `GET` reflects it; `DELETE` restores. Admin unaffected.
- [ ] **Commit** `test(rbac): verify Phase 5 per-user overrides + parity`.

---

## Deferred (explicit)
- `pageAccess` override field → Phase 7 (page-access).
- Delegations (`PermissionDelegation`) already fold into the resolver — unchanged.
- Inherited-role merge for scope (most-restrictive across parents) still deferred.
- Per-user override editor UI → Phase 6 (Access Center).
