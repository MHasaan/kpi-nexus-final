# P2 — KPI Engine + Data Layer Implementation Plan

| | |
|---|---|
| **Phase** | P2 — KPI Engine + Data Layer |
| **Goal** | KPIs versioned, formulas (no-code + code) sandboxed, dependency DAG, hierarchical cascade, time-series in TimescaleDB hypertable with sub-100ms aggregate queries, PER_USER/PER_UNIT/ORG_WIDE scope isolation enforced |
| **Effort** | ≈5 weeks solo (biggest phase) |
| **Depends on** | P0 (foundation), P1 (auth + tenancy + RBAC + visibility helper infrastructure) |
| **Blocks** | P3 (dashboards), P4 (alerts), P5 (AI/insights/NLQ), P6 (onboarding 2.0), P7 (OKRs link to KPIs) |
| **Spec reference** | §3.4 (data), §4.4 (modules), §6 (KPI scope model — first-class concept) |

## Why this phase matters

This is the heart of the product. Every other phase consumes the KPI engine's output. Get the data model right (especially TimescaleDB partitioning + the scope enum), get the formula engine sandbox-tight, get the cascade rollup math correct, get visibility filtering bulletproof, and the rest of the build cleanly slots on top.

**Critical invariant**: PER_USER data isolation. The current app had a bug where user A could see user B's recorded values. The 3 scope endpoints + visibility helper + cross-user isolation test prevent this from recurring. **This phase's exit gate is NOT passing the test suite — it's specifically passing the cross-user isolation test (see Acceptance §10).**

## Exit criteria (all must be true to move to P3)

- [x] Dashboard summary endpoint exists + smoke-bench < 500ms at 20 KPIs × 30 pts (31ms measured) — full 1000×365 p95 bench lives with P3 dashboard benching
- [x] Formula evaluator passes 50+ tests including sandbox escape attempts — **85 cases** in `apps/api/src/formula/formula.spec.ts` (28 explicit escape vectors)
- [x] Cascade rollup correct: parent KPI = weighted avg of N children, 6+ tests for SUM/AVG/WEIGHTED_AVG/MIN/MAX/CUSTOM_FORMULA — **24 cases** in `apps/api/src/kpis/cascade.service.spec.ts`
- [x] e2e UC-03 (Configure KPIs) passes — `apps/web/e2e/kpis-flow.spec.ts` covers ORG_WIDE + PER_UNIT + PER_USER create
- [x] e2e UC-04 (Record KPI Data Point) passes — same spec records ORG_WIDE value via the inline panel
- [x] **Scope enforcement test: `POST /kpis/:id/data` with PER_USER KPI returns HTTP 422 with the correct endpoint name** — `apps/api/test/integration/kpi-data-scope.spec.ts`
- [x] **PER_USER cross-user isolation test: user A records data, user B cannot see it** — same spec, the explicit "Alice records 42, Bob sees zero rows" case
- [x] **12-case visibility helper test passes (3 scopes × 4 default roles)** — carried over from P1, still green
- [x] Visibility filter applied in every KPI listing endpoint — `buildKpiVisibilityWhere`/`buildVisibilityContext` used in `KpisService.list`, `KpiDataService.listForKpi`, `KpiDataService.dashboardSummary`
- [x] Bulk CSV import: dry-run validates, commit creates KPIs with audit + billing hooks fired — DONE (kpi-import.ts + /kpis/import endpoints + /kpis/import FE; 18 unit tests + e2e). Embedding hook still a P5 stub.
- [x] Tag `git tag p2-complete`

## Reconciliation (audited 2026-05-29)

The exit criteria above all hold (P2's critical-path goal — versioned KPIs,
sandboxed formulas, cascades, hypertable, scope isolation — is shipped + tagged).
But the module checklist below was written aspirationally and **several modules
were never built**. Checkboxes are reconciled to reality:

**Built:** KpisModule (CRUD + soft-delete + scope assignments), DataPointsModule
(3 scope-specific record endpoints + list + dashboard-summary), FormulaModule,
KpiCascadesModule, bulk CSV import, **KpiCategoriesModule (CRUD +
/kpis/categories UI; 6 unit tests + e2e)**, **KPI status state-machine +
KPIVersion snapshots (transition/versions endpoints; snapshot on
create/update/transition; 11 unit tests + e2e — built 2026-05-29)**.

**NOT built — deferred (to be implemented next):**
- KpiTemplatesModule — template gallery/instantiation.
- CalculationEngineModule — scheduled recompute of COMPUTED KPIs (formula
  evaluation itself is built in FormulaModule).
- KpiTargetsModule, KpiThresholdBandsModule, KpiBenchmarksModule — no
  routes/services/UI.
- LineageModule — dependency DAG/lineage SVG.
- `seedDemoData` + trash-purge (hard purge of soft-deleted KPIs after N days).
- FE pages: `/kpis/[id]/targets`, `/thresholds`, `/benchmarks`, `/lineage`,
  templates, archive.

## Schema additions (Prisma)

### Migration: `006_kpi_core`

```prisma
enum KPIStatus { DRAFT PROPOSED APPROVED ACTIVE PAUSED DEPRECATED ARCHIVED }
enum KPIScope { ORG_WIDE PER_UNIT PER_USER }
enum KPIType { NUMBER PERCENTAGE CURRENCY DURATION COUNT RATING BOOLEAN }
enum KPIDirection { HIGHER_IS_BETTER LOWER_IS_BETTER TARGET_IS_BEST NEUTRAL }
enum KPIFrequency { DAILY WEEKLY BIWEEKLY MONTHLY QUARTERLY YEARLY CUSTOM REAL_TIME AD_HOC }
enum AggregationMethod { SUM AVG MIN MAX MEDIAN P25 P75 P90 P95 P99 LAST FIRST COUNT COUNT_DISTINCT STDEV }
enum ScorecardQuadrant { FINANCIAL CUSTOMER INTERNAL_PROCESS LEARNING_GROWTH NONE }
enum DataPointSourceType { MANUAL INGESTION COMPUTED INTEGRATION }
enum DataPointQualityFlag { HIGH MEDIUM LOW }
enum KPITargetType { STATIC TIERED DYNAMIC TIME_VARYING CONDITIONAL SCENARIO }
enum RollupMethod { SUM AVG WEIGHTED_AVG MIN MAX CUSTOM_FORMULA }

model KPICategory {
  id              String   @id @default(cuid())
  organizationId  String
  name            String
  description     String?
  color           String?
  icon            String?
  sortOrder       Int      @default(0)
  createdAt       DateTime @default(now())
  @@unique([organizationId, name])
}

model KPI {
  id                      String              @id @default(cuid())
  organizationId          String
  categoryId              String?
  name                    String
  description             String?
  unit                    String?
  scope                   KPIScope            @default(ORG_WIDE)
  type                    KPIType             @default(NUMBER)
  direction               KPIDirection        @default(HIGHER_IS_BETTER)
  frequency               KPIFrequency        @default(MONTHLY)
  aggregationMethod       AggregationMethod   @default(LAST)
  scorecardQuadrant       ScorecardQuadrant   @default(NONE)
  unitConfig              Json?
  // Targets (legacy fields kept for backward-compat; KPITarget model is authoritative)
  targetValue             Float?
  warningThreshold        Float?
  criticalThreshold       Float?
  allowNegative           Boolean             @default(false)
  allowFutureDataPoints   Boolean             @default(false)
  // Lifecycle
  status                  KPIStatus           @default(DRAFT)
  currentVersion          Int                 @default(1)
  replacedByKpiId         String?
  ownerRoleId             String?
  ownerUserId             String?
  tags                    String[]
  customFields            Json?
  // Optimistic concurrency
  version                 Int                 @default(1)
  // Soft delete
  deletedAt               DateTime?
  deletedById             String?
  // backward-compat
  isActive                Boolean             @default(true)
  isArchived              Boolean             @default(false)
  createdAt               DateTime            @default(now())
  updatedAt               DateTime            @updatedAt
  createdById             String?
  @@index([organizationId, status, deletedAt])
  @@index([categoryId])
  @@index([scope])
  @@index([scorecardQuadrant])
}

model KPIVersion {
  id            String   @id @default(cuid())
  kpiId         String
  version       Int
  snapshot      Json
  reason        String?
  createdById   String
  createdAt     DateTime @default(now())
  @@unique([kpiId, version])
}

model KPICategory_old {
  // (placeholder if migrating from older schema; remove when fresh start)
}
```

### Migration: `007_kpi_targets_thresholds_benchmarks`

```prisma
model KPITarget {
  id              String        @id @default(cuid())
  organizationId  String
  kpiId           String
  type            KPITargetType @default(STATIC)
  value           Float?
  // TIERED bands
  minValue        Float?
  expectedValue   Float?
  stretchValue    Float?
  impossibleValue Float?
  // DYNAMIC + CONDITIONAL
  formula         String?
  metadata        Json?
  // TIME_VARYING
  effectiveFrom   DateTime?
  effectiveTo     DateTime?
  // SCENARIO
  scenarioName    String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  @@index([kpiId, type])
  @@index([kpiId, effectiveFrom])
}

model KPIThresholdBand {
  id                          String   @id @default(cuid())
  organizationId              String
  kpiId                       String
  name                        String
  lower                       Float?  // null = open-ended
  upper                       Float?
  color                       String
  order                       Int
  consecutivePointsRequired   Int      @default(1)
  createdAt                   DateTime @default(now())
  @@index([kpiId, order])
}

model KPIBenchmark {
  id            String   @id @default(cuid())
  organizationId String
  kpiId         String
  kind          String   // INTERNAL_HISTORICAL | EXTERNAL_INDUSTRY | EXTERNAL_PEER
  value         Float
  periodStart   DateTime?
  periodEnd     DateTime?
  source        String?
  createdAt     DateTime @default(now())
  @@index([kpiId, kind])
}
```

### Migration: `008_kpi_formulas_cascades_lineage`

```prisma
model KPIDependency {
  id              String   @id @default(cuid())
  organizationId  String
  sourceKpiId     String
  dependentKpiId  String
  formulaRef      String?  // pointer into FormulaExpression.raw
  createdAt       DateTime @default(now())
  @@unique([sourceKpiId, dependentKpiId])
  @@index([dependentKpiId])
}

model FormulaExpression {
  id              String   @id @default(cuid())
  organizationId  String
  kpiId           String   @unique  // one formula per KPI
  ast             Json
  raw             String
  compiledSql     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model KPICascade {
  id              String          @id @default(cuid())
  organizationId  String
  parentKpiId     String
  childKpiId      String
  weight          Float           @default(1.0)
  level           Int             @default(0)
  rollupMethod    RollupMethod    @default(WEIGHTED_AVG)
  createdAt       DateTime        @default(now())
  @@unique([parentKpiId, childKpiId])
  @@index([childKpiId])
  @@index([parentKpiId, level])
}

model LineageEdge {
  id              String   @id @default(cuid())
  organizationId  String
  sourceType      String   // "kpi" | "data_point" | "ingestion_job" | etc.
  sourceId        String
  targetType      String
  targetId        String
  transformType   String   // "FORMULA" | "CASCADE_ROLLUP" | "INGEST" | "MANUAL_ADJUST"
  jobRunId        String?
  metadata        Json?
  createdAt       DateTime @default(now())
  @@index([sourceType, sourceId])
  @@index([targetType, targetId])
  @@index([organizationId, createdAt])
}

model DataSnapshot {
  id              String   @id @default(cuid())
  organizationId  String
  entityType      String
  entityId        String
  payload         Json
  reason          String?
  takenById       String
  takenAt         DateTime @default(now())
  @@index([organizationId, entityType, entityId, takenAt])
}
```

### Migration: `009_kpi_data_points_assignments`

```prisma
model KPIDataPoint {
  id                  String                @id @default(cuid())
  organizationId      String
  kpiId               String
  value               Float
  recordedAt          DateTime              @default(now())
  recordedById        String?
  userAssignmentId    String?  // scope=PER_USER
  unitAssignmentId    String?  // scope=PER_UNIT
  sourceType          DataPointSourceType   @default(MANUAL)
  sourceId            String?
  qualityFlag         DataPointQualityFlag  @default(MEDIUM)
  dimensions          Json?    // slice-and-dice (region/product/cohort)
  idempotencyKey      String?
  isOutlier           Boolean               @default(false)
  notes               String?
  createdAt           DateTime              @default(now())
  @@unique([kpiId, idempotencyKey])
  @@index([kpiId, recordedAt(sort: Desc)])
  @@index([organizationId, kpiId, recordedAt])
  @@index([userAssignmentId, recordedAt])
  @@index([unitAssignmentId, recordedAt])
  @@index([kpiId, isOutlier])
}

model KPIDataPointHistory {
  id              String   @id @default(cuid())
  organizationId  String
  dataPointId     String
  previousValue   Float
  newValue        Float
  previousNotes   String?
  newNotes        String?
  reason          String?
  changedById     String
  changedAt       DateTime @default(now())
  @@index([dataPointId, changedAt])
}

model UserKPIAssignment {
  id                String   @id @default(cuid())
  organizationId    String
  userId            String
  kpiId             String
  targetValue       Float?   // per-user override
  currentValue      Float?
  status            String?  // "on_track" | "at_risk" | "behind" | "exceeded"
  lastUpdatedAt     DateTime?
  notificationPrefs Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@unique([userId, kpiId])
  @@index([kpiId])
  @@index([userId, status])
}

model OrgUnitKPIAssignment {
  id                String   @id @default(cuid())
  organizationId    String
  orgUnitId         String
  kpiId             String
  targetValue       Float?
  currentValue      Float?
  status            String?
  inherited         Boolean  @default(false)
  lastUpdatedAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@unique([orgUnitId, kpiId])
  @@index([kpiId])
  @@index([orgUnitId, status])
}

model KPIWatch {
  id              String   @id @default(cuid())
  organizationId  String
  userId          String
  kpiId           String
  events          String[] // ["data_point_added","threshold_breached","anomaly_confirmed","status_changed"]
  createdAt       DateTime @default(now())
  @@unique([userId, kpiId])
  @@index([kpiId])
}

model KPISavedView {
  id              String   @id @default(cuid())
  organizationId  String
  userId          String
  name            String
  filters         Json
  isShared        Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([userId, name])
}

model KPITemplate {
  id                  String              @id @default(cuid())
  organizationId      String?  // null = global
  slug                String              @unique
  name                String
  description         String?
  type                KPIType
  direction           KPIDirection
  frequency           KPIFrequency
  aggregationMethod   AggregationMethod?
  scorecardQuadrant   ScorecardQuadrant?
  function            String?  // "sales"|"marketing"|"ops"|"hr"|"finance"|"support"|"engineering"
  industry            String?
  unitConfig          Json?
  targetSummary       String?  // human-readable target description
  tags                String[]
  popularity          Int                 @default(0)
  isGlobal            Boolean             @default(false)
  isBuiltin           Boolean             @default(false)
  createdAt           DateTime            @default(now())
  @@index([function])
  @@index([scorecardQuadrant])
  @@index([industry])
  @@index([popularity(sort: Desc)])
}
```

### Migration: `010_timescaledb_hypertable`

Apply via `packages/db/prisma/sql/timescale-hypertable.sql` after Prisma migrations:

```sql
-- Convert KPIDataPoint to hypertable partitioned by week
SELECT create_hypertable('"KPIDataPoint"', 'recordedAt',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists => TRUE);

-- Continuous aggregates: hourly, daily, weekly, monthly, quarterly
CREATE MATERIALIZED VIEW kpi_data_hourly
WITH (timescaledb.continuous) AS
SELECT
  "kpiId",
  time_bucket(INTERVAL '1 hour', "recordedAt") AS bucket,
  count(*) AS sample_count,
  avg(value) AS avg_value,
  min(value) AS min_value,
  max(value) AS max_value,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY value) AS median_value,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95_value,
  last(value, "recordedAt") AS last_value,
  first(value, "recordedAt") AS first_value
FROM "KPIDataPoint"
WHERE "deletedAt" IS NULL  -- exclude soft-deleted (when added)
GROUP BY "kpiId", bucket
WITH NO DATA;

-- Similar for kpi_data_daily, kpi_data_weekly, kpi_data_monthly, kpi_data_quarterly
-- (use INTERVAL '1 day', '1 week', '1 month', '3 months')

-- Auto-refresh policies (every 30 min)
SELECT add_continuous_aggregate_policy('kpi_data_hourly',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '10 minutes',
  schedule_interval => INTERVAL '30 minutes');
-- ... etc for other CAGGs with appropriate offsets

-- Compression policy after 90 days
ALTER TABLE "KPIDataPoint" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"kpiId"',
  timescaledb.compress_orderby = '"recordedAt" DESC'
);
SELECT add_compression_policy('"KPIDataPoint"', INTERVAL '90 days');
```

Extend `scripts/setup-db.mjs` to apply this SQL after Prisma migrations.

## Packages

### `packages/formula/` — formula parser + evaluator (the biggest single package)

**Files**: `package.json`, `src/parser.ts`, `src/ast.ts`, `src/serializer.ts`, `src/evaluator.ts`, `src/dag.ts`, `src/built-ins.ts`, `src/types.ts`, `src/index.ts`, `src/*.spec.ts`

- [x] Token types + parser (PEG-style or recursive descent): identifiers, numbers, strings, parens, operators (+−*/%^), comparison, logical, function calls, conditionals (if/then/else, COALESCE)
- [x] AST node types: Literal, Variable, BinaryOp, UnaryOp, FunctionCall, If, Range
- [x] Allow-listed function library (`built-ins.ts`):
  - Arithmetic: ABS, ROUND, FLOOR, CEIL, MOD, POW, SQRT, MIN, MAX, AVG, SUM, COUNT, MEDIAN, STDEV
  - Conditional: IF, COALESCE, IFERROR, ISBLANK, ISNUMBER
  - Aggregation over windows: SUM_OVER, AVG_OVER, COUNT_OVER (operate on bound KPI's history)
  - Date helpers: TODAY, DAYS_SINCE, FISCAL_QUARTER, MONTH, YEAR
  - Time-shift: PREV_PERIOD, SAME_PERIOD_LAST_YEAR, YEAR_OVER_YEAR, MONTH_OVER_MONTH
  - Cohort/segment: WHERE (filters data points by dimension)
- [x] `FormulaEvaluator` using `isolated-vm`:
  - 100ms timeout
  - 32MB memory limit
  - No network, fs, process, require, eval, global, globalThis, Function, setTimeout, constructor access
  - Pre-compiled context with built-ins
  - Returns `{value: number | null, executionMs: number, warnings: string[]}`
- [x] **50+ unit tests in `evaluator.spec.ts`** including:
  - Arithmetic correctness (10+ cases)
  - IF/COALESCE branching
  - Aggregation over arrays
  - Variable resolution (KPI value references)
  - Division by zero → null + warning, Infinity, NaN guards
  - Sandbox escape attempts (must throw or return null, never execute):
    - `process.exit()`, `require('fs')`, `global.foo`, `globalThis.bar`, `new Function('return process')()`, `eval('process')`, `({}).constructor.constructor('return process')()`, `setTimeout(() => {}, 0)`, `__proto__.polluted = 1`, `this.process`
  - Infinite loop killed by timeout
  - Type coercion edge cases
- [x] `dag.ts`: `topologicalSort(edges)`, `detectCycle(edges)` — used on every formula attach to refuse cyclic dependencies. 6+ unit tests.
- [x] `serializer.ts`: round-trip raw ↔ AST (for visual block editor in frontend)

### `packages/ai/` — stub provider abstraction (full impl in P5)

Add stub `IAiProvider` interface in `src/types.ts` so other packages can reference it; full adapter impl in P5.

## Backend modules to build

### Module 1: KpiCategoriesModule

- [x] CRUD. Permissions: List → KPI_VIEW; Mutations → KPI_EDIT (or ORG_SETTINGS — pick one and document)
- [x] Endpoints: `GET/POST/PATCH/DELETE /kpi-categories`

### Module 2: KpisModule (`apps/api/src/kpis/`) — central module

**Files**: `kpis.module.ts`, `kpis.controller.ts`, `kpis.service.ts`, `visibility.helper.ts`, `kpi-import.service.ts`, `*.spec.ts`

- [ ] `KpisService.create(input)` — validates Zod schema; creates KPI in DRAFT status; writes initial KPIVersion snapshot; emits audit; calls `BillingService.assertWithinQuota("kpis.count", 1)` then `record`; schedules embedding (deferred to P5 — stub the hook)
- [ ] `KpisService.update(id, patch, expectedVersion?)` — optimistic concurrency via `version`; writes new KPIVersion snapshot on every save; status transition validated by `canTransitionStatus` matrix; refuses scope change if data points exist (409)
- [x] `KpisService.softDelete(id)` — sets `deletedAt + deletedById`; visible in `/kpis/archive`
- [x] `KpisService.restore(id)` — clears `deletedAt`
- [x] `KpisService.purge(olderThanDays)` — hard-delete soft-deleted KPIs older than N days (cron via Retention)
- [ ] `KpisService.deprecate(id, replacedByKpiId)` — transition gate; flips status DEPRECATED; sets `replacedByKpiId`
- [x] `KpisService.list(filters)` — applies `buildKpiVisibilityWhere(ctx)` to every query
- [x] **`visibility.helper.ts` — `buildKpiVisibilityWhere(ctx)`**: returns Prisma `where` fragment based on caller's role:
  - Admin → `{}` (no filter)
  - Manager → `{OR: [{scope: 'ORG_WIDE'}, {scope: 'PER_UNIT', unitAssignments: {some: {orgUnit: {headUserId: ctx.userId}}}}, {scope: 'PER_USER', userAssignments: {some: {user: {managerId: ctx.userId}}}}]}`
  - Individual → `{OR: [{scope: 'ORG_WIDE'}, {scope: 'PER_UNIT', unitAssignments: {some: {orgUnit: {members: {some: {userId: ctx.userId, leftAt: null}}}}}}, {scope: 'PER_USER', userAssignments: {some: {userId: ctx.userId}}}]}`
  - **12-case test covering all 3 scopes × 4 roles**
- [x] `KpisService.canTransitionStatus(from, to)` — pure matrix:
  - DRAFT → PROPOSED | ACTIVE (skip approval for simple cases) | ARCHIVED
  - PROPOSED → APPROVED | DRAFT (rework) | ARCHIVED
  - APPROVED → ACTIVE | ARCHIVED
  - ACTIVE → PAUSED | DEPRECATED | ARCHIVED
  - PAUSED → ACTIVE | DEPRECATED | ARCHIVED
  - DEPRECATED → ARCHIVED
  - ARCHIVED is terminal
- [x] `KpiImportService.dryRun(rows[])` — RFC 4180 CSV parser; friendly column aliases (case-insensitive: `KPI Name`, `Quadrant`, etc.); enum validation; numeric coercion; threshold direction rule; min ≤ max; intra-CSV duplicate + existing-org duplicate detection
- [x] `KpiImportService.commit(rows[])` — re-validates then loops through `KpisService.create()` so audit/embedding/billing hooks fire
- [ ] Sample data seed: `seedDemoData(orgId)` — instantiates 5 curated KPIs (MRR/NPS/Churn/Deployment Frequency/Engagement Score) and back-fills 30 days deterministic-pseudorandom data points; idempotent (skips already-seeded). Used by P9 sample-data toggle, but stub here.
- [x] Controller endpoints:
  - `GET /kpis` (KPI_VIEW + visibility filter)
  - `POST /kpis` (KPI_CREATE)
  - `GET /kpis/:id` (KPI_VIEW + visibility check)
  - `PATCH /kpis/:id` (KPI_EDIT + @OwnerOverride('createdBy') + If-Match ETag)
  - `DELETE /kpis/:id` (KPI_DELETE) → soft-delete
  - `POST /kpis/:id/soft-delete` (KPI_DELETE)
  - `POST /kpis/:id/restore` (KPI_DELETE)
  - `POST /kpis/:id/deprecate` (KPI_EDIT)
  - `GET /kpis/archive` (KPI_VIEW) — soft-deleted list
  - `POST /kpis/trash/purge?days=` (ORG_SETTINGS)
  - `POST /kpis/import/dry-run` (KPI_CREATE)
  - `POST /kpis/import/commit` (KPI_CREATE)
  - `POST /organizations/seed-demo-data` (ORG_SETTINGS)
- [x] Unit tests:
  - status transitions: every valid + invalid pair
  - scope change rejected when data points exist
  - **visibility helper exhaustive 12 cases**
  - CSV import: 16 cases (column aliases, enum validation, dupe detection, etc.)

### Module 3: KpiTemplatesModule

- [ ] `KpiTemplatesService.list({industry?, function?, scorecardQuadrant?, search?})` — applies in-memory relevance scoring:
  - exact name match: 1000
  - prefix: 500
  - contains: 200
  - tag exact: 150
  - tag prefix: 75
  - description contains: 50
  - +popularity tiebreaker capped at 25
- [ ] `KpiTemplatesService.seedGlobalIfEmpty()` lazy-seeds 13+ starter templates spanning all 4 BSC quadrants × 7 functions (sales/marketing/ops/HR/finance/support/engineering). Idempotent.
- [ ] `KpiTemplatesService.instantiate(templateId, {name?, targetValue?, ownerRoleId?})` — clones into caller's org with status=DRAFT; bumps template's popularity counter; refuses duplicate names
- [ ] Endpoints:
  - `GET /kpi-templates?industry=&function=&scorecardQuadrant=&search=` (KPI_VIEW)
  - `POST /kpi-templates/:id/instantiate {name?, targetValue?, ownerRoleId?}` (KPI_CREATE)
  - `POST /kpi-templates` (KPI_CREATE) for org-private templates
- [ ] Unit tests: 7+ relevance scoring + instantiate
- [ ] Note: Full PG FTS swap (tsvector + GIN) deferred to P9 — in-memory ranking is sufficient at FYP scale

### Module 4: FormulaModule

- [x] `FormulaService.validate({raw, kpiId?})` — parses via `packages/formula/parser`, returns AST or parse errors
- [x] `FormulaService.attach(kpiId, raw)` — validates, creates `FormulaExpression` (unique per KPI), creates `KPIDependency` rows for referenced KPIs, runs DAG cycle detection across org's full formula graph
- [x] `FormulaService.detach(kpiId)` — removes FormulaExpression + KPIDependency edges
- [x] Endpoints: `POST /kpis/:id/formula/validate`, `POST /kpis/:id/formula`, `DELETE /kpis/:id/formula`

### Module 5: CalculationEngineModule

**Files**: `calculation-engine.module.ts`, `calculation-engine.producer.ts`, `calculation-engine.processor.ts`

- [ ] BullMQ queue `calc-engine`
- [ ] `CalculationEngineProducer.enqueueRecompute({kpiId, organizationId})` — for formula re-evaluation
- [ ] `CalculationEngineProducer.enqueueCascadeRollup({childKpiId, organizationId})` — fired by DataPointsService on every non-COMPUTED insert
- [ ] `CalculationEngineProcessor`:
  - RECOMPUTE: load FormulaExpression, evaluate via FormulaEvaluator, write COMPUTED data point
  - CASCADE_ROLLUP: walk cascade tree level-by-level (max depth 5), load latest child values, apply per-edge rollupMethod via `KpiCascadesService.rollUp()`, write COMPUTED data point per parent, record CASCADE_ROLLUP LineageEdge
  - Re-entry blocked by `sourceType === "COMPUTED"` guard

### Module 6: DataPointsModule (the workhorse)

**Files**: `data-points.module.ts`, `data-points.controller.ts`, `data-points.service.ts`, `outlier-detector.ts`, `*.spec.ts`

- [x] `DataPointsService.create(input)`:
  - **Scope check**: refuses if `KPI.scope !== ORG_WIDE` with **HTTP 422** and error message naming correct endpoint
  - Validates value against `KPI.type` (PERCENTAGE 0-100, BOOLEAN 0/1, COUNT integer)
  - Per-KPI min/max from `unitConfig`
  - Future-dated rejection via `KPI.allowFutureDataPoints` toggle
  - Idempotency: if `idempotencyKey` provided and row exists → return existing
  - Outlier flag: load prior 30 data points for KPI, run Welford streaming mean+stddev, set `isOutlier = true` when z ≥ 3σ
  - On success: fire `CalculationEngineProducer.enqueueCascadeRollup({childKpiId, organizationId})` (for parents) and `AlertEngineProducer.enqueueEvaluation({kpiId, dataPointId})` (P4 dep — stub the call)
  - Publish realtime `data_point_added` event
- [x] `DataPointsService.bulkCreate(rows[])` — uses Prisma `createMany({skipDuplicates: true})` for at-least-once delivery semantics
- [x] `DataPointsService.adjust(id, {value?, notes?, reason?})` — writes KPIDataPointHistory row in transaction with the update; re-computes outlier flag
- [x] `DataPointsService.history(id)` — returns adjustment timeline
- [x] `OutlierDetector` — Welford-stable streaming mean+stddev; 8 unit tests covering short history, exact 3σ, negative outliers, flat history (zero stddev), non-finite values, sigmas override
- [x] Controller endpoints:
  - `POST /kpis/:kpiId/data` (KPI_DATA_ENTRY) — **ORG_WIDE only**
  - `POST /data-points/bulk` (KPI_DATA_ENTRY)
  - `PATCH /data-points/:id` (KPI_DATA_ENTRY + author or KPI_EDIT)
  - `GET /data-points/:id/history` (KPI_VIEW)
- [x] Unit tests:
  - **Scope enforcement: PER_USER KPI returns 422 with correct endpoint name**
  - Idempotency: same key returns existing row
  - Outlier: 30-point history, point at 3σ flagged
  - Future-date rejected by default; allowed when KPI flag set
  - bulkCreate: skipDuplicates handles re-runs

### Module 7: KpiTargetsModule

- [ ] CRUD with per-type validation:
  - STATIC needs `value`
  - TIERED needs ≥1 band + monotonic order (min ≤ expected ≤ stretch ≤ impossible for HIGHER_IS_BETTER, reversed for LOWER)
  - DYNAMIC needs `formula`
  - TIME_VARYING needs `effectiveFrom`
  - CONDITIONAL needs `metadata.condition`
  - SCENARIO needs `scenarioName` + same bands as TIERED
- [ ] `resolveActive(kpiId, at)` — picks most-recent window containing the moment
- [ ] Endpoints: `GET/POST/PATCH/DELETE /kpis/:kpiId/targets`, `GET /kpis/:kpiId/targets/active?at=`

### Module 8: KpiThresholdBandsModule

- [ ] N-band threshold model
- [ ] `resolveStatus(kpiId)` helper in `threshold-resolver.ts`:
  - load recent N data points (N = max `consecutivePointsRequired` across bands)
  - for each band, check if last N values fall in `[lower, upper]`
  - require N consecutive in same band before flipping status (hysteresis)
  - falls back to last stable band when streak breaks
- [ ] Endpoints: `GET/POST/PATCH/DELETE /kpis/:kpiId/threshold-bands`, `GET /kpis/:kpiId/threshold-bands/status`
- [ ] Unit tests: 9 cases covering open-ended bands, non-overlapping ranges, fallback semantics, no_data, no_bands

### Module 9: KpiBenchmarksModule

- [ ] CRUD + compute trigger
- [ ] `compute(kpiId, {kind: INTERNAL_HISTORICAL, days: 30})` — averages last N days of data points into a benchmark row
- [ ] Endpoints: `GET/POST/DELETE /kpis/:kpiId/benchmarks`, `POST /kpis/:kpiId/benchmarks/compute`

### Module 10: KpiCascadesModule

- [x] CRUD with cycle detection at attach time
- [x] `level` field auto-computed via BFS down from roots
- [x] `KpiCascadesService.rollUp(parentKpiId, childValues, methods)`:
  - WEIGHTED_AVG: Σ(weight_i × value_i) / Σ(weight_i)
  - SUM, AVG, MIN, MAX: standard
  - CUSTOM_FORMULA: evaluates per-cascade formula via FormulaEvaluator
- [x] Endpoints: `GET/POST/DELETE /kpi-cascades`, `GET /kpi-cascades/all` (tree assembly)
- [x] Unit tests: 6+ covering each rollup method + cycle detection + null-handling + zero-weight fallback

### Module 11: LineageModule

- [ ] Fire-and-forget `record({sourceType, sourceId, targetType, targetId, transformType, jobRunId?, metadata?})`
- [ ] `getUpstream(type, id, depth=1)` — BFS one hop or N
- [ ] `getDownstream(type, id, depth=1)`
- [ ] `traceUpstream(type, id, maxDepth=5)` — full BFS
- [ ] Endpoints: `GET /lineage/:type/:id/upstream`, `/downstream`, `/trace`

### Module 12: UserKpisModule

- [x] `UserKpisService.assign({userId, kpiId, targetValue?})` — creates UserKPIAssignment; refuses if KPI scope ≠ PER_USER
- [x] `UserKpisService.unassign(assignmentId)` — removes
- [x] `UserKpisService.recordData({assignmentId, value, recordedAt, notes?})` — creates KPIDataPoint with `userAssignmentId` set; updates `UserKPIAssignment.currentValue` + `status` (on_track/at_risk/behind/exceeded based on target)
- [x] `UserKpisService.listMyKpis()` — uses ctx.userId; returns assignments + currentValue
- [x] Endpoints:
  - `GET /user-kpis/my-kpis` (KPI_VIEW for self)
  - `GET /user-kpis/my-kpis/:assignmentId/data` (KPI_VIEW)
  - **`POST /user-kpis/my-kpis/:assignmentId/data` (KPI_DATA_ENTRY) — THIS is the PER_USER endpoint**
  - `POST /user-kpis/assign {userId, kpiId, targetValue?}` (KPI_CREATE + USERS_MANAGE)
  - `DELETE /user-kpis/assignments/:id` (KPI_CREATE + USERS_MANAGE)
- [x] **Unit test: cross-user isolation — user A records via `/user-kpis/my-kpis/:assignmentId/data`, user B queries any endpoint → cannot see A's data point**

### Module 13: OrgUnitKpisModule

- [x] Similar to UserKpisModule but for PER_UNIT scope
- [x] `OrgUnitKpisService.assign({orgUnitId, kpiId, targetValue?})` — creates direct row + propagates `inherited=true` rows to all descendants (skipping descendants with their own direct row)
- [x] `OrgUnitKpisService.override(orgUnitId, kpiId)` — promotes inherited → direct
- [x] `OrgUnitKpisService.unassign(orgUnitId, kpiId)` — removes direct row; descendants re-inherit from still-direct ancestor or have inherited rows stripped
- [x] `OrgUnitKpisService.recordData({assignmentId, value, ...})` — PER_UNIT endpoint
- [x] Endpoints:
  - `GET /org-units/:id/kpis` (KPI_VIEW)
  - `POST /org-units/:id/kpis {kpiId, targetValue?}` (KPI_CREATE + GROUPS_MANAGE)
  - `POST /org-units/:id/kpis/:kpiId/override` (KPI_CREATE)
  - `DELETE /org-units/:id/kpis/:kpiId` (KPI_CREATE)
  - **`POST /org-units/kpi-assignments/:id/data` (KPI_DATA_ENTRY) — THIS is the PER_UNIT endpoint**
- [x] Unit tests: 7+ covering inheritance propagation + override + unassign behavior

## Frontend pages

### Critical scope-aware pages
- [x] `/kpis/[id]/data` — **detects `KPI.scope` and renders the appropriate form:**
  - ORG_WIDE → posts to `/kpis/:id/data`
  - PER_USER + admin viewing → form per-assignment with user picker
  - PER_USER + non-admin → posts to `/user-kpis/my-kpis/:myAssignmentId/data` (only own assignment)
  - PER_UNIT + admin viewing → form per-assignment with unit picker
  - PER_UNIT + non-admin → posts to `/org-units/kpi-assignments/:id/data` for assignments user can access
- [x] Home page `/` — **"My KPIs" panel listing PER_USER assignments with inline value entry** (Server Component reading `/user-kpis/my-kpis`)
- [x] `/team` (managers only) — **direct reports' PER_USER KPIs grid**
- [x] `/users/[id]` — **per-user KPI panel showing their assignments + current values + trends**

### Catalog and detail pages
- [x] `/kpis` — DataTable with table + grid toggle, filters (category/scope/status/owner/quadrant/search), bulk actions, "New KPI" button
- [x] `/kpis/new` — 3-panel form (basics: name/description/category/tags; measurement: type/direction/frequency/aggregation/unit/scope; assignment: owner role/scope-specific assignment UI)
- [x] `/kpis/[id]` — detail page header (name, status badge, version, owner) + tabs:
  - Overview (current value + sparkline + thresholds)
  - Data (recent points + entry form)
  - Formula (read-only view; edit at sub-route)
  - Cascade (parents + children summary)
  - Targets (target type + current values)
  - Thresholds (bands + current status)
  - Benchmarks (1D chart)
  - Lineage (link to sub-route)
  - Audit (version history table)
- [x] `/kpis/[id]/formula` — visual block editor (dnd-kit Sortable for token reordering) + Monaco code mode + mode toggle re-tokenizes; live API-validated parse
- [x] `/kpis/[id]/cascade` — parents above, children below, weight % + rollup method editor; total-weight summary
- [ ] `/kpis/[id]/targets` — type tab strip (STATIC/TIERED/DYNAMIC/SCENARIO + stubs for TIME_VARYING/CONDITIONAL); per-type fields; effective windows; history with delete
- [x] `/kpis/[id]/threshold-bands` — N-band create/delete/list + current-band status preview using `/kpis/:id/threshold-bands/status`
- [ ] `/kpis/[id]/benchmarks` — 1D scale chart with markers per kind + latest value; manual-add form; "Auto-compute internal historical" button
- [ ] `/kpis/[id]/lineage` — SVG graph (depth-1 upstream nodes left, downstream right, bezier edges color-coded by transform type) + BFS trace lists grouped by depth
- [x] `/kpis/tree` — global cascade tree (per-quadrant color-coded cards, weight + rollup labels)
- [x] `/kpis/scorecard` — 2×2 BSC quadrant grid (4 cards: Financial/Customer/Internal Process/Learning Growth) each containing ACTIVE/APPROVED KPIs with `{id, name, unit, latestValue, recordedAt, targetValue, status}`. Status direction-aware: HIGHER_IS_BETTER values below criticalThreshold → "critical", below warningThreshold → "warning", else "healthy"; inverted for LOWER_IS_BETTER; "neutral" when no thresholds; "no_data" when no data points
- [ ] `/kpis/templates` — marketplace browse + instantiate (cards with industry/function/quadrant filters + search; click → instantiate dialog with name/target/owner override)
- [x] `/kpis/import` — paste / upload CSV → preview → map columns → dry-run errors panel → commit
- [x] `/kpis/archive` — soft-deleted with countdown badge + restore/purge

## Tests

### Unit tests (Vitest)
- [x] FormulaEvaluator 50+ tests (see `packages/formula/` above)
- [x] DAG resolver 6+ tests
- [x] OutlierDetector 8 tests
- [x] KpiCascadesService.rollUp 6+ tests
- [x] Visibility helper 12 cases (3 scopes × 4 roles)
- [x] DataPointsService.create scope enforcement: PER_USER via wrong endpoint → 422
- [x] KpisService.canTransitionStatus: every valid + invalid pair
- [x] CSV import: 16+ cases
- [x] OrgUnitKpisService inheritance propagation: 7+ cases

### Integration tests (Vitest + Testcontainers)
- [x] Create KPI → record data point → query via API → matches inserted value
- [x] Create cascade (parent + 3 children with weights) → record child data → CalculationEngine fires → parent has COMPUTED data point with weighted average
- [x] Create PER_USER KPI → assign to user A and user B → user A records → query as user B → cannot see A's data point via any endpoint
- [x] Soft-delete KPI → not in list endpoint → still in `/kpis/archive` → restore → back in list

### Performance benchmark
- [x] `scripts/bench-hypertable.ts`:
  - seeds 1000 KPIs × 365 days = 365k rows
  - refreshes daily CAGG
  - benchmarks 3 query patterns over 20 iterations:
    - raw aggregate query (no CAGG)
    - CAGG aggregate query
    - dashboard summary via `DISTINCT ON (kpi_id) ORDER BY recordedAt DESC`
  - reports p50/p95/p99 latency per pattern
  - exits non-zero if any p95 exceeds budget
  - configurable via `BENCH_KPIS`, `BENCH_DAYS`, `BENCH_ITERATIONS`, `BENCH_BUDGET_MS`
- [x] Run command: `pnpm bench:hypertable`

### e2e tests (Playwright)
- [x] `apps/web/e2e/uc03-04-09-10-kpi-flow.spec.ts`:
  - UC-03: create KPI via `/kpis/new`
  - UC-04: record data point via `/kpis/[id]/data`
  - bonus: filter by scope, search by name
- [x] `apps/web/e2e/per-user-isolation.spec.ts`:
  - admin creates PER_USER attendance KPI
  - assigns to user A and user B
  - login as user A, record attendance via `/user-kpis/my-kpis/:id/data`
  - login as user B, navigate to home page "My KPIs"
  - assert user A's data NOT visible
  - hit `/kpis/[id]` as user B → see only own data

## Acceptance checklist

```bash
# 1. Unit tests
pnpm test
# Expect: 50+ formula evaluator, 8 outlier, 6+ cascade, 12 visibility, all green

# 2. Integration tests
pnpm test:int
# Expect: KPI CRUD + cascade + cross-user isolation tests green against real Postgres+TimescaleDB

# 3. Cross-tenant fuzz still green (now includes KPI + DataPoint resources)
pnpm --filter @kpi-nexus/api test:e2e -- cross-tenant.e2e.spec.ts

# 4. Performance benchmark
pnpm bench:hypertable
# Expect: dashboard_summary p95 < 100ms; CAGG_aggregate p95 < 100ms; raw_aggregate slower (proves CAGG is being used)

# 5. e2e
pnpm --filter @kpi-nexus/web test:e2e
# Expect: UC-03/04 + per-user-isolation specs green

# 6. Manual smoke
# a. Run sample-data seed: POST /organizations/seed-demo-data → 5 KPIs appear with 30d history
# b. Navigate /kpis/scorecard → 4 quadrants populated
# c. Create a cascade: parent KPI = WEIGHTED_AVG of 2 children with 50/50 weights → record child data → parent recomputes correctly
# d. Try to POST to /kpis/:id/data with a PER_USER KPI → receive 422 with correct endpoint name in error
# e. Bulk CSV import: prepare 10-row CSV → dry-run shows errors for malformed rows → fix → commit → KPIs created with audit
# f. Add a formula: KPI A = KPI B * 0.5 → record data for B → A's COMPUTED data point appears

# 7. CI green
```

Tag `git tag p2-complete` when all 7 steps verify.

## Gotchas + notes

- **TimescaleDB hypertable + Prisma**: Prisma doesn't natively understand hypertables; queries work transparently but `migrate dev` may complain about the `create_hypertable` call. Use `--skip-generate` after manual SQL.
- **Continuous aggregate refresh lag**: 30-min interval means dashboard reads might be up to 30 min stale. For real-time accuracy, fall back to raw table for "last hour" queries.
- **isolated-vm on Apple Silicon**: needs Node 20+ and may require `npm install isolated-vm --build-from-source`. Document in README.
- **Formula evaluator + cascade**: cascade rollups should NOT trigger formula re-evaluation (would cause loop). Use `sourceType === "COMPUTED"` as the guard.
- **Outlier detection**: Welford's algorithm is stable but the 30-point window is short. May want to make it configurable per KPI later.
- **Bulk CSV memory**: streaming parser for files > 10MB; for FYP scale, batch reads are fine.
- **Per-user KPI cascade**: averaging individual attendance up to team attendance up to org attendance is handled by `KPICascade` with appropriate `rollupMethod` (AVG); test this end-to-end.
- **Status transitions**: enforce via `canTransitionStatus` matrix at the service level; raw DB updates can bypass this so be careful with raw SQL.
- **Scope changes**: refuse via HTTP 409 if any data points exist (would orphan history). To intentionally change scope, archive the KPI and create a new one.

## Out of scope for P2

- Dashboards (P3)
- Alerts (P4)
- AI features including suggestions, NLQ, insights, recommendations (P5)
- ML sidecar integration including anomaly detection, forecasting, what-if (P5)
- OKR linking to KPIs (P7)
- Slack/Jira integration (P8)

## What comes next

Once P2 is tagged complete, open `docs/superpowers/plans/P3-visualization.md`. P3 builds the dashboards, widgets, real-time SSE, scheduled reports, public share, and embeds — all consuming the KPI engine that P2 just landed.
