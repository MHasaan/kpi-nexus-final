# Granular Access — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 7 carved-out capability keys (ADR-001) and build the shared **access foundation** —
an `AccessContextService` (units/reports/scope, cached), a resolved **AccessProfile** exposed on
`/auth/me`, a generalized visibility builder, and an FE `useAccess()` — all at **behavioral parity**
with today (no access change yet).

**Architecture:** Extend the locked RBAC (spec §5). Capabilities stay the source of truth for "can do
X"; a new per-request `AccessContext` centralizes the membership/manager resolution that 3 services
currently duplicate; `/auth/me` returns the full `AccessProfile` so the FE can later tailor views.

**Tech Stack:** NestJS 11 (Fastify) · Prisma 6 · Zod (`@kpi-nexus/contracts`) · Vitest · Next.js 15 · React 18.

**Spec:** `docs/superpowers/specs/2026-06-01-granular-access-control-design.md`.

**Conventions:** ESM imports use `.js` suffixes. Services read tenancy via `RequestContextStore.require()`.
Run a single API spec with `pnpm --filter @kpi-nexus/api exec vitest run <path>`. Web typecheck:
`pnpm --filter @kpi-nexus/web typecheck`. Commit per task.

---

## File structure

**Create**
- `apps/api/src/rbac/services/access-context.service.ts` — resolves the per-request access context (isAdmin, capabilities, managed/member units, recursive direct reports, default scope per domain), cached.
- `apps/api/src/rbac/services/access-context.service.spec.ts` — unit tests.
- `apps/api/src/rbac/access-profile.ts` — pure assembler `toAccessProfile(...)` → the `AccessProfile` DTO returned by `/auth/me`.
- `packages/contracts/src/access.ts` — `Domain`, `Scope`, `AccessProfile`, Zod schemas.
- `apps/web/src/lib/use-access.ts` — FE `useAccess()` hook (SSR-safe, mirrors `use-permissions.ts`).

**Modify**
- `packages/contracts/src/permissions.ts` — +7 capability keys; `PERMISSION_COUNT` 18→25.
- `packages/contracts/src/index.ts` — export `./access.js` (if barrel exists).
- `apps/api/src/auth/services/default-roles.ts` — grant new keys to presets.
- `apps/api/src/rbac/visibility/kpi-visibility.ts` — keep `buildKpiVisibilityWhere`; add `kpiContextFromProfile(profile)` adapter.
- `apps/api/src/kpis/kpis.service.ts`, `apps/api/src/kpis/kpi-data.service.ts`, `apps/api/src/nlq/nlq.service.ts` — replace the local `buildVisibilityContext()` with `AccessContextService`.
- `apps/api/src/rbac/rbac.module.ts` — provide/export `AccessContextService`.
- `apps/api/src/auth/auth.controller.ts` + its `me` path — return `accessProfile`.
- Report/audit/integrations/billing/kpi-import/forecast controllers — apply the new `@RequirePermissions`.
- `apps/web/src/components/app-shell.tsx` — nav gating for new keys (Audit→`AUDIT_VIEW`, etc.).
- `apps/web/src/lib/api-client.ts` — `AuthUser` gains `accessProfile`.
- `packages/db/prisma/migrations/<ts>_p_capability_refinement/migration.sql` — grant child keys to roles holding parent.

---

## PHASE 0 — Capability refinement (ADR-001)

### Task 1: Add the 7 capability keys

**Files:** Modify `packages/contracts/src/permissions.ts`; Test `packages/contracts/src/permissions.spec.ts` (create if absent).

- [ ] **Step 1: Write the failing test**

```ts
// packages/contracts/src/permissions.spec.ts
import { describe, it, expect } from 'vitest';
import { PermissionKey, ALL_PERMISSIONS, PERMISSION_COUNT } from './permissions.js';

describe('PermissionKey — refined capability set (ADR-001)', () => {
  it('includes the 7 carved-out keys', () => {
    for (const k of [
      'KPI_IMPORT', 'REPORTS_MANAGE', 'ANALYTICS_FORECAST',
      'EXPORTS', 'AUDIT_VIEW', 'INTEGRATIONS_MANAGE', 'BILLING_MANAGE',
    ]) {
      expect(ALL_PERMISSIONS).toContain(k);
    }
  });
  it('has 25 keys total', () => {
    expect(ALL_PERMISSIONS.length).toBe(25);
    expect(PERMISSION_COUNT).toBe(25);
  });
});
```

- [ ] **Step 2: Run it (fails — keys absent)**

Run: `pnpm --filter @kpi-nexus/contracts exec vitest run src/permissions.spec.ts`
Expected: FAIL (`ALL_PERMISSIONS` missing the new keys; count 18 ≠ 25).

- [ ] **Step 3: Add the keys**

In `permissions.ts`, inside the `PermissionKey` object add before `ORG_SETTINGS`:

```ts
  // Refined capabilities (ADR-001, 2026-06-01)
  KPI_IMPORT: 'KPI_IMPORT',
  REPORTS_MANAGE: 'REPORTS_MANAGE',
  ANALYTICS_FORECAST: 'ANALYTICS_FORECAST',
  EXPORTS: 'EXPORTS',
  AUDIT_VIEW: 'AUDIT_VIEW',
  INTEGRATIONS_MANAGE: 'INTEGRATIONS_MANAGE',
  BILLING_MANAGE: 'BILLING_MANAGE',
```

Update `export const PERMISSION_COUNT = 25 as const;` and the doc comment ("Canonical 25 permissions; 18 core + 7 ADR-001").

- [ ] **Step 4: Run it (passes)**

Run: `pnpm --filter @kpi-nexus/contracts exec vitest run src/permissions.spec.ts` → PASS.
Also build contracts so consumers see the types: `pnpm --filter @kpi-nexus/contracts build`.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/permissions.ts packages/contracts/src/permissions.spec.ts
git commit -m "feat(rbac): ADR-001 — add 7 carved-out capability keys (18→25)"
```

### Task 2: Grant new keys to default-role presets

**Files:** Modify `apps/api/src/auth/services/default-roles.ts` + `apps/api/src/roles/permission-presets.ts`; Test `apps/api/src/auth/services/default-roles.spec.ts`.

- [ ] **Step 1:** Read both files first to see the exact `DEFAULT_ROLES` / preset shapes (arrays of `PermissionKey`). Add a failing test asserting:
  - ADMIN preset is `isAdmin` (already) — implicitly all.
  - MANAGER gains `REPORTS_MANAGE`, `ANALYTICS_FORECAST`, `EXPORTS`, `KPI_IMPORT`.
  - EMPLOYEE gains `EXPORTS` (not `KPI_IMPORT`/`REPORTS_MANAGE`).
  - VIEWER gains none of the manage/forecast/import keys; may gain `EXPORTS`? → decide NO (viewers can't export).
  - `AUDIT_VIEW`/`INTEGRATIONS_MANAGE`/`BILLING_MANAGE` go to ADMIN only.

```ts
// default-roles.spec.ts (add cases)
import { DEFAULT_ROLES } from './default-roles.js';
const byName = (n: string) => DEFAULT_ROLES.find((r) => r.name === n)!;
it('MANAGER preset gains REPORTS_MANAGE + ANALYTICS_FORECAST + EXPORTS + KPI_IMPORT', () => {
  const m = byName('Manager');
  for (const k of ['REPORTS_MANAGE','ANALYTICS_FORECAST','EXPORTS','KPI_IMPORT']) {
    expect(m.permissions).toContain(k);
  }
});
it('VIEWER preset has none of the manage/import keys', () => {
  const v = byName('Viewer');
  for (const k of ['REPORTS_MANAGE','KPI_IMPORT','INTEGRATIONS_MANAGE','BILLING_MANAGE','AUDIT_VIEW']) {
    expect(v.permissions).not.toContain(k);
  }
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Add the keys to the preset arrays in `default-roles.ts` (and mirror in `permission-presets.ts`). **Step 4:** Run → PASS + run the existing 72-case truth-table spec to confirm it still passes (it counts 4 roles × N perms — update the expected count if it asserts 18). **Step 5:** Commit `feat(rbac): grant ADR-001 keys to role presets`.

### Task 3: Enforce the new keys on endpoints

**Files:** Modify the controllers below; Test: extend each module's controller/e2e spec or add a focused guard assertion.

Apply `@RequirePermissions(PermissionKey.<NEW>)` (replacing the broader key) on:
- `KPI_IMPORT` → the KPI CSV import endpoints (`apps/api/src/kpis/*import*.controller.ts`: dry-run + commit).
- `REPORTS_MANAGE` → report create/schedule/trigger/delete (keep `REPORTS_VIEW` on the GET/list/board-pack reads).
- `ANALYTICS_FORECAST` → forecast + what-if endpoints (keep `ANALYTICS_VIEW` on anomalies/read). Use `@RequireAnyPermission(ANALYTICS_FORECAST, ...)` only if a route must accept either.
- `EXPORTS` → CSV/Excel/PDF export + board-pack download endpoints (add alongside the existing view perm via `@RequireAnyPermission` is wrong — gate the *download* action with `EXPORTS`).
- `AUDIT_VIEW` → the audit-log read endpoint (was `ORG_SETTINGS`).
- `INTEGRATIONS_MANAGE` → connectors + webhooks + integrations mutations (was `ORG_SETTINGS`).
- `BILLING_MANAGE` → billing mutations (was `ORG_SETTINGS`).

- [ ] **Step 1:** For ONE representative (audit), write a test that a principal WITHOUT `AUDIT_VIEW` but WITH `ORG_SETTINGS` is now **403** on the audit read (proves the gate moved). Mirror the existing guard spec style.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Change the decorator to `@RequirePermissions(PermissionKey.AUDIT_VIEW)`. **Step 4:** Run → PASS. Repeat the decorator swap for the other endpoints (no test each — covered by Task 4's back-compat migration + the full suite). **Step 5:** Commit `feat(rbac): gate import/reports-manage/forecast/exports/audit/integrations/billing on ADR-001 keys`.

> NOTE: Because existing roles get the child keys via Task 4's migration, no current user loses access.

### Task 4: Back-compat migration (grant child keys to parents)

**Files:** Create `packages/db/prisma/migrations/<ts>_p_capability_refinement/migration.sql`; Test: a small SQL-shape assertion or a service test (see step 1).

- [ ] **Step 1:** Write `migration.sql` (idempotent; arrays are Postgres `text[]`):

```sql
-- ADR-001 back-compat: any role holding the PARENT permission keeps the carved-out CHILD.
-- ORG_SETTINGS -> AUDIT_VIEW, INTEGRATIONS_MANAGE, BILLING_MANAGE
-- REPORTS_VIEW -> REPORTS_MANAGE, EXPORTS
-- ANALYTICS_VIEW -> ANALYTICS_FORECAST
-- KPI_CREATE   -> KPI_IMPORT
UPDATE "RoleDefinition"
SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" ||
  CASE WHEN 'ORG_SETTINGS' = ANY("permissions") THEN ARRAY['AUDIT_VIEW','INTEGRATIONS_MANAGE','BILLING_MANAGE'] ELSE ARRAY[]::text[] END ||
  CASE WHEN 'REPORTS_VIEW' = ANY("permissions") THEN ARRAY['REPORTS_MANAGE','EXPORTS'] ELSE ARRAY[]::text[] END ||
  CASE WHEN 'ANALYTICS_VIEW' = ANY("permissions") THEN ARRAY['ANALYTICS_FORECAST'] ELSE ARRAY[]::text[] END ||
  CASE WHEN 'KPI_CREATE' = ANY("permissions") THEN ARRAY['KPI_IMPORT'] ELSE ARRAY[]::text[] END
))
WHERE "isAdmin" = false;
```

- [ ] **Step 2:** Apply to the dev DB:
`docker exec -i kpi-nexus-postgres psql -U kpi_nexus -d kpi_nexus -f - < packages/db/prisma/migrations/<ts>_p_capability_refinement/migration.sql`
Expected: `UPDATE N`.
- [ ] **Step 3:** Verify a non-admin role that had `REPORTS_VIEW` now also has `REPORTS_MANAGE`:
`docker exec -i kpi-nexus-postgres psql -U kpi_nexus -d kpi_nexus -c "SELECT name, 'REPORTS_MANAGE' = ANY(permissions) FROM \"RoleDefinition\" WHERE 'REPORTS_VIEW' = ANY(permissions);"`
Expected: `t` for those rows.
- [ ] **Step 4: Commit** `chore(db): ADR-001 back-compat migration (parent→child keys)`.

### Task 5: Frontend nav/guards for new keys

**Files:** Modify `apps/web/src/components/app-shell.tsx` (+ relevant pages). No new test (covered by build + permission-nav e2e).

- [ ] **Step 1:** In `NAV_GROUPS`, change the **Audit** item's `permission` from `'ORG_SETTINGS'` to `'AUDIT_VIEW'`; **Integrations** to `'INTEGRATIONS_MANAGE'`. Leave Settings on `ORG_SETTINGS`. (Billing page guard → `BILLING_MANAGE`.)
- [ ] **Step 2:** `pnpm --filter @kpi-nexus/web typecheck` → 0 errors (the keys exist via contracts).
- [ ] **Step 3:** `pnpm --filter @kpi-nexus/web build` → compiles.
- [ ] **Step 4: Commit** `feat(web): gate Audit/Integrations/Billing nav on ADR-001 keys`.

---

## PHASE 1 — Access foundation (parity)

### Task 6: AccessProfile contract types

**Files:** Create `packages/contracts/src/access.ts`; export from `packages/contracts/src/index.ts`; Test `packages/contracts/src/access.spec.ts`.

- [ ] **Step 1: Write the types + schema**

```ts
// packages/contracts/src/access.ts
import { z } from 'zod';
import { PermissionKeySchema } from './permissions.js';

export const DomainSchema = z.enum([
  'KPIS','DASHBOARDS','ALERTS','REPORTS','ANALYTICS','INSIGHTS','OKRS','TASKS','PEOPLE','ORG',
]);
export type Domain = z.infer<typeof DomainSchema>;

export const ScopeSchema = z.enum(['SELF','DIRECT_REPORTS','UNITS','ORG']);
export type Scope = z.infer<typeof ScopeSchema>;

export const AccessProfileSchema = z.object({
  isAdmin: z.boolean(),
  capabilities: z.array(PermissionKeySchema),
  scopeByDomain: z.record(DomainSchema, ScopeSchema),
  dataTypeFilters: z.object({
    kpiCategoryIds: z.array(z.string()).nullable(),
    orgUnitIds: z.array(z.string()).nullable(),
    dashboardIds: z.array(z.string()).nullable(),
  }),
  dataLimits: z.object({
    historyWindowDays: z.number().int().positive().nullable(),
    maxListRows: z.number().int().positive().nullable(),
    maxExportRows: z.number().int().positive().nullable(),
  }),
  // Phase-1 derived membership context (used by the FE + later phases)
  context: z.object({
    managedOrgUnitIds: z.array(z.string()),
    memberOrgUnitIds: z.array(z.string()),
    directReportIds: z.array(z.string()),
  }),
});
export type AccessProfile = z.infer<typeof AccessProfileSchema>;
```

- [ ] **Step 2:** Add a spec parsing a valid object + rejecting a bad scope. Run → write `index.ts` export `export * from './access.js';`.
- [ ] **Step 3:** `pnpm --filter @kpi-nexus/contracts build` → succeeds.
- [ ] **Step 4: Commit** `feat(contracts): AccessProfile / Domain / Scope types`.

### Task 7: AccessContextService (centralize + recurse + cache)

**Files:** Create `apps/api/src/rbac/services/access-context.service.ts` + `.spec.ts`; Modify `apps/api/src/rbac/rbac.module.ts` to provide/export it.

This centralizes the logic currently duplicated at `kpis.service.ts:458-505`.

- [ ] **Step 1: Write the failing test** (mock PrismaService like existing rbac specs):

```ts
// access-context.service.spec.ts (essence)
it('resolves managed vs member units + recursive direct reports, admin short-circuits', async () => {
  // prisma.roleDefinition.findUnique -> { isAdmin:false, permissions:['KPI_VIEW'], organizationId:'o1' }
  // prisma.orgUnitMember.findMany -> [{orgUnitId:'u1',memberRole:'MANAGER'},{orgUnitId:'u2',memberRole:'MEMBER'}]
  // prisma.user.findMany (managerId chain) -> 'b' reports to 'a', 'c' reports to 'b'
  const svc = makeService(fakePrisma);
  const ctx = await RequestContextStore.run(principal('o1','a','r1'), () => svc.resolveForCurrentPrincipal());
  expect(ctx.context.managedOrgUnitIds).toEqual(['u1']);
  expect(ctx.context.memberOrgUnitIds).toEqual(['u2']);
  expect(ctx.context.directReportIds).toEqual(expect.arrayContaining(['b','c'])); // recursive
});
```

- [ ] **Step 2:** Run → FAIL (no service). **Step 3: Implement:**

```ts
// apps/api/src/rbac/services/access-context.service.ts
import { Injectable } from '@nestjs/common';
import type { AccessProfile, Domain, Scope } from '@kpi-nexus/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { PermissionResolverService } from './permission-resolver.service.js';

const DOMAINS: Domain[] = ['KPIS','DASHBOARDS','ALERTS','REPORTS','ANALYTICS','INSIGHTS','OKRS','TASKS','PEOPLE','ORG'];

@Injectable()
export class AccessContextService {
  private readonly cache = new Map<string, { profile: AccessProfile; at: number }>();
  private readonly ttlMs = 5 * 60 * 1000;
  constructor(private readonly prisma: PrismaService, private readonly resolver: PermissionResolverService) {}

  async resolveForCurrentPrincipal(): Promise<AccessProfile> {
    const ctx = RequestContextStore.require();
    const key = `${ctx.organizationId}:${ctx.userId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.profile;

    const resolved = await this.resolver.resolveForUser(ctx.organizationId, ctx.userId, ctx.roleId);
    const isAdmin = resolved.isAdmin;
    const capabilities = [...resolved.permissions];

    let managedOrgUnitIds: string[] = [];
    let memberOrgUnitIds: string[] = [];
    let directReportIds: string[] = [];
    if (!isAdmin) {
      const memberships = await this.prisma.orgUnitMember.findMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
        select: { orgUnitId: true, memberRole: true },
      });
      for (const m of memberships) {
        if (m.memberRole === 'MANAGER' || m.memberRole === 'LEAD') managedOrgUnitIds.push(m.orgUnitId);
        else memberOrgUnitIds.push(m.orgUnitId);
      }
      directReportIds = await this.resolveReportsRecursive(ctx.organizationId, ctx.userId);
    }

    // Phase-1 default scope = today's behavior (admin ORG; non-admin: the KPI matrix → UNITS for managers,
    // SELF/DIRECT for individuals). At parity we set a single derived default; later phases make it configurable.
    const defaultScope: Scope = isAdmin ? 'ORG' : managedOrgUnitIds.length > 0 ? 'UNITS' : 'DIRECT_REPORTS';
    const scopeByDomain = Object.fromEntries(DOMAINS.map((d) => [d, isAdmin ? 'ORG' : defaultScope])) as Record<Domain, Scope>;

    const profile: AccessProfile = {
      isAdmin,
      capabilities,
      scopeByDomain,
      dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
      dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
      context: { managedOrgUnitIds, memberOrgUnitIds, directReportIds },
    };
    this.cache.set(key, { profile, at: Date.now() });
    return profile;
  }

  /** Direct + indirect reports via the managerId chain (cycle-safe, depth-capped). */
  private async resolveReportsRecursive(orgId: string, rootUserId: string): Promise<string[]> {
    const out = new Set<string>();
    let frontier = [rootUserId];
    for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
      const rows = await this.prisma.user.findMany({
        where: { organizationId: orgId, managerId: { in: frontier } },
        select: { id: true },
      });
      const next = rows.map((r) => r.id).filter((id) => !out.has(id) && id !== rootUserId);
      next.forEach((id) => out.add(id));
      frontier = next;
    }
    return [...out];
  }

  invalidate(orgId: string, userId: string): void { this.cache.delete(`${orgId}:${userId}`); }
}
```

- [ ] **Step 4:** Run the spec → PASS. Register in `rbac.module.ts` (`providers` + `exports`).
- [ ] **Step 5: Commit** `feat(rbac): AccessContextService (centralized membership + recursive reports + cache)`.

### Task 8: Adapt the KPI visibility to the profile (parity) + refactor callers

**Files:** Modify `apps/api/src/rbac/visibility/kpi-visibility.ts` (add adapter); Modify `kpis.service.ts`, `kpi-data.service.ts`, `nlq.service.ts`; Test: the existing `kpi-visibility.spec.ts` must stay green + add an adapter test.

- [ ] **Step 1:** Add to `kpi-visibility.ts`:

```ts
import type { AccessProfile } from '@kpi-nexus/contracts';
/** Adapt an AccessProfile into the KPI visibility context (parity bridge for Phase 1). */
export function kpiContextFromProfile(organizationId: string, userId: string, p: AccessProfile): KpiVisibilityContext {
  return {
    organizationId, userId,
    isAdmin: p.isAdmin,
    managedOrgUnitIds: p.context.managedOrgUnitIds,
    memberOrgUnitIds: p.context.memberOrgUnitIds,
    directReportIds: p.context.directReportIds,
  };
}
```

- [ ] **Step 2:** Add a spec: `kpiContextFromProfile` + `buildKpiVisibilityWhere` produces the SAME `where` as the legacy path for a manager profile (12-case parity preserved).
- [ ] **Step 3:** In each of the 3 services, replace the private `buildVisibilityContext()` body with:
  `const profile = await this.accessContext.resolveForCurrentPrincipal(); const visibility = kpiContextFromProfile(ctx.organizationId, ctx.userId, profile);`
  Inject `AccessContextService` (constructor); remove the now-dead local membership/reports queries. Keep `buildKpiVisibilityWhere(visibility)` unchanged.
- [ ] **Step 4:** Run the KPI module + visibility specs: `pnpm --filter @kpi-nexus/api exec vitest run src/rbac src/kpis src/nlq` → all green (parity). `tsc --noEmit` on apps/api → clean.
- [ ] **Step 5: Commit** `refactor(rbac): KPI visibility derives from AccessContextService (parity)`.

### Task 9: Expose AccessProfile on /auth/me

**Files:** Modify `apps/api/src/auth/auth.controller.ts` (the `me` handler) + its service if it shapes the payload; Test: `auth` controller/e2e spec or a focused unit test.

- [ ] **Step 1:** Add a test: `GET /auth/me` for an admin returns `accessProfile.isAdmin === true` and `accessProfile.capabilities.length === 25`; for a non-admin manager returns `scopeByDomain.KPIS === 'UNITS'` and non-empty `context.directReportIds` when they have reports. (Mock `AccessContextService` in the controller test.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Inject `AccessContextService` into the auth controller; in `me()` call `const accessProfile = await this.accessContext.resolveForCurrentPrincipal();` and include it in the response next to `user`. Keep the existing `user.permissions` array (back-compat for `usePermissions`). The response becomes `{ user: { ...user, permissions }, accessProfile }`.
- [ ] **Step 4:** Run → PASS. `tsc --noEmit` apps/api clean.
- [ ] **Step 5: Commit** `feat(auth): /auth/me returns the resolved AccessProfile`.

### Task 10: Frontend access profile + useAccess()

**Files:** Modify `apps/web/src/lib/api-client.ts` (`AuthUser` + `meRequest` return type); Create `apps/web/src/lib/use-access.ts`; Test: typecheck (+ optional unit test mirroring `permissions.spec`).

- [ ] **Step 1:** In `api-client.ts`, import the `AccessProfile` type (from contracts) and make `meRequest()` return `{ user: AuthUser; accessProfile?: AccessProfile }`. Cache the profile in localStorage (`kpi-nexus.access-profile`) alongside the permissions cache; helpers `getCachedAccessProfile()/setCachedAccessProfile()` in `lib/permissions.ts`.
- [ ] **Step 2:** Create `use-access.ts` mirroring the **mount-safe** pattern from `use-permissions.ts` (start empty/not-ready, hydrate from cache in `useEffect`, fall back to `meRequest()`):

```ts
'use client';
import { useEffect, useState } from 'react';
import type { AccessProfile, Domain, Scope } from '@kpi-nexus/contracts';
import { meRequest } from './api-client';
import { getCachedAccessProfile } from './permissions';

export function useAccess() {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const cached = getCachedAccessProfile();
    if (cached) { setProfile(cached); setReady(true); return () => { cancelled = true; }; }
    meRequest().then((r) => { if (!cancelled) { setProfile(r.accessProfile ?? null); setReady(true); } })
               .catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  return {
    profile, ready,
    isAdmin: profile?.isAdmin ?? false,
    scopeFor: (d: Domain): Scope | null => profile?.scopeByDomain?.[d] ?? null,
    has: (k: string) => profile?.capabilities.includes(k) ?? false,
  };
}
```

- [ ] **Step 3:** `pnpm --filter @kpi-nexus/web typecheck` → 0 errors. `pnpm --filter @kpi-nexus/web build` → compiles (64 routes).
- [ ] **Step 4: Commit** `feat(web): AccessProfile on AuthUser + useAccess() hook (SSR-safe)`.

### Task 11: Full verification (parity gate)

- [ ] **Step 1:** API suite: `pnpm --filter @kpi-nexus/api test` → only the known onboarding-cleanup flake may fail (re-run it in isolation to confirm). The **12-case KPI visibility** + **cross-tenant fuzz** MUST be green.
- [ ] **Step 2:** Web: `typecheck` + `lint` (0 errors) + `build` (64 routes) + `test` (unit) green.
- [ ] **Step 3:** Live smoke: rebuild API, restart, `GET /auth/me` with the demo admin returns `accessProfile.isAdmin:true, capabilities:25`. Browser `/dashboard` renders with 0 console errors (parity).
- [ ] **Step 4: Commit** `test(rbac): verify Phase 0+1 at behavioral parity` (if any test/fixtures changed).

---

## Self-review notes
- **Spec coverage:** Phase 0 (capabilities + presets + endpoints + migration + FE) = Tasks 1–5. Phase 1
  (AccessProfile types, AccessContextService, generalized-visibility bridge, /auth/me, useAccess, parity) =
  Tasks 6–11. Matches spec §10 phases 0 & 1.
- **Parity:** Phase 1 sets scope = today's derived behavior and all data-type/limits null → no access change;
  the 12-case + cross-tenant tests are the guardrail (Tasks 8, 11).
- **Deferred to later phases (not here):** generalized scope enforcement on dashboards/reports/alerts (P2),
  ResourcePermission wiring + category/unit allowlists (P3), data limits enforcement (P4), per-user overrides
  (P5), Access Center UI (P6), page-access lists (P7).
- **Types consistent:** `AccessProfile`/`Domain`/`Scope` defined once in `contracts/access.ts`, consumed by
  `AccessContextService`, `/auth/me`, and `useAccess`. `kpiContextFromProfile` bridges to the unchanged
  `KpiVisibilityContext`.
