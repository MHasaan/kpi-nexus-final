# Handoff

## State
Branch `phase/p4-alerting`. Completing the **P0–P4 audit gap list** (user: "complete all the missing ones"). Audit found P0/P1/P3/P4 meet exit criteria; P2 engine done but had **3 false-positive `[x]` modules** (never built) + P1 backlog + FE pages. Working through them with TDD → tests → per-module commit.

### DONE this session (calc-engine pipeline #8 earlier, then audit gaps):
- Calc-engine pipeline: KpiCascadesModule, FormulaModule persistence, CalculationEngineModule + reactive wiring (spec+plan in docs/superpowers/).
- **Audit gap #11 OutlierDetector** (`feat(p2): OutlierDetector`): pure Welford 3σ (9 tests) + `isOutlier` column + wired into data-point insert + e2e.
- **Audit gap #12 UserKpisModule** (`feat(p2): UserKpisModule`): targetValue/currentValue/status on KPIAssignmentUser; assign/unassign/listMyKpis; pure `computeAssignmentStatus` (10 tests); record refreshes status; e2e.
- **Audit gap #13 OrgUnitKpisModule** (`feat(p2): OrgUnitKpisModule`): inherited/inheritedFromUnitId/target/current/status on KPIAssignmentOrgUnit; assign/override/unassign/list with inheritance cascade (recompute-from-scratch, nearest-direct-ancestor); pure `computeInheritedAssignments` (7 tests, cycle-safe); e2e.

API unit suite **567/567**; api lint **0 errors**; all new e2e green. P2 engine + scope modules now genuinely complete; the 3 false-positive checkboxes corrected in plan.

- **Audit gap #14 BillingModule** (`feat(p1): BillingModule`): pure quota-check (6 tests); lazy FREE/PRO/ENTERPRISE catalog; assertWithinQuota wired into KpisService.create (→402, default ENTERPRISE unlimited so no regression); hasFeature/setPlan; GET /billing; e2e. **573/573 unit.**

- **Audit gap #15 RateLimitModule** (`feat(p1): RateLimitModule`): pure policy (4 tests) + Redis ZSET sliding-window service + env-gated global guard `RATE_LIMIT_ENABLED` (OFF by default — else it 429s the e2e suite's localhost /auth/register burst) + 3 guard tests. **580/580 unit.**

## NEXT — remaining audit gaps (tasks 16–19, in priority order)
16. **GDPR**: `UsersService.purge()` (PII redaction + cascade) + `OffboardingService.offboard()` (KPI ownership transfer, direct-report reparent, unit leave).
- **DONE #16 GDPR purge + Offboarding** (584/584; purgedHandle 4 tests + e2e).

- **DONE #17** PlatformAdmin + CustomDomains + OrgUnitDimensions/Types modules (e2e org-config; +8 unit tests).
- **DONE #18** seedDemoData (`POST /demo-data/seed`, e2e) + `scripts/bench-hypertable.mjs` (validated). Hypertable already active (KPIDataPoint), setup-db.mjs handles it — audit claim was stale.

### Task 19 (frontend) — DONE. **P2 IS NOW FULLY COMPLETE (backend + FE).**
Built + browser-e2e'd: `/kpis/[id]` detail (9 tabs: Overview/Data/Formula/Cascade/Targets/Thresholds/Benchmarks/Lineage/Audit), `/kpis/templates`, `/kpis/tree`, `/kpis/scorecard` (+ added `scorecardQuadrant` column threaded through create/update/dashboardSummary), `/kpis/archive` (+ backend listArchived/restore/purge routes), `/my-kpis`, `/team`, `/users/[id]`. Fixed stale P3 TODOS too. All 6 KPI-FE e2e pass as a suite; api 591/591; api+web lint 0 errors.
- **FE pattern**: client-component pages (`'use client'`), `api(path,{method,body:JSON.stringify})` from `lib/api-client.ts`; auth via localStorage keys `kpi-nexus.access-token`/`.refresh-token` (seed in browser e2e via page.evaluate after goto('/')); token classes `bg-surface-bg/surface-1`, `text-content-strong/muted`, `border-border`, `accent-primary`, `status-critical/positive/warning`. Browser e2e auto-starts web via playwright webServer.
- **Simplifications noted in plan**: Formula tab = validated textarea (not dnd-kit visual editor); scope data-entry via Data tab + /my-kpis (no standalone /kpis/[id]/data page); scorecard/lineage/benchmark visualizations are lists not charts/SVG. Onboarding wizard is P6.

## PHASE STATUS: P0,P1,P3,P4 done + tagged; **P2 now fully complete** (backend+FE). P5–P9 NOT started (plans exist, zero code). Next phase per sequence: P5 (AI layer) — `docs/superpowers/plans/P5-ai-layer.md`.

## Context / patterns (all confirmed)
- Per module: hand-write migration SQL (TimescaleDB drift blocks `prisma migrate dev`; apply via `cd packages/db && npx prisma migrate deploy`). Add model type export to `packages/db/src/index.ts` + `pnpm --filter @kpi-nexus/db build`. ADD COLUMN is safe on the KPIDataPoint hypertable.
- **Regen Prisma client requires killing the API dev server first** (locks query_engine dll): `Get-Process node | Where CommandLine -like '*nest*'/'*kpi-nexus/api*'/'*apps\api\dist*' | Stop-Process -Force`. Use `npx prisma` / `npx vitest` (pnpm exec flaky). Don't use `2>$null` in Bash tool.
- Pure-logic-in-its-own-file + unit tests; thin service; API e2e via Playwright `request` (skip-if-api-down pattern). Fix new-file `sort-imports` (uppercase type imports first).
- DI cycle avoidance: a module that KpisModule imports must NOT import KpisModule (provide CascadeService directly if needed). `@RequirePermissions(a,b)` = AND.
- KPI create requires scope-matching assignment arrays: PER_USER needs `userIds`, PER_UNIT needs `orgUnitIds`. `/auth/me` returns `{ user }`. KPI names are unique per org + double as formula identifiers.
- Stack: `pnpm docker:up` (start Docker Desktop yourself) + api `pnpm --filter @kpi-nexus/api dev` :4000 + web :3000. Every implemented thing must be tested before claiming done.
