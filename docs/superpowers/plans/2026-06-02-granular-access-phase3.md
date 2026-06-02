# Granular Access — Phase 3: Data-Type Filters (KPI category allowlist)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add Layer 3 ("what *type* of data") — a role-configurable **KPI category allowlist**. A role can
be restricted to specific KPI categories (`null` = all → parity; `[]` = none; `[ids]` = only those). Enforced
across every KPI list/read path via the shared visibility builder. Default (unset) = today's behaviour.

**Architecture:** Mirrors Phase 2's `scopeConfig`. `RoleDefinition.dataTypeConfig` (JSON) → resolved into
`AccessProfile.dataTypeFilters.kpiCategoryIds` by `AccessContextService` → carried on `KpiVisibilityContext`
→ AND-injected as `categoryId: { in: [...] }` in `buildKpiVisibilityWhere` + the `kpi-data.service`
in-memory filters. Admin bypass unchanged. `/auth/me` already returns `dataTypeFilters`.

**Tech Stack:** NestJS 11 · Prisma 6 · Zod (`@kpi-nexus/contracts`) · Vitest · Next.js 15.

**Spec:** `docs/superpowers/specs/2026-06-01-granular-access-control-design.md` §3 (Layer 3), §6, §8, §10 (Phase 3).

**Scope decision (grounded in a 5-agent code audit):**
- ENFORCE **`kpiCategoryIds`** only — it's the canonical "what type" filter and AND-injects cleanly at the
  `KPI.categoryId` column. No silent no-op config.
- **DEFER** `orgUnitIds`/`dashboardIds` enforcement (overlaps scope / is per-entity) and **ResourcePermission
  wiring** (`@RequireResourceAccess` + guard hook + grants branch — 30% wired, 0% live, needs a design call)
  → **Phase 3.5**. Also pre-existing scope gaps in `SearchService.search` and `InsightsService.generateBatch`
  (they apply *no* visibility today) are noted, not fixed here.

**Enforcement chokepoints (from audit):** `buildKpiVisibilityWhere` (covers `kpis.service.list`),
`kpi-data.service` `dashboardSummary` (top query + `filterByVisibility`) and `listForKpi`. NLQ + board-pack
inherit via those.

---

## Category-filter semantics (non-admin)

`allowedCategoryIds` on the visibility context, sourced from `profile.dataTypeFilters.kpiCategoryIds`:

| value | meaning | where fragment |
|---|---|---|
| `null`/`undefined` | all categories (parity) | *(no `categoryId` constraint)* |
| `[]` | none | `categoryId: { in: [] }` → matches nothing |
| `[ids]` | only those | `categoryId: { in: ids }` |

Applied as a **top-level AND** (orthogonal to scope): even ORG_WIDE KPIs outside the allowed categories are
hidden (a Sales-only analyst doesn't see Finance org-wide KPIs). **Admins bypass** (no category filter).

---

## Task 1: `DataTypeConfigSchema` contract

**Files:** Modify `packages/contracts/src/access.ts`; Test `packages/contracts/src/access.spec.ts`.

- [ ] **Step 1:** Add after `DataTypeFiltersSchema`:
```ts
/** Layer-3 role config — which data types a role may see. Only kpiCategoryIds is
 *  enforced (Phase 3); null/absent = all (parity). orgUnitIds/dashboardIds deferred. */
export const DataTypeConfigSchema = z.object({
  kpiCategoryIds: z.array(z.string()).nullable().optional(),
});
export type DataTypeConfig = z.infer<typeof DataTypeConfigSchema>;
```
- [ ] **Step 2:** Test: parses `{ kpiCategoryIds: ['c1'] }`, `{ kpiCategoryIds: null }`, `{}`; rejects `{ kpiCategoryIds: 'x' }`.
- [ ] **Step 3:** `pnpm --filter @kpi-nexus/contracts build` + run the spec → green.
- [ ] **Step 4: Commit** `feat(contracts): DataTypeConfig (KPI category allowlist)`.

## Task 2: `RoleDefinition.dataTypeConfig` migration

**Files:** Create `packages/db/prisma/migrations/20260602000000_p_role_data_type_config/migration.sql`; modify `schema.prisma`.

- [ ] **Step 1:** Add `dataTypeConfig Json?` to `RoleDefinition` (after `scopeConfig`).
- [ ] **Step 2:** `migration.sql`: `ALTER TABLE "RoleDefinition" ADD COLUMN IF NOT EXISTS "dataTypeConfig" jsonb;`
- [ ] **Step 3:** Kill API (DLL lock); `prisma db execute --file … --schema …`; `prisma migrate resolve --applied 20260602000000_p_role_data_type_config`; `prisma generate`.
- [ ] **Step 4: Commit** `feat(db): RoleDefinition.dataTypeConfig (additive)`.

## Task 3: AccessContext resolves dataTypeFilters from role config

**Files:** Modify `apps/api/src/rbac/services/access-context.service.ts` + spec.

- [ ] **Step 1:** Import `DataTypeConfigSchema`, `type DataTypeConfig`. Add a `loadRoleDataTypeConfig(isAdmin, roleId)` mirroring `loadRoleScopeConfig` (select `dataTypeConfig`; `DataTypeConfigSchema.safeParse(... ?? {})`; admin/no-role ⇒ `{}`). Fetch it alongside the scope config (extend the existing `roleDefinition.findUnique` select to `{ scopeConfig, dataTypeConfig }` to avoid a second query).
- [ ] **Step 2:** Replace the hardcoded `dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null }` with `{ kpiCategoryIds: roleDataType.kpiCategoryIds ?? null, orgUnitIds: null, dashboardIds: null }` (admin ⇒ all null).
- [ ] **Step 3:** Spec: extend `FakePrisma.roleDefinition.findUnique` to return `{ scopeConfig, dataTypeConfig }`; add a `roleDataTypeConfig` field + test "role dataTypeConfig sets kpiCategoryIds; admin stays null".
- [ ] **Step 4:** Run `vitest run src/rbac/services/access-context.service.spec.ts` → green.
- [ ] **Step 5: Commit** `feat(rbac): AccessContext resolves role dataTypeConfig → dataTypeFilters`.

## Task 4: KPI visibility ANDs the category allowlist

**Files:** Modify `apps/api/src/rbac/visibility/kpi-visibility.ts` + spec.

- [ ] **Step 1:** Add `allowedCategoryIds?: readonly string[] | null` to `KpiVisibilityContext`. Add optional `categoryId?: { in: readonly string[] }` to `KpiVisibilityWhere`.
- [ ] **Step 2:** In `buildKpiVisibilityWhere`, after the admin short-circuit, build `const where = { organizationId }; if (ctx.allowedCategoryIds != null) where.categoryId = { in: ctx.allowedCategoryIds };` then attach the scope branches to `where` (ORG returns `where`; else `where.OR = branches`). Keep admin returning `{ organizationId }` (no category filter).
- [ ] **Step 3:** `kpiContextFromProfile` sets `allowedCategoryIds: profile.dataTypeFilters.kpiCategoryIds`.
- [ ] **Step 4:** Spec: existing fixtures omit `allowedCategoryIds` (undefined ⇒ no filter ⇒ 12-case matrix + scope ladder stay green = parity). Add a `describe('category allowlist')`: `allowedCategoryIds: ['cat_sales']` ⇒ `where.categoryId.in == ['cat_sales']` AND scope branches still present; `[]` ⇒ `{ in: [] }`; admin ignores it. Update bridge-parity `profileFor` to pass `kpiCategoryIds: ctx.allowedCategoryIds ?? null`.
- [ ] **Step 5:** `vitest run src/rbac src/kpis src/nlq` → green (parity). `tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat(rbac): enforce KPI category allowlist in visibility builder`.

## Task 5: kpi-data.service category enforcement

**Files:** Modify `apps/api/src/kpis/kpi-data.service.ts` (+ any spec).

- [ ] **Step 1:** `dashboardSummary`: add `categoryId: true` to the KPI select; AND `categoryId: visibility.allowedCategoryIds != null ? { in: visibility.allowedCategoryIds } : undefined` (admin ⇒ undefined) onto the top-level `where`.
- [ ] **Step 2:** `filterByVisibility`: first drop any row whose category is not allowed: `if (visibility.allowedCategoryIds != null && !(k.categoryId != null && visibility.allowedCategoryIds.includes(k.categoryId))) return false;` before the scope checks. (Type the generic `T` to include `categoryId: string | null`.)
- [ ] **Step 2b:** `listForKpi`: after fetching the KPI, if `visibility.allowedCategoryIds != null` and the KPI's `categoryId` isn't in it, throw `NotFoundException` (hide, no existence leak). Select `categoryId` on that fetch.
- [ ] **Step 3:** `vitest run src/kpis` → green. `tsc --noEmit` clean.
- [ ] **Step 4: Commit** `feat(rbac): kpi-data list/summary honour category allowlist`.

## Task 6: PATCH /roles dataTypeConfig

**Files:** Modify `apps/api/src/roles/dto/update-role.dto.ts`, `roles.service.ts` (+ spec).

- [ ] **Step 1:** DTO: add `dataTypeConfig: DataTypeConfigSchema.optional()`.
- [ ] **Step 2:** `roles.service.ts`: `roleSelect` += `dataTypeConfig: true`; `PublicRole` += `dataTypeConfig: DataTypeConfig | null`; `toPublicRole` casts it; `update()` data += `dataTypeConfig: dto.dataTypeConfig ?? undefined`. (Caches already invalidated via `invalidateCaches`.)
- [ ] **Step 3:** Spec: extend `FakeRole` + add test "update persists dataTypeConfig and invalidates caches".
- [ ] **Step 4:** `vitest run src/roles` → green. `tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(roles): PATCH /roles/:id sets dataTypeConfig`.

## Task 7: Full verification + adversarial review + live smoke

- [ ] **Step 1:** Full API suite → green (only the known onboarding flake). Web typecheck + build.
- [ ] **Step 2:** Adversarial review workflow on the diff (dimensions: cross-tenant safety, parity, category-bypass holes, admin-bypass correctness). Triage + fix confirmed issues.
- [ ] **Step 3:** Rebuild + restart API. Live: pick a demo category; `PATCH /roles/:id { dataTypeConfig: { kpiCategoryIds: [<one cat>] } }`; that role's users' `GET /kpis` returns only KPIs in that category (strictly fewer); admin unaffected; revert.
- [ ] **Step 4: Commit** `test(rbac): verify Phase 3 category allowlist + parity` (if fixtures changed).

---

## Deferred (explicit)
- `orgUnitIds` / `dashboardIds` allowlist enforcement → later refinement.
- **ResourcePermission** additive grants + `@RequireResourceAccess` decorator + guard hook + canonical action enum → **Phase 3.5**.
- `SearchService.search`, `InsightsService.generateBatch`, **`RecommendationsService.list`** apply no KPI visibility today (pre-existing scope gap — they expose KPI names / AI-derived text regardless of scope OR category) → separate hardening slice that routes them through the visibility builder.
- Per-user overrides → Phase 5. Access Center UI (incl. category picker) → Phase 6.

## Adversarial-review hardening (post-implementation)

A 4-dimension adversarial review (22 agents) confirmed **12 issues**. The category filter at first
covered only `buildKpiVisibilityWhere` + `kpi-data` — the review found **sibling KPI read paths that
bypassed it**. All confirmed *leaks* are closed in the hardening commits via the shared
`isCategoryAllowed` + `AccessContextService.kpiCategoryAllowlist()`:
embed-token mint, org-unit-kpi list, cascade list/tree, targets/threshold-bands/benchmarks,
dashboard snapshots + share-links, user-kpi (my-kpis/team) lists. Defense-in-depth: `loadRoleConfig`
now reads the role **org-scoped**; role `dataTypeConfig.kpiCategoryIds` is **tenant-validated** on write.

**Accepted by design (documented, not changed):** a non-null allowlist also hides **uncategorized
(categoryId = null) KPIs** — including org-level metrics — consistently across all sites (matches
`categoryId IN (…)` SQL semantics + the `[] = none` rule). An admin setting an allowlist should know it
excludes uncategorized KPIs. Revisit (keep null-category visible) if product wants it.
