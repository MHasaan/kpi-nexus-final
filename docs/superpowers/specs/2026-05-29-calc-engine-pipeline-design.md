# Design: Calculation Engine Pipeline (P2 backlog #8 + foundations)

**Date:** 2026-05-29
**Branch:** `phase/p4-alerting`
**Status:** Approved for planning

## Problem

P2's plan specifies a recompute pipeline — formula KPIs that re-evaluate when their
inputs change, and parent KPIs that roll up from children — but it was never built.
A repo-wide history search (all branches, full git history) confirms `FormulaExpression`,
`KPIDependency`, `KpiCascadesService`, `calc-engine`, and `CalculationEngine` appear
**only in documentation**, never in source or schema. The plan's "Reconciliation"
block wrongly listed `KpiCascadesModule` as Built — it conflated the pure
`CascadeService.applyRollup`/`computeForParent` helper (which exists and is tested)
with the full module (CRUD, routes, cycle detection — which do not exist).

`phase/p4-alerting` is a strict superset of `master`, `phase/p2-kpi-engine`, and
`phase/p3-visualization` (contains every commit of each; merge-base with master = master's HEAD),
so there is nothing to merge — this is net-new planned work on the correct branch.

## Goal

A connected "when data changes, derived KPIs recompute" capability, built in three
layers + wiring, fully tested (unit + API e2e). Directive: follow the plan where it
specifies; pick the best method where it does not (marked 💡 below).

## What already exists (reused, not rebuilt)

- `apps/api/src/formula/formula.ts` — `parseFormula` (→ AST), `evaluateFormula`, `FormulaContext`. Pure, 50+ tests.
- `apps/api/src/kpis/cascade.service.ts` — pure `applyRollup(method, childValues, weights, customFormula)` + `aggregateChildPoints` + `CascadeService.computeForParent(parentKpiId, period)` (currently has zero callers).
- `apps/api/src/lineage/lineage.service.ts` — `LineageService.record(...)` fire-and-forget (built backlog #7, currently unused).
- `KPICascade` model — full (`parentKpiId`, `childKpiId`, `method`, `weight`, `level`, `customFormula`, `lastComputedAt`, `@@unique([parentKpiId, childKpiId])`).
- BullMQ in-process pattern — `alert-engine` (producer `InjectQueue` + fire-and-forget add with `-`-separated jobId; `BullModule.registerQueue`; `WorkerHost` processor that sets a system `RequestContextStore.run({ bypassRls: true })` before delegating to a testable service).
- Data-point insert hook — `kpi-data.service.ts` ~line 478, right after `alertEngine.enqueueEvaluateKpi(...)`.

## Data model — 1 migration, 2 new tables

`KPICascade` already exists (no migration). New migration `20260529170000_p2x_formulas_deps`:

```prisma
model FormulaExpression {
  id             String   @id @default(cuid())
  organizationId String
  kpiId          String   @unique          // one formula per KPI
  raw            String                     // source text
  ast            Json                       // parsed AST (from parseFormula)
  compiledSql    String?                    // reserved; unused at FYP scale
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId])
}

model KPIDependency {
  id             String   @id @default(cuid())
  organizationId String
  sourceKpiId    String                     // input KPI referenced by the formula
  dependentKpiId String                     // the formula KPI that consumes it
  formulaRef     String?                    // identifier as written in the formula
  createdAt      DateTime @default(now())
  @@unique([sourceKpiId, dependentKpiId])
  @@index([organizationId, sourceKpiId])
  @@index([organizationId, dependentKpiId])
}
```

Both follow the hand-written-SQL pattern (TimescaleDB drift blocks `prisma migrate dev`;
apply via `npx prisma migrate deploy`). Add `FormulaExpression` + `KPIDependency` type
exports to `packages/db/src/index.ts`.

## Layer 1 — KpiCascadesModule (`apps/api/src/kpi-cascades/`)

CRUD over the existing `KPICascade`.

- **Pure** `cascade-graph.ts`: `wouldCreateCycle(edges, parentId, childId)` (attaching child under parent must not make the directed parent→child graph cyclic); `computeLevels(edges)` (BFS depth from roots). Unit-tested.
- **Service**: `attach({parentKpiId, childKpiId, method, weight?, customFormula?})` — validates both KPIs in org, rejects self-edge and cycles (400 `CASCADE_CYCLE`), upserts edge, recomputes `level`s; `detach(id)`; `list()`; `tree()` (parent→children assembly); `rollUp(parentKpiId, period)` thin pass-through to `CascadeService.computeForParent` (kept here as the module's public rollup API).
- **Endpoints**: `GET /kpi-cascades`, `GET /kpi-cascades/all`, `POST /kpi-cascades` (KPI_EDIT), `DELETE /kpi-cascades/:id` (KPI_EDIT).

## Layer 2 — FormulaModule (`apps/api/src/kpi-formula/`)

Formula persistence + dependency-DAG wiring.

- **Pure** `formula-deps.ts`: `extractIdentifiers(ast)` (collect referenced identifier names from the AST); `wouldCreateDependencyCycle(edges, source, dependent)`. Unit-tested.
- **Service**: `attach(kpiId, raw)` → `parseFormula(raw)` (400 on parse error) → `extractIdentifiers` → resolve names to KPIs by name in org (💡 by-name, consistent with the cascade evaluator; unknown names → 400 `UNKNOWN_KPI_REFS` listing them) → reject dependency cycles (400 `FORMULA_CYCLE`) → upsert `FormulaExpression` (store `raw` + `ast`) → replace this KPI's `KPIDependency` edges. `detach(kpiId)` (delete expression + its dep edges). `get(kpiId)`.
- **Endpoints**: `GET /kpis/:id/formula` (KPI_VIEW), `PUT /kpis/:id/formula` (KPI_EDIT), `DELETE /kpis/:id/formula` (KPI_EDIT).

## Layer 3 — CalculationEngineModule (`apps/api/src/calculation-engine/`)

- **Files**: `calculation-engine.module.ts`, `.producer.ts`, `.processor.ts`, `.service.ts`.
- **Queue** `calc-engine`. **Producer**: `enqueueRecompute({organizationId, kpiId})`, `enqueueCascadeRollup({organizationId, parentKpiId, periodStart, periodEnd})` — fire-and-forget, deterministic `-`-separated jobIds, swallow+log on failure.
- **`CalculationEngineService`** (testable core, shared by processor AND sync endpoints):
  - `recomputeKpi(kpiId)`: load `FormulaExpression`; for each dependency source, load its latest data-point value; bind names→values; `evaluateFormula(ast-or-raw, context)`; write a **COMPUTED** `KPIDataPoint` for `kpiId` (direct Prisma write, bypassing `DataPointsService`); `LineageService.record(FORMULA, source→kpi)` per source; return the computed value. After success the **processor** enqueues recompute of this KPI's `KPIDependency` dependents (transitive; DAG acyclic ⇒ terminates).
  - `rollupParent(parentKpiId, period)`: `CascadeService.computeForParent`; if value non-null, write parent **COMPUTED** point + `LineageService.record(CASCADE_ROLLUP, child→parent)` per contributing child; processor then enqueues rollup of the parent's own parents.
- **Processor** (`WorkerHost`, system `RequestContext` per job): routes `recompute` / `cascade-rollup` job names to the service, then performs the transitive enqueues.
- **💡 Sync trigger endpoints** (KPI_EDIT): `POST /kpis/:id/recompute`, `POST /kpis/:id/rollup` — call the same service methods synchronously and return the resulting value/point. Needed for deterministic e2e and user-facing "recompute now".

## Wiring — DataPointsService

In `kpi-data.service.ts`, after `alertEngine.enqueueEvaluateKpi(...)`, when the inserted
point's `sourceType !== 'COMPUTED'`: fire-and-forget enqueue (a) cascade rollup for each
parent of the inserted KPI over the point's period, and (b) recompute for each formula
dependent of the inserted KPI. The `CalculationEngineProducer` is exported from its module
and injected into `KpisModule` one-way (mirrors `AlertEngineProducer`), so no circular dep.

### Re-entry guard

COMPUTED points are written by the engine via direct Prisma writes, never through
`DataPointsService.create`, so they never trigger the insert→enqueue path. Transitive
recompute/rollup is driven explicitly inside the processor by walking the (acyclic)
dependency / cascade graphs — bounded and terminating.

## Error handling

- Producers swallow+log (a queue hiccup never fails a data-point write).
- Cycle attempts rejected at attach time on both graphs (400).
- Null rollup (no child data in period) → no write, no lineage edge.
- Formula eval error at recompute → logged, no COMPUTED point written (KPI keeps last value); surfaced synchronously (400/422) when called via the sync endpoint.

## Testing

**Unit (Vitest):**
- `cascade-graph`: cycle detection (self, direct, transitive, diamond-no-cycle), level BFS.
- `formula-deps`: identifier extraction (nested exprs, functions, dedup), dependency cycle detection.
- recompute value-assembly helper (bind sources → context). `applyRollup` already covered.

**API e2e (Playwright `request`):**
- Cascade CRUD + cycle reject (400).
- Formula attach/detach + dependency edges created/removed + cycle reject + unknown-ref reject.
- `POST /kpis/:id/recompute` → COMPUTED point written + lineage FORMULA edges + `GET /lineage` shows them.
- `POST /kpis/:id/rollup` → parent COMPUTED point + CASCADE_ROLLUP lineage edges.
- Reactive path: insert child data point → poll until parent rollup COMPUTED point appears.
- Lineage `trace` now returns a populated graph (closes the loop with backlog #7).

## Out of scope (deferred)

- FE pages (`/kpis/[id]/formula` editor exists per plan as separate FE work; `/kpis/[id]/cascade`, `/lineage` SVG remain deferred FE items).
- `compiledSql` generation (PG pushdown) — reserved column, unused at FYP scale.
- Scheduled/cron recompute — reactive + manual triggers only for now.

## Build order

1. Migration + db exports (FormulaExpression, KPIDependency).
2. KpiCascadesModule (CRUD + pure cycle/level) — commit.
3. FormulaModule (attach/detach + pure deps) — commit.
4. CalculationEngineModule (queue + service + processor + sync endpoints) — commit.
5. DataPointsService wiring (reactive enqueue) + reactive e2e — commit.

Each step: model/migration → pure logic + unit tests → service/controller → API e2e →
plan/TODOS reconciliation → commit. Regenerating the Prisma client requires killing the
API dev server first (locks `query_engine-windows.dll.node`).
