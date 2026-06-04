# Granular Access — Phase 3.5: ResourcePermission Wiring — Implementation Plan

> Execute with superpowers:subagent-driven-development. TDD per task.

**Goal:** Wire the dormant `ResourcePermission` (built in P1, never consulted) so a per-entity grant
**additively** unlocks access to a specific resource — even when the principal's role/scope wouldn't.
Resolution-order step 6 ("ResourcePermission, now wired"). Spec: `2026-06-01-granular-access-control-design.md` §5.4/§8.

**Current state (verified):**
- `ResourcePermission` model exists (`subjectType user|role`, `subjectId`, `action String`, `resourceType`,
  `resourceId`, `expiresAt`). `action` is a free string.
- `PermissionResolverService.hasResourcePermission(action, resourceType, resourceId)` is **implemented but
  never called**, and it uses `RequestContextStore.require()` (works only inside the request context).
- `PermissionsGuard` runs **before** the context interceptor — it reads `request.user` directly. So it
  CANNOT call the context-based `hasResourcePermission`.
- No `@RequireResourceAccess` decorator. `@OwnerOverride` + the guard's owner block are the pattern to mirror.
- `AccessProfile` has no `resourceGrants`.

**Parity:** purely additive. No route changes behaviour unless a ResourcePermission row exists for the
principal. Admin bypass unchanged. All existing tests stay green.

---

## Task 1 — Canonical action enum + DTO validation

**Files:** `packages/contracts/src/access.ts` (or a new `resource-actions.ts`) + `packages/contracts/src/index.ts`;
`apps/api/src/resource-permissions/dto/create-resource-permission.dto.ts`; a contracts spec.

- [ ] Add to contracts: `export const ResourceActionSchema = z.enum(['view','edit','delete','data_entry','manage']); export type ResourceAction = z.infer<typeof ResourceActionSchema>;` and export it from the package index.
- [ ] Change the DTO's `action` from `z.string()...` to `ResourceActionSchema` (canonical; rejects unknown verbs with 400).
- [ ] Test (contracts or api): a valid action parses; an unknown verb (`"frobnicate"`) fails.
- [ ] Verify the existing resource-permissions controller/service still typecheck (action is now a union, not string — adjust any `string` annotations to `ResourceAction`).
- [ ] Commit `feat(contracts): canonical ResourceAction enum + validate grant DTO (Phase 3.5)`.

## Task 2 — `@RequireResourceAccess` decorator + guard wiring

**Files:** new `apps/api/src/rbac/decorators/require-resource-access.decorator.ts`;
`apps/api/src/rbac/services/permission-resolver.service.ts` (add explicit-params method);
`apps/api/src/rbac/guards/permissions.guard.ts`; guard + resolver specs.

- [ ] **Decorator** (mirror `@OwnerOverride`):
  ```ts
  export const REQUIRE_RESOURCE_ACCESS_KEY = 'rbac:require_resource_access';
  export interface ResourceAccessConfig { resourceType: string; paramKey: string; action: ResourceAction; }
  export const RequireResourceAccess = (resourceType: string, paramKey: string, action: ResourceAction) =>
    SetMetadata(REQUIRE_RESOURCE_ACCESS_KEY, { resourceType, paramKey, action } satisfies ResourceAccessConfig);
  ```
- [ ] **Resolver** — add a guard-friendly method that does the same query WITHOUT `RequestContextStore`:
  ```ts
  async hasResourceGrant(organizationId: string, principal: { userId: string; roleId: string | null }, action: string, resourceType: string, resourceId: string): Promise<boolean> {
    const now = new Date();
    const expiry = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const userGrant = await this.prisma.resourcePermission.findFirst({ where: { organizationId, subjectType: 'user', subjectId: principal.userId, action, resourceType, resourceId, ...expiry }, select: { id: true } });
    if (userGrant) return true;
    if (principal.roleId) {
      const roleGrant = await this.prisma.resourcePermission.findFirst({ where: { organizationId, subjectType: 'role', subjectId: principal.roleId, action, resourceType, resourceId, ...expiry }, select: { id: true } });
      if (roleGrant) return true;
    }
    return false;
  }
  ```
  Refactor the existing context-based `hasResourcePermission` to read ctx then delegate to `hasResourceGrant` (keep its signature for service-layer callers).
- [ ] **Guard** — in `PermissionsGuard.canActivate`, after the `@OwnerOverride` block and BEFORE the `requireAll/requireAny` throws, insert:
  ```ts
  const resourceAccess = this.reflector.getAllAndOverride<ResourceAccessConfig | undefined>(REQUIRE_RESOURCE_ACCESS_KEY, [context.getHandler(), context.getClass()]);
  if (resourceAccess) {
    const resourceId = request.params?.[resourceAccess.paramKey];
    if (resourceId && await this.resolver.hasResourceGrant(principal.organizationId, { userId: principal.userId, roleId: principal.roleId }, resourceAccess.action, resourceAccess.resourceType, resourceId)) {
      return true; // additive per-entity grant unlocks this resource
    }
  }
  ```
  (Admins already returned true above; api-key principals are handled in their own branch and do NOT get resource grants — leave that branch unchanged.)
- [ ] Tests: guard allows when a matching grant exists despite missing capability; denies when neither capability nor grant; capability-holder still allowed; expired grant ignored; role-grant honoured. Mirror the existing guard spec harness.
- [ ] Commit `feat(rbac): @RequireResourceAccess decorator + additive grant wiring in PermissionsGuard (Phase 3.5)`.

## Task 3 — Fold resolved grants into AccessProfile + dashboards end-to-end

So a `view`/`manage` grant on a specific dashboard ALSO makes the service return it (not just the guard pass).

**Files:** `packages/contracts/src/access.ts` (AccessProfile); `apps/api/src/rbac/services/access-context.service.ts`;
`apps/api/src/dashboards/dashboards.service.ts`; specs.

- [ ] Contract: add `resourceGrants: z.array(z.object({ resourceType: z.string(), resourceId: z.string(), action: ResourceActionSchema }))` to `AccessProfileSchema` (default `[]`).
- [ ] `AccessContextService.resolveForCurrentPrincipal`: for non-admins, query the principal's ResourcePermission rows (user `subjectId=userId` ∪ role `subjectId=roleId`, non-expired) and set `profile.resourceGrants`. Admin ⇒ `[]` (they bypass). Cache with the profile. Add a helper `grantedResourceIds(resourceType, action): string[]`.
- [ ] `dashboards.service.visibilityWhere`: after building the scope OR for non-admins, OR-in `{ id: { in: grantedDashboardIds } }` where `grantedDashboardIds` = profile.resourceGrants filtered to `resourceType==='dashboard' && (action==='view'||'manage')`. (If the scope is ORG, no OR exists — grants are already covered. Only add the branch when an OR is being built.)
- [ ] Tests: a non-admin at SELF scope with a `view` grant on dashboard X sees X in `list()` and `getById('X')` (was 404 before); without the grant ⇒ 404.
- [ ] Commit `feat(access): resolve ResourcePermission grants into AccessProfile + honour on dashboards (Phase 3.5)`.

## Task 4 — Apply to entity routes + full suite + memory

**Files:** `apps/api/src/dashboards/dashboards.controller.ts` (+ optionally `kpis.controller.ts`); memory.

- [ ] Add `@RequireResourceAccess('dashboard', 'id', 'view')` to `GET dashboards/:id` and `@RequireResourceAccess('dashboard','id','manage')` to `PATCH/DELETE dashboards/:id` (alongside the existing `@RequirePermissions`). This makes a per-dashboard grant unlock that dashboard for a principal lacking the broad `DASHBOARD_VIEW/MANAGE`.
- [ ] (Optional, if cheap) same for `kpis/:id` with `action='view'/'edit'/'delete'` — but the kpi service would also need grant-awareness to be end-to-end; if not wiring the kpi service this round, SKIP kpis to avoid a guard-passes-service-404s incoherence. Dashboards is the representative end-to-end domain.
- [ ] Run the full API suite (`pnpm --filter @kpi-nexus/api exec vitest run`) — all green. Typecheck clean. `nest build` OK.
- [ ] (Optional) live smoke: grant devon a `view` ResourcePermission on a dashboard sara owns; confirm devon (DASHBOARDS=SELF) can now GET it; revoke ⇒ 404.
- [ ] Update memory; commit `feat(dashboards): @RequireResourceAccess on detail routes + Phase 3.5 verification/memory`.

## Out of scope
- Resource grants on every domain's visibility builder (only dashboards wired end-to-end this round; the
  guard-level grant works for any route you decorate, but list-scoping is dashboards-only).
- Resource-grant admin UI (Phase 6b/Access Center can add it later).
- Delegation/owner-override changes (unchanged).
