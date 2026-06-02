# Granular Access — Phase 4: Data Limits ("how much / how old")

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add Layer-4 **data limits** — role-configurable `historyWindowDays` (clamp how *old* the KPI data
a user can read is), `maxListRows` (cap KPI data-point list size), and `maxExportRows` (cap report export
rows). `null` = unlimited ⇒ parity; admins bypass.

**Architecture:** Mirrors Phases 2/3. `RoleDefinition.dataLimits` (JSON) → `AccessProfile.dataLimits` via
`AccessContextService` → applied at **user-facing** KPI data reads through shared `clampHistoryFrom` /
`clampTake` helpers + an `AccessContextService.dataLimits()` convenience.

**Tech Stack:** NestJS 11 · Prisma 6 · Zod (`@kpi-nexus/contracts`) · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-granular-access-control-design.md` §3 (Layer 4), §8, §10 (Phase 4).

## Critical scoping decision (from a 3-agent code audit — 18 data-point read sites found)

Layer-4 limits what a **user can READ**, NOT what the **system computes**. The understand sweep found
~18 `KPIDataPoint` reads; clamping the *internal* ones by the triggering user's role would corrupt
analytics for everyone. So:

**ENFORCE `historyWindowDays` at user-facing reads only:**
`kpi-data.listForKpi`, `kpi-data.dashboardSummary`, `embed-token.resolve` (creator's window),
`snapshots.capture` + `share-links.resolve` (creator's window), and the on-demand analytics
(`forecasts`, `anomaly` detect, `whatif`, `seasonality`).

**DO NOT clamp (internal/system — would corrupt data/analytics):**
`computeOutlierFlag` (write-time), `calculation-engine.recomputeKpi`, `cascade` rollup,
`insights`/`recommendations` generation, scheduled anomaly detection.

**ENFORCE `maxListRows`** on the KPI data-point list (`listForKpi` take, `dashboardSummary` internal take).
**ENFORCE `maxExportRows`** in report export assembly (`reports.buildDataset`).

**Deferred (noted):** general non-KPI list caps (`audit`/`activity`/`alerts`/`search`/`notification-deliveries`),
EXPORTS-capability re-gating of `/reports/generate`.

---

## Semantics
`clampHistoryFrom(requestedFrom, historyWindowDays)`: `null` window ⇒ return requestedFrom unchanged
(parity); else `windowStart = now - windowDays`; no requestedFrom ⇒ `windowStart`; else
`max(requestedFrom, windowStart)`. For fixed-window analytics reads (no `from`), add
`recordedAt >= windowStart`. `clampTake(requested, maxListRows, fallbackCap)`:
`min(requested ?? fallbackCap, maxListRows ?? fallbackCap)`. Admin ⇒ `dataLimits` all null ⇒ no-op.

---

## Task 1: contract + helpers
- [ ] `packages/contracts/src/access.ts`: add `DataLimitsConfigSchema = DataLimitsSchema.partial()` (+ `DataLimitsConfig` type) + test in `access.spec.ts`. Build contracts.
- [ ] `apps/api/src/rbac/visibility/kpi-visibility.ts` (or a small `data-limits.ts`): export `clampHistoryFrom` + `clampTake`. (Keep alongside `isCategoryAllowed`.)
- [ ] **Commit** `feat(contracts): DataLimitsConfig + clamp helpers`.

## Task 2: migration
- [ ] `RoleDefinition.dataLimits Json?` + `packages/db/prisma/migrations/20260602010000_p_role_data_limits/migration.sql` (`ADD COLUMN IF NOT EXISTS "dataLimits" jsonb;`). Kill API; db execute + migrate resolve + generate.
- [ ] **Commit** `feat(db): RoleDefinition.dataLimits (additive)`.

## Task 3: AccessContext resolves dataLimits + convenience
- [ ] `access-context.service.ts`: extend `loadRoleConfig` findFirst select with `dataLimits`; parse via `DataLimitsConfigSchema`; populate `profile.dataLimits` (admin/unset ⇒ all null). Add `async dataLimits(): Promise<DataLimits>` (resolve profile → profile.dataLimits; admin ⇒ all null).
- [ ] Spec: `FakePrisma` returns `dataLimits`; test (role dataLimits → profile.dataLimits; admin null). Run.
- [ ] **Commit** `feat(rbac): AccessContext resolves role dataLimits`.

## Task 4: kpi-data enforcement (history + maxListRows)
- [ ] `kpi-data.service.ts`: resolve `const limits = await this.accessContext.dataLimits()` in `listForKpi` + `dashboardSummary`. listForKpi: `const from = clampHistoryFrom(opts.from, limits.historyWindowDays)` → set `where.periodStart = { gte: from }` when defined; `take: clampTake(opts.limit, limits.maxListRows, 5000)` (keep the existing `?? 1000` default inside). dashboardSummary: clamp `opts.from` the same; the per-KPI point query `take: clampTake(undefined, limits.maxListRows, 1000)`.
- [ ] Spec/tests for the clamp behaviour (history clamps from; maxListRows caps take; null ⇒ parity).
- [ ] **Commit** `feat(rbac): kpi-data honours historyWindowDays + maxListRows`.

## Task 5: roles PATCH dataLimits
- [ ] DTO `dataLimits: DataLimitsConfigSchema.optional()`; `roles.service` roleSelect/PublicRole/toPublicRole/update add `dataLimits`. Test persistence.
- [ ] **Commit** `feat(roles): PATCH /roles/:id sets dataLimits`.

## Task 6: peripheral clamps (fan-out)
- [ ] embed-token.resolve, snapshots.capture, share-links.resolve (use the principal/creator allowlist already wired): add `recordedAt >= windowStart` when historyWindowDays set.
- [ ] analytics forecasts/anomaly/whatif/seasonality: inject AccessContextService; clamp the historical read window to `min(WINDOW, historyWindowDays)` via `recordedAt >= windowStart`.
- [ ] reports.buildDataset: cap assembled points to `maxExportRows` (slice total across KPIs).
- [ ] Each with a focused test. **Commit** `feat(rbac): clamp peripheral KPI reads + report export to data limits`.

## Task 7: verify
- [ ] Full API + web suites + typecheck. Adversarial review workflow (bypass holes, internal-vs-user correctness, parity, admin bypass). Fix confirmed.
- [ ] Rebuild + restart API; live: set a role `dataLimits {historyWindowDays: N, maxExportRows: M}` → that user's `/kpis/:id/data` returns only points within N days + export capped; admin unaffected; revert.
- [ ] **Commit** `test(rbac): verify Phase 4 data limits + parity`.

---

## Deferred (explicit)
- Internal/system computations are intentionally NOT clamped (see scoping decision).
- General non-KPI list caps (audit/activity/alerts/search/notification-deliveries) → follow-up.
- EXPORTS-capability re-gating of `/reports/generate` → follow-up.
- Per-user overrides → Phase 5. Access Center UI (incl. limits editor) → Phase 6.

## Adversarial-review hardening (post-implementation)

A 22-agent adversarial review confirmed **9 issues**; all fixed in commit `ca5bb82`:
- **Scheduled-report processor** ran *as the creator* (for visibility) and therefore silently
  imported the creator's read quotas → cron reports truncated. Fixed with a `bypassDataLimits`
  context flag honoured by `AccessContextService.dataLimits()`; visibility still applies.
- **NLQ `/ask`** fed unbounded recent values to the LLM → now clamped by `historyWindowDays`.
- **embed-token.resolve** (the deferred peripheral site) — now stamps the minter (`mby`) into the
  token and clamps the public sparkline to the minter's window (legacy tokens ⇒ no clamp = parity).
- **`maxListRows` distorted `dashboardSummary` aggregates** — removed there (it caps the raw
  data-point *list*, not the aggregation input); `historyWindowDays` still bounds the aggregate window.
- **`clampHistoryFrom` overflow** → degrades to parity; `DataLimitsSchema` gains sane `.max` caps.

**Refuted (no change, intentional):** `POST /insights/generate` + `POST /recommendations/generate`
read recent points unbounded, but AI-*generation* is the documented deferred family (Phase 3), not a
plain read. Benchmarks (`days` is user-specified), OKR sync (internal materialization), and
threshold-band status (derived label) are internal/by-design.

**Accepted (documented):** the window bound is applied on `periodStart` in the list family
(`listForKpi`/`dashboardSummary`, matching their existing `from`/`to`) and on `recordedAt` in the
latest-point/ML-series reads (their order key). For a *backfilled* point these can diverge; each site
is internally consistent. Single-axis unification is a possible later refinement.
