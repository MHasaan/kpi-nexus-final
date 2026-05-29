# Calc-Engine Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P2 recompute pipeline — cascade rollups + formula recomputation that fire reactively on data-point inserts — on `phase/p4-alerting`.

**Architecture:** Three layers (KpiCascadesModule CRUD, FormulaModule persistence + dependency DAG, CalculationEngineModule BullMQ queue) plus reactive wiring in DataPointsService. Pure logic (cycle detection, level BFS, identifier extraction, value assembly) lives in standalone `*.ts` files, unit-tested; thin services glue them to Prisma; controllers expose CRUD + synchronous recompute/rollup triggers; the BullMQ processor reuses the service methods. COMPUTED points are written via direct Prisma (never through DataPointsService) so they don't re-trigger work.

**Tech Stack:** NestJS, Prisma, @nestjs/bullmq, Vitest, Playwright (`request`). Reuses `formula.ts` evaluator, `cascade.service.ts` (`applyRollup`/`computeForParent`), `LineageService.record`, and the existing `KPICascade` model.

Spec: `docs/superpowers/specs/2026-05-29-calc-engine-pipeline-design.md`.

**Cross-cutting conventions (apply to every task):**
- Hand-write migration SQL (TimescaleDB drift blocks `prisma migrate dev`); apply with `cd packages/db && npx prisma migrate deploy`.
- Regenerating the Prisma client requires killing the API dev server first (locks `query_engine-windows.dll.node`): kill port-4000 listener AND the `nest start --watch` watcher. Use `npx prisma` (not `pnpm exec prisma`) and `npx vitest` from `apps/api` (pnpm exec is flaky on this box).
- Pure logic in its own file + unit test; service uses `RequestContextStore.require()` + explicit `organizationId`; controllers gated with `@RequirePermissions`; parse bodies/queries with zod `safeParse` → `BadRequestException`.
- Register each new module in `apps/api/src/app.module.ts`. Add new model type exports to `packages/db/src/index.ts` + `pnpm --filter @kpi-nexus/db build`.
- Per task: keep api lint at 0 errors (fix sort-imports in new files), run unit suite, run e2e, tick plan/TODOS reconciliation, commit.

---

### Task 1: Schema — FormulaExpression + KPIDependency

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add 2 models after `LineageEdge`)
- Create: `packages/db/prisma/migrations/20260529170000_p2x_formulas_deps/migration.sql`
- Modify: `packages/db/src/index.ts` (export `FormulaExpression`, `KPIDependency`)

- [ ] **Step 1:** Add models (exact fields from spec "Data model" section): `FormulaExpression` (`kpiId @unique`, `raw String`, `ast Json`, `compiledSql String?`, org + timestamps, `@@index([organizationId])`) and `KPIDependency` (`sourceKpiId`, `dependentKpiId`, `formulaRef String?`, `@@unique([sourceKpiId, dependentKpiId])`, indexes on `[organizationId, sourceKpiId]` and `[organizationId, dependentKpiId]`).
- [ ] **Step 2:** Hand-write `migration.sql`: two `CREATE TABLE`s + indexes + `organizationId` FK to `Organization(id) ON DELETE CASCADE`. Unique index on `FormulaExpression(kpiId)` and on `KPIDependency(sourceKpiId, dependentKpiId)`.
- [ ] **Step 3:** Add `FormulaExpression, KPIDependency` to the `@prisma/client` type re-export block in `packages/db/src/index.ts`.
- [ ] **Step 4:** Kill API dev server; `cd packages/db && npx prisma generate`; `pnpm --filter @kpi-nexus/db build`; `npx prisma migrate deploy`. Expected: migration applied, build clean.
- [ ] **Step 5:** Commit `feat(p2): FormulaExpression + KPIDependency models + migration`.

---

### Task 2: KpiCascadesModule — pure graph logic

**Files:**
- Create: `apps/api/src/kpi-cascades/cascade-graph.ts`
- Test: `apps/api/src/kpi-cascades/cascade-graph.spec.ts`

- [ ] **Step 1: Write failing tests.** `Edge = {parentKpiId, childKpiId}`.
  - `wouldCreateCycle(edges, parent, child)`: true for self-edge (parent===child); true when child is already an ancestor of parent (direct + transitive); false for a new leaf; false for a diamond (shared descendant, no cycle).
  - `computeLevels(edges)`: returns `Map<kpiId, number>` = BFS depth from roots (roots = nodes never appearing as a child → level 0); child = max(parent levels)+1; diamond node gets the deeper level.
- [ ] **Step 2:** `npx vitest run src/kpi-cascades/cascade-graph.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `cascade-graph.ts`: build adjacency parent→children; `wouldCreateCycle` = DFS from `child` following existing edges to see if it reaches `parent` (or self-edge); `computeLevels` = Kahn/BFS longest-path from roots.
- [ ] **Step 4:** Run tests → PASS (target ≥6 cases).
- [ ] **Step 5:** Commit `feat(p2): cascade graph cycle-detection + level BFS (pure)`.

---

### Task 3: KpiCascadesModule — service, controller, module

**Files:**
- Create: `apps/api/src/kpi-cascades/dto/cascade.dto.ts`, `kpi-cascades.service.ts`, `kpi-cascades.controller.ts`, `kpi-cascades.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1:** DTO — `AttachCascadeDtoSchema` (`parentKpiId`, `childKpiId` required; `method` enum `SUM|AVG|WEIGHTED_AVG|MIN|MAX|CUSTOM_FORMULA` default SUM; `weight` number ≥0 default 1; `customFormula` optional string).strict().
- [ ] **Step 2:** Service `KpiCascadesService`:
  - `attach(dto)`: require both KPIs in org (404 if not); load org edges; `wouldCreateCycle` → 400 `CASCADE_CYCLE`; upsert by `@@unique([parentKpiId, childKpiId])`; after write, recompute `level`s via `computeLevels` and `updateMany`/per-row update; audit CREATE; return row.
  - `detach(id)`: require row in org; delete; audit DELETE.
  - `list()`: org edges with parent/child id+name.
  - `tree()`: assemble `[{ parentKpiId, parentName, level, children: [{childKpiId, childName, method, weight}] }]`.
  - `rollUp(parentKpiId, periodStart, periodEnd)`: delegate to `CascadeService.computeForParent`.
- [ ] **Step 3:** Controller `@Controller('kpi-cascades')`: `GET /` (list, KPI_VIEW), `GET /all` (tree, KPI_VIEW), `POST /` (attach, KPI_EDIT, 201), `DELETE /:id` (detach, KPI_EDIT, 204).
- [ ] **Step 4:** Module imports `AuditModule, RbacModule` + `KpisModule` (for `CascadeService`) — verify `CascadeService` is exported from KpisModule; if not, export it. Register in app.module.
- [ ] **Step 5:** `tsc --noEmit`; fix lint; commit `feat(p2): KpiCascadesModule — CRUD + cycle detection + level BFS`.

---

### Task 4: KpiCascadesModule — e2e

**Files:**
- Create: `apps/web/e2e/kpi-cascades.spec.ts`

- [ ] **Step 1:** e2e (Playwright `request`, skip-if-api-down pattern from `kpi-benchmarks.spec.ts`): register org; create 3 KPIs (A,B,parent P); `POST /kpi-cascades {P,A}` + `{P,B}` → 201; `GET /kpi-cascades/all` → P has 2 children, level set; attempt cycle `POST {A,P}` (A parent of P while P parent of A) → 400 `CASCADE_CYCLE`; self-edge `{A,A}` → 400; `DELETE /kpi-cascades/:id` → 204; list reflects removal.
- [ ] **Step 2:** Start API (`pnpm --filter @kpi-nexus/api dev`, wait for `/health` 200); `pnpm --filter @kpi-nexus/web exec playwright test e2e/kpi-cascades.spec.ts` → PASS.
- [ ] **Step 3:** Reconcile plan Module 10 + TODOS `KpiCascadesModule`; commit `test(p2): cascade CRUD e2e + reconcile Module 10`.

---

### Task 5: FormulaModule — pure dependency logic

**Files:**
- Create: `apps/api/src/kpi-formula/formula-deps.ts`
- Test: `apps/api/src/kpi-formula/formula-deps.spec.ts`

- [ ] **Step 1: Write failing tests.**
  - `extractIdentifiers(ast)`: returns the deduped set of identifier names referenced in an `Expr` AST (recurse binary/unary/call args/conditionals; ignore function names that are builtins). Use `parseFormula` from `../formula/formula.js` to build ASTs in the test (e.g. `parseFormula('revenue - cost')` → `['revenue','cost']`; nested + functions; duplicates collapsed).
  - `wouldCreateDependencyCycle(edges, source, dependent)`: `Edge={sourceKpiId, dependentKpiId}`; true if `source` already (transitively) depends on `dependent`; false otherwise.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `extractIdentifiers`: walk the `Expr` union (inspect `formula.ts` `Expr` shape — identifier/number/binary/unary/call/conditional nodes); collect identifier nodes' names. `wouldCreateDependencyCycle`: DFS from `dependent` over dependency edges to see if it reaches `source`.
- [ ] **Step 4:** Run → PASS (≥6 cases).
- [ ] **Step 5:** Commit `feat(p2): formula identifier extraction + dependency cycle detection (pure)`.

---

### Task 6: FormulaModule — service, controller, module

**Files:**
- Create: `apps/api/src/kpi-formula/dto/formula.dto.ts`, `kpi-formula.service.ts`, `kpi-formula.controller.ts`, `kpi-formula.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1:** DTO `AttachFormulaDtoSchema` = `{ raw: string().trim().min(1).max(1000) }`.strict().
- [ ] **Step 2:** Service `KpiFormulaService`:
  - `get(kpiId)`: require KPI; return `FormulaExpression` or null.
  - `attach(kpiId, raw)`: require KPI; `parseFormula(raw)` (catch → 400 `FORMULA_PARSE_ERROR` with message); `extractIdentifiers(ast)`; resolve names → KPIs by name in org; unknown → 400 `UNKNOWN_KPI_REFS` (list names); build candidate dependency edges (source=referenced, dependent=kpiId); load existing org dep edges (excluding this kpi's), `wouldCreateDependencyCycle` for each new edge → 400 `FORMULA_CYCLE`; in a `$transaction`: upsert `FormulaExpression` (raw + ast as Json), delete this kpi's old `KPIDependency` rows, createMany new ones; audit; return expression.
  - `detach(kpiId)`: delete expression + its dep edges in a tx; audit.
- [ ] **Step 3:** Controller `@Controller('kpis/:kpiId/formula')`: `GET /` (KPI_VIEW), `PUT /` (KPI_EDIT, attach), `DELETE /` (KPI_EDIT, 204).
- [ ] **Step 4:** Module imports `AuditModule, RbacModule`; register in app.module. `tsc --noEmit`; fix lint.
- [ ] **Step 5:** Commit `feat(p2): FormulaModule — attach/detach + KPIDependency DAG wiring`.

---

### Task 7: FormulaModule — e2e

**Files:**
- Create: `apps/web/e2e/kpi-formula.spec.ts`

- [ ] **Step 1:** e2e: register; create KPIs `revenue`, `cost`, and a `margin` KPI; `PUT /kpis/:marginId/formula {raw:'revenue - cost'}` → 200, expression stored; verify dependency edges exist (indirectly: `DELETE` then re-`PUT`, and unknown-ref check); `PUT {raw:'revenue - nope'}` → 400 `UNKNOWN_KPI_REFS`; `PUT {raw:'('}` → 400 parse error; cycle: give `revenue` a formula referencing `margin` → 400 `FORMULA_CYCLE`; `DELETE /kpis/:marginId/formula` → 204; `GET` → null.
- [ ] **Step 2:** Run e2e → PASS.
- [ ] **Step 3:** Reconcile plan Module 4 (formula persistence) + TODOS `FormulaModule`; commit `test(p2): formula attach/detach e2e + reconcile`.

---

### Task 8: CalculationEngineModule — producer, service, processor, module

**Files:**
- Create: `apps/api/src/calculation-engine/calculation-engine.producer.ts`, `.service.ts`, `.processor.ts`, `.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1:** Producer (`InjectQueue('calc-engine')`): `CALC_ENGINE_QUEUE` const; `RecomputeJobData={organizationId,kpiId}`, `CascadeRollupJobData={organizationId,parentKpiId,periodStart,periodEnd}`; `enqueueRecompute` (jobId `recompute-${kpiId}`), `enqueueCascadeRollup` (jobId `rollup-${parentKpiId}-${ts}`) — fire-and-forget, swallow+log. (No `:` in jobIds.)
- [ ] **Step 2:** Service `CalculationEngineService` (the testable core):
  - `recomputeKpi(kpiId)`: load `FormulaExpression` (return null if none); load this kpi's `KPIDependency` sources; for each source load latest data point value → build `Record<name, number>` (need source KPI names → join); `evaluateFormula(expr.raw, context)`; coerce boolean→1/0; write COMPUTED `KPIDataPoint` (direct `prisma.kPIDataPoint.create`, `sourceType:'COMPUTED'`, period = now window); `lineage.record({sourceType:'kpi', sourceId:source, targetType:'kpi', targetId:kpiId, transformType:'FORMULA'})` per source; return `{value, dependents: string[]}` (dependent kpiIds for the caller to enqueue).
  - `rollupParent(parentKpiId, periodStart, periodEnd)`: `cascade.computeForParent`; if value!=null write parent COMPUTED point + `lineage.record(CASCADE_ROLLUP, child→parent)` per contributing child (computeForParent must surface child ids — if it doesn't, load cascade child ids for the parent); return `{value, parents: string[]}` (parent's own parents).
- [ ] **Step 3:** Processor (`@Processor(CALC_ENGINE_QUEUE)` extends `WorkerHost`): per job set system `RequestContextStore.run({userId:'calc-engine-system', organizationId, roleId:null, principalType:'user', bypassRls:true})`; route `recompute`→`recomputeKpi` then `enqueueRecompute` for each returned dependent; `cascade-rollup`→`rollupParent` then `enqueueCascadeRollup` for each returned parent. (DAGs are acyclic ⇒ terminates.)
- [ ] **Step 4:** Module: `BullModule.registerQueue({name: CALC_ENGINE_QUEUE})`, imports `PrismaModule, LineageModule, KpisModule` (for `CascadeService`); providers service+producer+processor; export producer + service. Register in app.module. `tsc --noEmit`; fix lint.
- [ ] **Step 5:** Commit `feat(p2): CalculationEngineModule — calc-engine queue + recompute/rollup service + processor`.

---

### Task 9: Sync trigger endpoints + DataPointsService reactive wiring

**Files:**
- Create: `apps/api/src/calculation-engine/calculation-engine.controller.ts`
- Modify: `apps/api/src/kpis/kpi-data.service.ts` (~line 478, after alert enqueue), `apps/api/src/kpis/kpis.module.ts` (inject producer)

- [ ] **Step 1:** Controller `@Controller('kpis/:kpiId')`: `POST recompute` (KPI_EDIT) → `service.recomputeKpi(kpiId)` (also enqueue dependents) returns `{value}`; `POST rollup` (KPI_EDIT, body `{periodStart, periodEnd}` optional → default current month) → `service.rollupParent(...)` returns `{value}`. Register controller in CalculationEngineModule.
- [ ] **Step 2:** Wire `kpi-data.service.ts`: inject `CalculationEngineProducer` (import `CalculationEngineModule`/export producer; add to `KpisModule` imports one-way). After alert enqueue, when `point.sourceType !== 'COMPUTED'`: for each parent of `point.kpiId` (load `KPICascade` where `childKpiId=point.kpiId`) `enqueueCascadeRollup`; for each formula dependent (load `KPIDependency` where `sourceKpiId=point.kpiId`) `enqueueRecompute`. Fire-and-forget.
- [ ] **Step 3:** Guard check: confirm COMPUTED points (written by the service via direct Prisma) do NOT flow through `DataPointsService.create`, so no re-trigger. (They don't — service writes `prisma.kPIDataPoint.create` directly.)
- [ ] **Step 4:** `tsc --noEmit`; fix lint; full unit suite `npx vitest run` → all green; commit `feat(p2): calc-engine sync triggers + reactive enqueue on data-point insert`.

---

### Task 10: CalculationEngine e2e + reconciliation

**Files:**
- Create: `apps/web/e2e/calc-engine.spec.ts`

- [ ] **Step 1:** e2e: register; create `revenue`, `cost`, `margin`(formula `revenue - cost`); record ORG_WIDE data points revenue=100, cost=30; `POST /kpis/:marginId/recompute` → `{value:70}`; `GET /kpis/:marginId/data` shows a COMPUTED point = 70; `GET /lineage/kpi/:marginId/upstream` returns revenue+cost edges (transformType FORMULA). Cascade: create parent `total`, attach children A,B; record A=10,B=20; `POST /kpis/:totalId/rollup` → value=30 (SUM); parent COMPUTED point present; `GET /lineage/kpi/:totalId/upstream` shows CASCADE_ROLLUP edges. Reactive: record a new child data point and poll `GET /kpis/:totalId/data` until a fresh COMPUTED point appears (timeout ~10s).
- [ ] **Step 2:** Run e2e → PASS. Re-run `kpi-lineage.spec.ts` to confirm still green.
- [ ] **Step 3:** Reconcile plan Module 5 (CalculationEngine) + reconciliation block + TODOS; commit `test(p2): calc-engine recompute/rollup/reactive e2e + reconcile Module 5`.

---

## Self-Review

- **Spec coverage:** Data model → Task 1. KpiCascadesModule → Tasks 2-4. FormulaModule → Tasks 5-7. CalculationEngineModule → Tasks 8, 10. Sync endpoints + reactive wiring → Task 9. Re-entry guard → Task 9 step 3. Testing (unit + e2e) → every task. All spec sections covered.
- **Open implementation detail to resolve during execution:** `CascadeService.computeForParent` currently returns aggregate metadata but may not surface contributing child KPI ids for lineage edges — Task 8 step 2 notes the fallback (load cascade child ids for the parent). Verify when implementing `rollupParent`.
- **Type consistency:** `CALC_ENGINE_QUEUE`, `recomputeKpi`/`rollupParent`, `enqueueRecompute`/`enqueueCascadeRollup`, `wouldCreateCycle`/`computeLevels`, `extractIdentifiers`/`wouldCreateDependencyCycle` used consistently across tasks.
- **Placeholders:** none — each task names exact files, test cases, signatures, commands.
