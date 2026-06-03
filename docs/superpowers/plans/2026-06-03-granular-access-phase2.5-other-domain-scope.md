# Granular Access — Phase 2.5: Other-Domain Scope — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-domain scope ladder (`SELF/DIRECT_REPORTS/UNITS/ORG`) actually enforce on Dashboards, Tasks, OKRs, Reports, and Alerts/AlertRules — domains where it is currently only *resolved*, not applied.

**Architecture:** One pure helper module (`domain-visibility.ts`) turns a scope level into a user-id set; `AccessContextService` gains a cached `unitMemberUserIds()` and applies a **per-domain default** so unset roles stay at today's behaviour; each domain service ANDs a scope clause into its `list`/`getById`/mutations. Alerts/AlertRules additionally apply an always-on "KPI must be visible to you" floor. System computations (OKR rollup, alert engine, report generation) stay unscoped.

**Tech Stack:** NestJS 11 (Fastify), Prisma 6 (Postgres/TimescaleDB), Vitest, `@kpi-nexus/contracts` (Zod). No contracts change — `Domain`/`Scope`/`ScopeConfig` already exist.

**Spec:** `docs/superpowers/specs/2026-06-03-granular-access-phase2.5-other-domain-scope-design.md`.

**Conventions you must follow (from CLAUDE.md):**
- Every tenant-scoped query filters by `organizationId` from `RequestContextStore.require()`; never accept `organizationId` as a parameter.
- Migrations are **hand-written** (TimescaleDB drift). Apply with: kill the API server → `pnpm --filter @kpi-nexus/db exec prisma db execute --file <sql> --schema ./prisma/schema.prisma` → `prisma migrate resolve --applied <name>` → `prisma generate`. (Windows: kill the API first — the query-engine DLL is locked while it runs.)
- Run API unit tests with `pnpm --filter @kpi-nexus/api exec vitest run <path>`; typecheck with `pnpm --filter @kpi-nexus/api typecheck`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/db/prisma/schema.prisma` | `DashboardAssignmentOrgUnit` model + 3 back-relations | 1 |
| `packages/db/prisma/migrations/20260603100000_p2_5_dashboard_unit_assignment/migration.sql` | additive table + indexes + FKs | 1 |
| `apps/api/src/rbac/visibility/domain-visibility.ts` (new) | `DOMAIN_DEFAULT_SCOPE`, `scopedUserIds()` | 2 |
| `apps/api/src/rbac/visibility/domain-visibility.spec.ts` (new) | unit tests for the helpers | 2 |
| `apps/api/src/rbac/services/access-context.service.ts` | `unitMemberUserIds()` (cached); per-domain default | 3, 4 |
| `apps/api/src/dashboards/dashboards.service.ts` | scope-enforced `list`/`getById` + unit-assignment methods | 4, 5 |
| `apps/api/src/dashboards/dashboards.controller.ts` + `dto/dashboard.dto.ts` | unit-assignment endpoints + DTO | 5 |
| `apps/api/src/tasks/tasks.service.ts` | scope-enforced `list`/`byKpi`/`getById` | 6 |
| `apps/api/src/okrs/objectives.service.ts` | scope-enforced `list`/`getById` | 7 |
| `apps/api/src/reports/scheduled-report.service.ts` | scope-enforced `list`/`get` | 8 |
| `apps/api/src/alerts/alerts.service.ts` | KPI-floor + scope `list`/`getById` | 9 |
| `apps/api/src/alert-rules/alert-rules.service.ts` | KPI-floor `list`/`getById` | 10 |
| `apps/api/test/cross-tenant…` + memory | isolation tests, live smoke, memory | 11 |

---

## Task 1: Schema — `DashboardAssignmentOrgUnit`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add model + 3 back-relations)
- Create: `packages/db/prisma/migrations/20260603100000_p2_5_dashboard_unit_assignment/migration.sql`

- [ ] **Step 1: Add the model to `schema.prisma`** (place it right after the `Dashboard` model block, ~line 1024)

```prisma
// Phase 2.5 — lets a dashboard be "published" to an org unit so unit members
// see it under UNITS scope. Additive; absence = today's owner/isShared model.
model DashboardAssignmentOrgUnit {
  id             String   @id @default(cuid())
  organizationId String
  dashboardId    String
  orgUnitId      String
  createdAt      DateTime @default(now())
  createdById    String?

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  dashboard    Dashboard    @relation(fields: [dashboardId], references: [id], onDelete: Cascade)
  orgUnit      OrgUnit      @relation(fields: [orgUnitId], references: [id], onDelete: Cascade)

  @@unique([dashboardId, orgUnitId])
  @@index([organizationId])
  @@index([orgUnitId])
}
```

- [ ] **Step 2: Add the three back-relation fields**

In `model Dashboard` (~line 999) add:
```prisma
  unitAssignments DashboardAssignmentOrgUnit[]
```
In `model OrgUnit` (~line 521) add:
```prisma
  dashboardAssignments DashboardAssignmentOrgUnit[]
```
In `model Organization` add (next to its other back-relations):
```prisma
  dashboardUnitAssignments DashboardAssignmentOrgUnit[]
```

- [ ] **Step 3: Write the migration SQL** at the path above

```sql
-- Granular access Phase 2.5: publish-a-dashboard-to-a-unit assignment table.
-- Additive; existing data unaffected. Idempotent guards for safe re-run.
CREATE TABLE IF NOT EXISTS "DashboardAssignmentOrgUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DashboardAssignmentOrgUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DashboardAssignmentOrgUnit_dashboardId_orgUnitId_key" ON "DashboardAssignmentOrgUnit"("dashboardId", "orgUnitId");
CREATE INDEX IF NOT EXISTS "DashboardAssignmentOrgUnit_organizationId_idx" ON "DashboardAssignmentOrgUnit"("organizationId");
CREATE INDEX IF NOT EXISTS "DashboardAssignmentOrgUnit_orgUnitId_idx" ON "DashboardAssignmentOrgUnit"("orgUnitId");

DO $$ BEGIN
  ALTER TABLE "DashboardAssignmentOrgUnit" ADD CONSTRAINT "DashboardAssignmentOrgUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DashboardAssignmentOrgUnit" ADD CONSTRAINT "DashboardAssignmentOrgUnit_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DashboardAssignmentOrgUnit" ADD CONSTRAINT "DashboardAssignmentOrgUnit_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

```bash
# Kill any running API first (Windows query-engine DLL lock), then:
pnpm --filter @kpi-nexus/db exec prisma db execute --file ./prisma/migrations/20260603100000_p2_5_dashboard_unit_assignment/migration.sql --schema ./prisma/schema.prisma
pnpm --filter @kpi-nexus/db exec prisma migrate resolve --applied 20260603100000_p2_5_dashboard_unit_assignment --schema ./prisma/schema.prisma
pnpm --filter @kpi-nexus/db exec prisma generate --schema ./prisma/schema.prisma
```
Expected: db execute prints "Script executed successfully"; generate prints "Generated Prisma Client".

- [ ] **Step 5: Verify the client typechecks against the new model**

```bash
pnpm --filter @kpi-nexus/api typecheck
```
Expected: exit 0 (the new `prisma.dashboardAssignmentOrgUnit` delegate exists).

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260603100000_p2_5_dashboard_unit_assignment
git commit -m "feat(db): DashboardAssignmentOrgUnit table (Phase 2.5)"
```

---

## Task 2: Pure visibility helpers — `domain-visibility.ts`

**Files:**
- Create: `apps/api/src/rbac/visibility/domain-visibility.ts`
- Test: `apps/api/src/rbac/visibility/domain-visibility.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';

import { DOMAIN_DEFAULT_SCOPE, scopedUserIds } from './domain-visibility.js';

const CTX = { userId: 'u1', directReportIds: ['r1', 'r2'], unitMemberUserIds: ['m1', 'u1'] };

describe('DOMAIN_DEFAULT_SCOPE (parity defaults)', () => {
  test('reproduces today per domain', () => {
    expect(DOMAIN_DEFAULT_SCOPE.KPIS).toBe('UNITS');
    expect(DOMAIN_DEFAULT_SCOPE.DASHBOARDS).toBe('SELF');
    expect(DOMAIN_DEFAULT_SCOPE.TASKS).toBe('SELF');
    expect(DOMAIN_DEFAULT_SCOPE.OKRS).toBe('ORG');
    expect(DOMAIN_DEFAULT_SCOPE.REPORTS).toBe('ORG');
    expect(DOMAIN_DEFAULT_SCOPE.ALERTS).toBe('ORG');
  });
});

describe('scopedUserIds', () => {
  test('ORG ⇒ null (no user filter)', () => {
    expect(scopedUserIds('ORG', CTX)).toBeNull();
  });
  test('SELF ⇒ just me', () => {
    expect(scopedUserIds('SELF', CTX)).toEqual(['u1']);
  });
  test('DIRECT_REPORTS ⇒ me ∪ reports (deduped)', () => {
    expect(new Set(scopedUserIds('DIRECT_REPORTS', CTX))).toEqual(new Set(['u1', 'r1', 'r2']));
  });
  test('UNITS ⇒ me ∪ reports ∪ unit members (deduped)', () => {
    expect(new Set(scopedUserIds('UNITS', CTX))).toEqual(new Set(['u1', 'r1', 'r2', 'm1']));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/rbac/visibility/domain-visibility.spec.ts
```
Expected: FAIL — "Cannot find module './domain-visibility.js'".

- [ ] **Step 3: Implement `domain-visibility.ts`**

```ts
import type { Domain, Scope } from '@kpi-nexus/contracts';

/**
 * Per-domain non-admin default scope when a role/override sets nothing. Chosen to
 * reproduce each domain's *current* behaviour (Phase 2.5 ships at parity):
 *   KPIS=UNITS (legacy), DASHBOARDS=SELF (own ∪ isShared via the floor),
 *   TASKS=SELF (creator/assignee), OKRS/REPORTS/ALERTS=ORG (org-wide today).
 * The non-enforced domains keep UNITS — cosmetic, only surfaces on /auth/me.
 */
export const DOMAIN_DEFAULT_SCOPE: Record<Domain, Scope> = {
  KPIS: 'UNITS',
  DASHBOARDS: 'SELF',
  ALERTS: 'ORG',
  REPORTS: 'ORG',
  ANALYTICS: 'UNITS',
  INSIGHTS: 'UNITS',
  OKRS: 'ORG',
  TASKS: 'SELF',
  PEOPLE: 'UNITS',
  ORG: 'UNITS',
};

export interface ScopedUserCtx {
  userId: string;
  directReportIds: readonly string[];
  /** Distinct user-ids in the principal's managed ∪ member org units. */
  unitMemberUserIds: readonly string[];
}

/**
 * The set of user-ids whose owned/created/assigned rows are visible at `scope`.
 * `null` ⇒ no user filter (ORG / admin — every row in tenant). Used by the
 * derived domains (Tasks/OKRs/Reports) and the dashboards owner branch.
 */
export function scopedUserIds(scope: Scope, ctx: ScopedUserCtx): string[] | null {
  if (scope === 'ORG') return null;
  if (scope === 'SELF') return [ctx.userId];
  if (scope === 'DIRECT_REPORTS') return uniq([ctx.userId, ...ctx.directReportIds]);
  // UNITS
  return uniq([ctx.userId, ...ctx.directReportIds, ...ctx.unitMemberUserIds]);
}

function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/rbac/visibility/domain-visibility.spec.ts
```
Expected: PASS (4 + 1 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rbac/visibility/domain-visibility.ts apps/api/src/rbac/visibility/domain-visibility.spec.ts
git commit -m "feat(rbac): domain-visibility helpers — DOMAIN_DEFAULT_SCOPE + scopedUserIds (Phase 2.5)"
```

---

## Task 3: `AccessContextService.unitMemberUserIds()` (cached, additive)

**Files:**
- Modify: `apps/api/src/rbac/services/access-context.service.ts`
- Test: `apps/api/src/rbac/services/access-context.service.spec.ts` (add a describe block)

This is additive — it adds a method, changes no existing behaviour.

- [ ] **Step 1: Write the failing test** (append to the existing spec)

```ts
describe('AccessContextService.unitMemberUserIds (Phase 2.5)', () => {
  test('returns distinct active members of the principal’s managed ∪ member units', async () => {
    const { service, prisma } = makeService(); // existing test harness in this file
    // current user belongs to unit "g1" (member) and manages "g2"
    prisma.orgUnitMember.findMany
      .mockResolvedValueOnce([
        { orgUnitId: 'g2', memberRole: 'MANAGER' },
        { orgUnitId: 'g1', memberRole: 'MEMBER' },
      ]) // membership lookup inside resolveForCurrentPrincipal
      .mockResolvedValueOnce([
        { userId: 'peer1' },
        { userId: 'peer2' },
        { userId: 'peer1' },
      ]); // the unitMemberUserIds lookup
    prisma.user.findMany.mockResolvedValue([]); // no reports
    await withCtx({ userId: 'me', roleId: 'r1' }, async () => {
      const ids = await service.unitMemberUserIds();
      expect(new Set(ids)).toEqual(new Set(['peer1', 'peer2']));
    });
  });

  test('admin ⇒ empty (admins never scope by unit membership)', async () => {
    const { service } = makeService({ isAdmin: true });
    await withCtx({ userId: 'admin', roleId: 'r0' }, async () => {
      expect(await service.unitMemberUserIds()).toEqual([]);
    });
  });
});
```
*(Match the helper names already used in `access-context.service.spec.ts`; if the existing harness differs, mirror its `makeService`/`withCtx` shape exactly.)*

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/rbac/services/access-context.service.spec.ts
```
Expected: FAIL — `service.unitMemberUserIds is not a function`.

- [ ] **Step 3: Implement the method** (add to `AccessContextService`, plus a parallel cache)

Add a field beside the existing `cache`:
```ts
  private readonly unitMembersCache = new Map<string, { ids: string[]; at: number }>();
```
Add the method (after `kpiCategoryAllowlist`):
```ts
  /**
   * Distinct user-ids in the current principal's managed ∪ member org units —
   * the "people in my units" set used by the derived domains' UNITS scope.
   * Admins ⇒ [] (they never scope by membership). Cached per org:user (5-min TTL).
   */
  async unitMemberUserIds(): Promise<string[]> {
    const ctx = RequestContextStore.require();
    const key = `${ctx.organizationId}:${ctx.userId}`;
    const hit = this.unitMembersCache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.ids;

    const profile = await this.resolveForCurrentPrincipal();
    if (profile.isAdmin) {
      this.unitMembersCache.set(key, { ids: [], at: Date.now() });
      return [];
    }
    const unitIds = [
      ...new Set([...profile.context.managedOrgUnitIds, ...profile.context.memberOrgUnitIds]),
    ];
    if (unitIds.length === 0) {
      this.unitMembersCache.set(key, { ids: [], at: Date.now() });
      return [];
    }
    const rows = await this.prisma.orgUnitMember.findMany({
      where: { organizationId: ctx.organizationId, orgUnitId: { in: unitIds }, leftAt: null },
      select: { userId: true },
    });
    const ids = [...new Set(rows.map((r) => r.userId))];
    this.unitMembersCache.set(key, { ids, at: Date.now() });
    return ids;
  }
```
Extend the two invalidation methods to clear this cache too:
```ts
  invalidate(organizationId: string, userId: string): void {
    this.cache.delete(`${organizationId}:${userId}`);
    this.unitMembersCache.delete(`${organizationId}:${userId}`);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.unitMembersCache.clear();
  }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/rbac/services/access-context.service.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rbac/services/access-context.service.ts apps/api/src/rbac/services/access-context.service.spec.ts
git commit -m "feat(rbac): AccessContextService.unitMemberUserIds (cached) (Phase 2.5)"
```

---

## Task 4: Per-domain default + Dashboards enforcement (coupled)

These change together because `dashboards.service` is the only existing consumer of a non-KPI `scopeByDomain` value; flipping the default without rewriting the dashboard query would break dashboard parity.

**Files:**
- Modify: `apps/api/src/rbac/services/access-context.service.ts` (default), its spec
- Modify: `apps/api/src/dashboards/dashboards.service.ts` (`list`, `getById`), its spec

- [ ] **Step 1: Write the failing dashboards parity + scope test** (append to `dashboards.service.spec.ts`, matching its harness)

```ts
describe('DashboardsService scope (Phase 2.5)', () => {
  // default (SELF) ⇒ own ∪ isShared == today's behaviour
  test('default scope ⇒ own + shared (parity)', async () => {
    const { service, prisma, profile } = makeService({ scopeByDomain: { DASHBOARDS: 'SELF' } });
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.dashboard.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ ownerUserId: { in: ['me'] } }, { isShared: true }]),
    );
  });

  // UNITS ⇒ owner∈units ∪ shared ∪ unit-assigned
  test('UNITS scope ⇒ adds unit-assigned dashboards', async () => {
    const { service, prisma } = makeService({
      scopeByDomain: { DASHBOARDS: 'UNITS' },
      unitMemberUserIds: ['peer1'],
      managedOrgUnitIds: ['g1'],
    });
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.dashboard.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { ownerUserId: { in: expect.arrayContaining(['me', 'peer1']) } },
        { isShared: true },
        { unitAssignments: { some: { orgUnitId: { in: ['g1'] } } } },
      ]),
    );
  });

  // ORG ⇒ no per-row filter
  test('ORG scope ⇒ no OR filter (all dashboards)', async () => {
    const { service, prisma } = makeService({ scopeByDomain: { DASHBOARDS: 'ORG' } });
    await withCtx({ userId: 'me' }, () => service.list());
    expect(prisma.dashboard.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/dashboards/dashboards.service.spec.ts
```
Expected: FAIL (the current `list` produces `[{ownerUserId: 'me'}, {isShared:true}]`, not the new shapes).

- [ ] **Step 3: Flip the default in `access-context.service.ts`**

Add the import:
```ts
import { DOMAIN_DEFAULT_SCOPE } from '../visibility/domain-visibility.js';
```
Replace the `defaultScope` line + `scopeByDomain` construction:
```ts
    // Phase 2.5 — per-domain default reproduces each domain's current behaviour
    // (KPIS=UNITS, DASHBOARDS/TASKS=SELF, OKRS/REPORTS/ALERTS=ORG). Admin ⇒ ORG.
    const roleConfig = await this.loadRoleConfig(isAdmin, ctx.organizationId, ctx.roleId);
    const override = isAdmin ? null : await this.loadUserOverride(ctx.organizationId, ctx.userId);
    const scopeByDomain = Object.fromEntries(
      DOMAINS.map((d) => [
        d,
        isAdmin ? 'ORG' : (override?.scope[d] ?? roleConfig.scope[d] ?? DOMAIN_DEFAULT_SCOPE[d]),
      ]),
    ) as Record<Domain, Scope>;
```
Delete the now-unused `const defaultScope: Scope = ...` line.

- [ ] **Step 4: Update `access-context.service.spec.ts` expectations**

Any test asserting an unset non-KPI domain resolves to `'UNITS'` must change to the per-domain default: `DASHBOARDS`/`TASKS` → `'SELF'`, `OKRS`/`REPORTS`/`ALERTS` → `'ORG'`, `KPIS` stays `'UNITS'`. (Search the spec for `scopeByDomain` assertions.)

- [ ] **Step 5: Rewrite `dashboards.service.list` and `getById`**

Add the import:
```ts
import { scopedUserIds } from '../rbac/visibility/domain-visibility.js';
```
Replace `list()`:
```ts
  async list(): Promise<PublicDashboard[]> {
    const ctx = RequestContextStore.require();
    const where = await this.visibilityWhere(); // { organizationId, deletedAt, OR? }
    return this.prisma.dashboard.findMany({
      where,
      select: dashboardSelect,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * The dashboard `where` for the current principal. `isShared` is an always-on
   * floor; the configured DASHBOARDS scope governs the *private* set (SELF=own,
   * DIRECT_REPORTS=+reports, UNITS=+unit owners/assignments, ORG=all). Default
   * SELF ⇒ own ∪ isShared = parity. Admin ⇒ whole tenant.
   */
  private async visibilityWhere(): Promise<Prisma.DashboardWhereInput> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    const where: Prisma.DashboardWhereInput = {
      organizationId: ctx.organizationId,
      deletedAt: null,
    };
    if (profile.isAdmin) return where;

    const scope = profile.scopeByDomain.DASHBOARDS;
    if (scope === 'ORG') return where; // all dashboards in tenant

    const unitMemberUserIds = scope === 'UNITS' ? await this.accessContext.unitMemberUserIds() : [];
    const ownerIds = scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    })!; // non-null: scope !== ORG
    const or: Prisma.DashboardWhereInput[] = [
      { ownerUserId: { in: ownerIds } },
      { isShared: true },
    ];
    if (scope === 'UNITS') {
      const myUnitIds = [
        ...new Set([...profile.context.managedOrgUnitIds, ...profile.context.memberOrgUnitIds]),
      ];
      if (myUnitIds.length > 0) {
        or.push({ unitAssignments: { some: { orgUnitId: { in: myUnitIds } } } });
      }
    }
    where.OR = or;
    return where;
  }
```
Replace `getById()` to reuse the same predicate (no existence leak — 404 when out of scope):
```ts
  async getById(id: string): Promise<PublicDashboard> {
    const where = await this.visibilityWhere();
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { ...where, id },
      select: dashboardSelect,
    });
    if (!dashboard) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dashboard not found' });
    }
    return dashboard;
  }
```
*(The `resolver` field may now be unused in this file — remove the import/constructor param only if nothing else references it; otherwise leave it.)*

- [ ] **Step 6: Run dashboards + access-context tests**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/dashboards src/rbac/services/access-context.service.spec.ts
```
Expected: PASS. Then full typecheck:
```bash
pnpm --filter @kpi-nexus/api typecheck
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/rbac/services/access-context.service.ts apps/api/src/rbac/services/access-context.service.spec.ts apps/api/src/dashboards/dashboards.service.ts apps/api/src/dashboards/dashboards.service.spec.ts
git commit -m "feat(dashboards): enforce DASHBOARDS scope + per-domain default (Phase 2.5)"
```

---

## Task 5: Dashboard unit-assignment endpoints

**Files:**
- Modify: `apps/api/src/dashboards/dashboards.service.ts` (add assignment methods)
- Modify: `apps/api/src/dashboards/dashboards.controller.ts` (3 routes)
- Modify: `apps/api/src/dashboards/dto/dashboard.dto.ts` (assign DTO)
- Test: `apps/api/src/dashboards/dashboards.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('DashboardsService unit assignments (Phase 2.5)', () => {
  test('assign validates the org unit, upserts idempotently, audits', async () => {
    const { service, prisma, audit } = makeService({ isAdmin: true });
    prisma.dashboard.findFirst.mockResolvedValue({ id: 'd1' }); // visible
    prisma.orgUnit.findFirst.mockResolvedValue({ id: 'g1' });   // in tenant
    await withCtx({ userId: 'me' }, () => service.assignUnit('d1', 'g1'));
    expect(prisma.dashboardAssignmentOrgUnit.upsert).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'Dashboard', entityId: 'd1' }),
    );
  });

  test('assign rejects an org unit outside the tenant ⇒ 404', async () => {
    const { service, prisma } = makeService({ isAdmin: true });
    prisma.dashboard.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.orgUnit.findFirst.mockResolvedValue(null);
    await expect(withCtx({ userId: 'me' }, () => service.assignUnit('d1', 'gX'))).rejects.toMatchObject(
      { response: { code: 'NOT_FOUND' } },
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/dashboards/dashboards.service.spec.ts
```
Expected: FAIL — `service.assignUnit is not a function`.

- [ ] **Step 3: Implement the service methods** (add to `DashboardsService`)

```ts
  /** List the org units a dashboard is published to (caller must be able to see it). */
  async listUnitAssignments(dashboardId: string): Promise<Array<{ orgUnitId: string; createdAt: Date }>> {
    await this.getById(dashboardId); // visibility-gates: 404 if not visible to caller
    return this.prisma.dashboardAssignmentOrgUnit.findMany({
      where: { dashboardId },
      select: { orgUnitId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Publish a dashboard to an org unit (DASHBOARD_MANAGE). Idempotent on (dashboard, unit). */
  async assignUnit(dashboardId: string, orgUnitId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.getById(dashboardId); // tenant + visibility check
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id: orgUnitId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Org unit not found' });
    await this.prisma.dashboardAssignmentOrgUnit.upsert({
      where: { dashboardId_orgUnitId: { dashboardId, orgUnitId } },
      create: { organizationId: ctx.organizationId, dashboardId, orgUnitId, createdById: ctx.userId },
      update: {},
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Dashboard',
      entityId: dashboardId,
      metadata: { assignedUnit: orgUnitId },
    });
  }

  /** Un-publish a dashboard from an org unit (DASHBOARD_MANAGE). */
  async unassignUnit(dashboardId: string, orgUnitId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.getById(dashboardId);
    await this.prisma.dashboardAssignmentOrgUnit.deleteMany({
      where: { organizationId: ctx.organizationId, dashboardId, orgUnitId },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Dashboard',
      entityId: dashboardId,
      metadata: { unassignedUnit: orgUnitId },
    });
  }
```

- [ ] **Step 4: Add the DTO** (in `dto/dashboard.dto.ts`)

```ts
export const AssignDashboardUnitDtoSchema = z.object({ orgUnitId: z.string().min(1) });
export type AssignDashboardUnitDto = z.infer<typeof AssignDashboardUnitDtoSchema>;
```

- [ ] **Step 5: Add the controller routes** (in `dashboards.controller.ts`; import `AssignDashboardUnitDtoSchema`)

```ts
  @Get(':id/unit-assignments')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  listUnitAssignments(@Param('id') id: string) {
    return this.dashboards.listUnitAssignments(id);
  }

  @Post(':id/unit-assignments')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  assignUnit(@Param('id') id: string, @Body() body: unknown): Promise<void> {
    return this.dashboards.assignUnit(id, parse(AssignDashboardUnitDtoSchema, body).orgUnitId);
  }

  @Delete(':id/unit-assignments/:orgUnitId')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignUnit(@Param('id') id: string, @Param('orgUnitId') orgUnitId: string): Promise<void> {
    return this.dashboards.unassignUnit(id, orgUnitId);
  }
```

- [ ] **Step 6: Run tests + typecheck**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/dashboards
pnpm --filter @kpi-nexus/api typecheck
```
Expected: PASS / exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dashboards
git commit -m "feat(dashboards): unit-assignment endpoints (Phase 2.5)"
```

---

## Task 6: Tasks scope

`tasks.service` currently hardcodes "creator or assignee" and reads `this.resolver`. We inject `AccessContextService`, keep SELF as the default (parity), and let wider scopes broaden.

**Files:**
- Modify: `apps/api/src/tasks/tasks.service.ts` (`list`, `byKpi`, `getById`)
- Modify: `apps/api/src/tasks/tasks.module.ts` (ensure `AccessContextService` is available — it's exported by `RbacModule`, already imported by TasksModule? verify)
- Test: `apps/api/src/tasks/tasks.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('TasksService scope (Phase 2.5)', () => {
  test('default SELF ⇒ created-by-me OR assigned-to-me (parity)', async () => {
    const { service, prisma } = makeTasksService({ scopeByDomain: { TASKS: 'SELF' } });
    await withCtx({ userId: 'me' }, () => service.list({}));
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { createdById: { in: ['me'] } },
      { assigneeUserId: { in: ['me'] } },
    ]);
  });

  test('UNITS ⇒ created/assigned by anyone in my units', async () => {
    const { service, prisma } = makeTasksService({
      scopeByDomain: { TASKS: 'UNITS' },
      unitMemberUserIds: ['peer1'],
    });
    await withCtx({ userId: 'me' }, () => service.list({}));
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { createdById: { in: expect.arrayContaining(['me', 'peer1']) } },
      { assigneeUserId: { in: expect.arrayContaining(['me', 'peer1']) } },
    ]);
  });

  test('ORG ⇒ no per-row filter', async () => {
    const { service, prisma } = makeTasksService({ scopeByDomain: { TASKS: 'ORG' } });
    await withCtx({ userId: 'me' }, () => service.list({}));
    expect(prisma.task.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});
```
*(Extend the file's harness to build a `service` with an injected fake `AccessContextService` exposing `resolveForCurrentPrincipal` + `unitMemberUserIds`, like the dashboards spec.)*

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/tasks/tasks.service.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement** — inject `AccessContextService`, add a private clause builder, apply to `list`/`byKpi`/`getById`

Constructor: add `private readonly accessContext: AccessContextService` (import from `../rbac/services/access-context.service.js`; add `import { scopedUserIds } from '../rbac/visibility/domain-visibility.js'`).

```ts
  /** OR-clause restricting tasks to those created-by / assigned-to the scoped user set.
   *  `undefined` ⇒ no restriction (ORG / admin). */
  private async taskScopeOr(): Promise<Prisma.TaskWhereInput[] | undefined> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return undefined;
    const scope = profile.scopeByDomain.TASKS;
    if (scope === 'ORG') return undefined;
    const unitMemberUserIds = scope === 'UNITS' ? await this.accessContext.unitMemberUserIds() : [];
    const ids = scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    })!;
    return [{ createdById: { in: ids } }, { assigneeUserId: { in: ids } }];
  }
```
In `list` replace the `if (!resolved.isAdmin) where.OR = …` block with:
```ts
    const or = await this.taskScopeOr();
    if (or) where.OR = or;
```
Do the same in `byKpi`. In `getById`, replace the post-load `resolved.isAdmin && …` guard with a visibility re-check using the same set:
```ts
    const or = await this.taskScopeOr();
    if (or && task.createdById !== ctx.userId && task.assigneeUserId !== ctx.userId) {
      const ids = (or[0] as { createdById: { in: string[] } }).createdById.in;
      if (!ids.includes(task.createdById ?? '') && !ids.includes(task.assigneeUserId ?? '')) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Task not found' });
      }
    }
```
*(Keep whatever the file already throws; the net effect is "visible iff creator/assignee ∈ scoped set, ORG/admin ⇒ always".)*

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/tasks
pnpm --filter @kpi-nexus/api typecheck
```
Expected: PASS / exit 0. (If DI fails at boot, add `RbacModule` to `TasksModule` imports.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tasks
git commit -m "feat(tasks): drive TASKS scope from AccessProfile (Phase 2.5)"
```

---

## Task 7: OKRs scope

**Files:**
- Modify: `apps/api/src/okrs/objectives.service.ts` (`list`, `getById`; inject `AccessContextService`)
- Modify: `apps/api/src/okrs/*.module.ts` (ensure `RbacModule` import)
- Test: `apps/api/src/okrs/objectives.service.spec.ts`
- **Do NOT touch** `progress-math.ts` or the rollup path — rollup reads children unscoped (system computation).

- [ ] **Step 1: Write the failing test**

```ts
describe('ObjectivesService scope (Phase 2.5)', () => {
  test('default ORG ⇒ all objectives (parity)', async () => {
    const { service, prisma } = makeObjService({ scopeByDomain: { OKRS: 'ORG' } });
    await withCtx({ userId: 'me' }, () => service.list({}));
    expect(prisma.objective.findMany.mock.calls[0][0].where.ownerUserId).toBeUndefined();
  });

  test('SELF ⇒ ownerUserId IN {me}', async () => {
    const { service, prisma } = makeObjService({ scopeByDomain: { OKRS: 'SELF' } });
    await withCtx({ userId: 'me' }, () => service.list({}));
    expect(prisma.objective.findMany.mock.calls[0][0].where.ownerUserId).toEqual({ in: ['me'] });
  });

  test('explicit owner filter intersects with scope', async () => {
    const { service, prisma } = makeObjService({ scopeByDomain: { OKRS: 'SELF' } });
    await withCtx({ userId: 'me' }, () => service.list({ ownerUserId: 'someone' }));
    // query.ownerUserId is honoured but AND'd under the scope's `ownerUserId IN` set
    const where = prisma.objective.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm --filter @kpi-nexus/api exec vitest run src/okrs/objectives.service.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement** — inject `AccessContextService`, scope by `ownerUserId`

Constructor adds `private readonly accessContext: AccessContextService`; import it + `scopedUserIds`.
```ts
  /** `{ in: ids }` restricting objectives to owners in scope, or `undefined` (ORG/admin). */
  private async ownerScope(): Promise<{ in: string[] } | undefined> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return undefined;
    const scope = profile.scopeByDomain.OKRS;
    if (scope === 'ORG') return undefined;
    const unitMemberUserIds = scope === 'UNITS' ? await this.accessContext.unitMemberUserIds() : [];
    const ids = scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    })!;
    return { in: ids };
  }
```
Rewrite `list` to AND the scope with any explicit filter:
```ts
  async list(query: ListObjectivesQuery): Promise<PublicObjective[]> {
    const ctx = RequestContextStore.require();
    const ownerScope = await this.ownerScope();
    const where: Prisma.ObjectiveWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.parentObjectiveId ? { parentObjectiveId: query.parentObjectiveId } : {}),
    };
    // Owner: explicit query filter AND scope set (scope wins as the ceiling).
    if (ownerScope && query.ownerUserId) {
      where.AND = [{ ownerUserId: query.ownerUserId }, { ownerUserId: ownerScope }];
    } else if (ownerScope) {
      where.ownerUserId = ownerScope;
    } else if (query.ownerUserId) {
      where.ownerUserId = query.ownerUserId;
    }
    return this.prisma.objective.findMany({ where, select: objectiveSelect, orderBy: [{ createdAt: 'asc' }] });
  }
```
Gate `getById`: after loading, if `ownerScope` is set and `obj.ownerUserId` is not in it ⇒ 404.
```ts
  async getById(id: string): Promise<PublicObjective> {
    const ctx = RequestContextStore.require();
    const obj = await this.prisma.objective.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: objectiveSelect,
    });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Objective not found' });
    const ownerScope = await this.ownerScope();
    if (ownerScope && (obj.ownerUserId == null || !ownerScope.in.includes(obj.ownerUserId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Objective not found' });
    }
    return obj;
  }
```
**Important:** `create()` calls `getById(parentObjectiveId)` to tenant-check the parent. A user creating a child under a parent they can't *see* would now 404. That's acceptable (you shouldn't nest under an invisible objective). Leave it; the rollup math still reads children unscoped via Prisma directly (not through `getById`).

- [ ] **Step 4: Run tests + typecheck** (`vitest run src/okrs`, `typecheck`). Expected PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/okrs
git commit -m "feat(okrs): enforce OKRS scope on objective reads (Phase 2.5)"
```

---

## Task 8: Reports (ScheduledReport) scope

**Files:**
- Modify: `apps/api/src/reports/scheduled-report.service.ts` (`list`, `get`; inject `AccessContextService`)
- Modify: reports module (ensure `RbacModule` import)
- Test: `apps/api/src/reports/scheduled-report.service.spec.ts`
- **Do NOT touch** the processor / generation path — it runs as the creator with `bypassDataLimits` and stays unscoped.

- [ ] **Step 1: Write the failing test**

```ts
describe('ScheduledReportService scope (Phase 2.5)', () => {
  test('default ORG ⇒ createdById unfiltered (parity)', async () => {
    const { service, prisma } = makeReportService({ scopeByDomain: { REPORTS: 'ORG' } });
    await withCtx({ userId: 'me' }, () => service.list());
    expect(prisma.scheduledReport.findMany.mock.calls[0][0].where.createdById).toBeUndefined();
  });

  test('SELF ⇒ createdById IN {me}', async () => {
    const { service, prisma } = makeReportService({ scopeByDomain: { REPORTS: 'SELF' } });
    await withCtx({ userId: 'me' }, () => service.list());
    expect(prisma.scheduledReport.findMany.mock.calls[0][0].where.createdById).toEqual({ in: ['me'] });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** (`vitest run src/reports/scheduled-report.service.spec.ts`). Expected FAIL.

- [ ] **Step 3: Implement** — inject `AccessContextService`, add a `creatorScope()` helper (same shape as `ownerScope` but reading `scopeByDomain.REPORTS`), apply to `list` and `get`:

```ts
  async list() {
    const ctx = RequestContextStore.require();
    const creatorScope = await this.creatorScope();
    return this.prisma.scheduledReport.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(creatorScope ? { createdById: creatorScope } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
```
In `get(id)`, after loading the row, 404 if `creatorScope` is set and `row.createdById` ∉ it. (`creatorScope()` body mirrors Task 7's `ownerScope()` but uses `profile.scopeByDomain.REPORTS`.)

- [ ] **Step 4: Run tests + typecheck** (`vitest run src/reports`, `typecheck`). Expected PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports
git commit -m "feat(reports): enforce REPORTS scope on scheduled-report reads (Phase 2.5)"
```

---

## Task 9: Alerts — KPI floor + scope

The floor: an alert is visible only if its KPI is visible to you. We compute the visible-KPI-id set with `buildKpiVisibilityWhere` (no `kpi` relation exists on `Alert`), then filter `kpiId IN`. The ALERTS scope narrows further by `targetUserId`.

**Files:**
- Modify: `apps/api/src/alerts/alerts.service.ts` (`list`, `getById`; inject `AccessContextService`)
- Modify: alerts module (ensure `RbacModule` import)
- Test: `apps/api/src/alerts/alerts.service.spec.ts`
- **Do NOT touch** the alert-evaluation engine / rule firing.

- [ ] **Step 1: Write the failing test**

```ts
describe('AlertsService visibility (Phase 2.5)', () => {
  test('non-admin ⇒ kpiId limited to visible KPIs (floor)', async () => {
    const { service, prisma } = makeAlertsService({ scopeByDomain: { ALERTS: 'ORG' } });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }, { id: 'k2' }]); // visible KPIs
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alert.findMany.mock.calls[0][0].where;
    expect(where.kpiId).toEqual({ in: ['k1', 'k2'] });
    expect(where.targetUserId).toBeUndefined(); // ORG ⇒ no target narrowing
  });

  test('SELF ⇒ targetUserId == me AND visible KPI', async () => {
    const { service, prisma } = makeAlertsService({ scopeByDomain: { ALERTS: 'SELF' } });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alert.findMany.mock.calls[0][0].where;
    expect(where.kpiId).toEqual({ in: ['k1'] });
    expect(where.targetUserId).toEqual({ in: ['me'] });
  });

  test('admin ⇒ no floor, no target filter', async () => {
    const { service, prisma } = makeAlertsService({ isAdmin: true });
    await withCtx({ userId: 'admin' }, () => service.list());
    const where = prisma.alert.findMany.mock.calls[0][0].where;
    expect(where.kpiId).toBeUndefined();
    expect(where.targetUserId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** (`vitest run src/alerts/alerts.service.spec.ts`). Expected FAIL.

- [ ] **Step 3: Implement** — inject `AccessContextService`; import `buildKpiVisibilityWhere`, `kpiContextFromProfile`, `scopedUserIds`.

```ts
  /** Adds the KPI-visibility floor + ALERTS-scope target narrowing to an alert `where`. */
  private async applyVisibility(where: Prisma.AlertWhereInput): Promise<Prisma.AlertWhereInput> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return where;

    // Floor: only alerts whose KPI the principal may see.
    const kpiWhere = buildKpiVisibilityWhere(
      kpiContextFromProfile(ctx.organizationId, ctx.userId, profile),
    ) as unknown as Prisma.KPIWhereInput;
    const visibleKpis = await this.prisma.kPI.findMany({ where: kpiWhere, select: { id: true } });
    where.kpiId = { in: visibleKpis.map((k) => k.id) };

    // Scope: narrow by targetUserId. ORG ⇒ floor only. UNITS also keeps untargeted
    // (org-wide-KPI) alerts via an OR; SELF/DIRECT_REPORTS use a plain targetUserId IN.
    const scope = profile.scopeByDomain.ALERTS;
    if (scope === 'UNITS') {
      const ids = scopedUserIds('UNITS', {
        userId: ctx.userId,
        directReportIds: profile.context.directReportIds,
        unitMemberUserIds: await this.accessContext.unitMemberUserIds(),
      })!;
      where.OR = [{ targetUserId: { in: ids } }, { targetUserId: null }];
    } else if (scope === 'SELF' || scope === 'DIRECT_REPORTS') {
      const ids = scopedUserIds(scope, {
        userId: ctx.userId,
        directReportIds: profile.context.directReportIds,
        unitMemberUserIds: [],
      })!;
      where.targetUserId = { in: ids };
    }
    return where;
  }
```
Apply in `list`:
```ts
  async list(filter: ListAlertsFilter = {}): Promise<PublicAlert[]> {
    const ctx = RequestContextStore.require();
    let where: Prisma.AlertWhereInput = { organizationId: ctx.organizationId };
    if (filter.status) where.status = filter.status;
    if (filter.severity) where.severity = filter.severity;
    if (filter.kpiId) where.kpiId = filter.kpiId; // refined by the floor below if narrower
    where = await this.applyVisibility(where);
    return this.prisma.alert.findMany({
      where, select: alertSelect, orderBy: [{ createdAt: 'desc' }],
      take: Math.min(filter.limit ?? 100, 500),
    });
  }
```
*(If both `filter.kpiId` and the floor set `kpiId`, the floor wins — acceptable; a filtered KPI you can't see yields no rows. If you prefer exactness, intersect: `where.kpiId = { in: floorIds.filter(id => id === filter.kpiId) }`.)*

`getById`: after loading the alert, verify its KPI is visible and (for non-ORG) target matches; else 404. Reuse `applyVisibility` by re-querying with the id:
```ts
  async getById(id: string): Promise<PublicAlert> {
    const ctx = RequestContextStore.require();
    const where = await this.applyVisibility({ organizationId: ctx.organizationId, id } as Prisma.AlertWhereInput);
    const alert = await this.prisma.alert.findFirst({ where, select: alertSelect });
    if (!alert) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Alert not found' });
    return alert;
  }
```
**Note:** `acknowledge`/`resolve` already call `getById` first, so they inherit the gate automatically. `unreadCount` should also apply the floor (apply `applyVisibility` to its count `where`).

- [ ] **Step 4: Run tests + typecheck** (`vitest run src/alerts`, `typecheck`). Expected PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/alerts
git commit -m "feat(alerts): KPI-visibility floor + ALERTS scope (Phase 2.5)"
```

---

## Task 10: AlertRules — KPI floor + scope

Same floor as alerts; AlertRules have no `targetUserId`, so the scope narrows by `createdById` (SELF) vs all-visible-KPI (else).

**Files:**
- Modify: `apps/api/src/alert-rules/alert-rules.service.ts` (`list`, `getById`; inject `AccessContextService`)
- Modify: alert-rules module (ensure `RbacModule` import)
- Test: `apps/api/src/alert-rules/alert-rules.service.spec.ts`
- **Do NOT touch** rule evaluation/firing.

- [ ] **Step 1: Write the failing test**

```ts
describe('AlertRulesService visibility (Phase 2.5)', () => {
  test('non-admin ⇒ kpiId limited to visible KPIs (floor)', async () => {
    const { service, prisma } = makeRulesService({ scopeByDomain: { ALERTS: 'ORG' } });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    expect(prisma.alertRule.findMany.mock.calls[0][0].where.kpiId).toEqual({ in: ['k1'] });
  });

  test('SELF ⇒ createdById == me AND visible KPI', async () => {
    const { service, prisma } = makeRulesService({ scopeByDomain: { ALERTS: 'SELF' } });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alertRule.findMany.mock.calls[0][0].where;
    expect(where.kpiId).toEqual({ in: ['k1'] });
    expect(where.createdById).toEqual({ in: ['me'] });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** (`vitest run src/alert-rules/alert-rules.service.spec.ts`). Expected FAIL.

- [ ] **Step 3: Implement** — inject `AccessContextService`; the visibility helper mirrors Task 9 but narrows by `createdById` instead of `targetUserId` and reads `scopeByDomain.ALERTS` (alert rules share the alerts domain):

```ts
  private async applyVisibility(where: Prisma.AlertRuleWhereInput): Promise<Prisma.AlertRuleWhereInput> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return where;
    const kpiWhere = buildKpiVisibilityWhere(
      kpiContextFromProfile(ctx.organizationId, ctx.userId, profile),
    ) as unknown as Prisma.KPIWhereInput;
    const visibleKpis = await this.prisma.kPI.findMany({ where: kpiWhere, select: { id: true } });
    where.kpiId = { in: visibleKpis.map((k) => k.id) };
    const scope = profile.scopeByDomain.ALERTS;
    if (scope === 'SELF') {
      where.createdById = { in: [ctx.userId] };
    } else if (scope === 'DIRECT_REPORTS') {
      where.createdById = { in: [ctx.userId, ...profile.context.directReportIds] };
    } else if (scope === 'UNITS') {
      const ids = scopedUserIds('UNITS', {
        userId: ctx.userId,
        directReportIds: profile.context.directReportIds,
        unitMemberUserIds: await this.accessContext.unitMemberUserIds(),
      })!;
      where.createdById = { in: ids };
    }
    // ORG ⇒ no createdById narrowing (floor only)
    return where;
  }
```
Apply to `list` and `getById` exactly as in Task 9 (`getById` re-queries with `{ id, ...applyVisibility }` → 404 when out of scope).

- [ ] **Step 4: Run tests + typecheck** (`vitest run src/alert-rules`, `typecheck`). Expected PASS / 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/alert-rules
git commit -m "feat(alert-rules): KPI-visibility floor + scope (Phase 2.5)"
```

---

## Task 11: Cross-domain isolation, full suite, live smoke, memory

**Files:**
- Modify/extend: the cross-tenant/isolation test if one exists for these domains; otherwise add `apps/api/src/rbac/visibility/domain-scope.int-spec.ts` style coverage isn't required if per-service specs cover it — instead run the **full suite** + a **live smoke**.
- Modify: `C:\Users\hasaa\.claude\projects\C--work-FYP-khan-KPI-NEXUS-Final\memory\project_kpi_nexus_final.md` + `MEMORY.md`

- [ ] **Step 1: Run the full API suite**

```bash
pnpm --filter @kpi-nexus/api exec vitest run
```
Expected: all green (baseline was 1255 + the new Phase-2.5 tests). The known `onboarding-cleanup.spec.ts` flake under full-parallel load is NOT a regression — re-run it isolated if it trips:
```bash
pnpm --filter @kpi-nexus/api exec vitest run src/onboarding/onboarding-cleanup.spec.ts
```

- [ ] **Step 2: Rebuild + restart the API**

```bash
pnpm --filter @kpi-nexus/api build
# kill old API, then:
cd apps/api && node --env-file=../../.env --env-file=.env dist/main.js   # run_in_background
```
Confirm the new routes mapped (`/dashboards/:id/unit-assignments`).

- [ ] **Step 3: Live smoke (parity + narrowing)** — `PYTHONIOENCODING=utf-8 python` with urllib, ASCII-only prints. Login `sara.chen@northwind.io` (admin) and `devon.reyes@northwind.io` (manager), password `Password123!`.
  - Baseline (devon, no scope set): record `/dashboards`, `/tasks`, `/okrs`, `/scheduled-reports`, `/alerts`, `/alert-rules` counts.
  - Narrow devon's role: `PATCH /roles/:id { scopeConfig: { DASHBOARDS:'SELF', TASKS:'SELF', OKRS:'SELF', REPORTS:'SELF', ALERTS:'SELF' } }`.
  - Re-fetch: counts drop; an out-of-scope `getById` returns 404; admin (sara) counts unchanged.
  - Assign a dashboard to devon's unit (`POST /dashboards/:id/unit-assignments`), set devon `DASHBOARDS:'UNITS'`, confirm it appears.
  - Revert `scopeConfig` to `{}` → counts restored (parity).
  - Confirm the alert-leak closure: as devon, every alert returned has a KPI devon can see.

- [ ] **Step 4: Update project memory** — append a Phase 2.5 paragraph to `project_kpi_nexus_final.md` (what shipped, the parity defaults, the two intentional changes, the new table/endpoints, test count) and refresh the `MEMORY.md` one-liner.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test(access): Phase 2.5 full-suite + live-smoke verification; memory update"
```

---

## Out of scope (do NOT build here)
- `PEOPLE`/`ORG`/`ANALYTICS`/`INSIGHTS` domain enforcement.
- Layer-4 data limits on these domains' lists.
- ResourcePermission wiring / `@RequireResourceAccess` (Phase 3.5).
- Any front-end (role scope editor, dashboard-assignment UI) (Phase 6b).
- RLS policies (pre-existing app-layer-only posture).

## Self-review notes (author)
- **Spec coverage:** §2 primitive → T2/T3; §3 per-domain table → T4–T10; §4 parity defaults → T4 (`DOMAIN_DEFAULT_SCOPE`) + per-domain parity tests; §5 schema → T1; §6 enforcement + exclusions → each domain task (rollup/engine/generation untouched); §7 write API → T5; §8 caching → T3; §9 testing → every task + T11.
- **Coupling called out:** the per-domain default flip (T4) must land with the dashboards rewrite or dashboard parity breaks for one commit — that's why they share a task.
- **Type consistency:** `scopedUserIds(scope, { userId, directReportIds, unitMemberUserIds })` and `DOMAIN_DEFAULT_SCOPE` are used with identical signatures in T4–T10; `applyVisibility` returns the domain's `Prisma.*WhereInput` in T9/T10.
