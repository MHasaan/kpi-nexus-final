# TODOS — KPI Nexus Final

Flat checklist across all 10 phases. Tick items as work lands. Each phase has a corresponding detailed plan in `docs/superpowers/plans/` — this file is the at-a-glance tracker.

For per-phase detail, see `ROADMAP.md` and the linked plan files.

---

## P0 — Foundation (≈2 weeks)

### Infra
- [x] Initialize pnpm + Turborepo monorepo (`apps/{web,api,worker,ml}` + `packages/{contracts,db,ai,formula,ui,config}`)
- [x] Wire Turbo pipeline: `build`, `lint`, `typecheck`, `test`, `dev`, `db:generate`, `db:migrate`
- [x] `docker-compose.yml` with Postgres 16 + TimescaleDB + pgvector, Redis 7, MinIO, Mailhog, Jaeger
- [x] GitHub Actions: `ci.yml` matrix (lint/typecheck/test/build per app), Dependabot, gitleaks, CodeQL
- [ ] Turbo remote cache via Vercel free tier (deferred — optional, set TURBO_TOKEN + TURBO_TEAM later)
- [x] `.env.example` files for each app + root

### Backend
- [x] NestJS 11 (Fastify adapter) bootstrap in `apps/api/`
- [x] Pino logger + OTel SDK + Sentry SDK wired (all init in `src/instrumentation.ts`, no-op when env unset)
- [x] `/health` endpoint returning DB + Redis status
- [x] Prisma client wired through `packages/db`; empty schema with `timescaledb` + `pgvector` extensions enabled

### Worker
- [x] NestJS bootstrap in `apps/worker/` (no HTTP layer — `createApplicationContext`)
- [x] BullMQ connection setup (`@nestjs/bullmq` + ioredis)
- [x] Echo test queue + processor (proves wiring)

### ML
- [x] FastAPI skeleton in `apps/ml/`
- [x] `/health`, `/health/echo` endpoints
- [x] Dockerfile + requirements.txt (fastapi 0.115, uvicorn, sklearn, prophet, statsmodels — ready for P5)

### Frontend
- [x] Next.js 15 App Router scaffold in `apps/web/`
- [x] Tailwind + design tokens (`packages/ui/src/tokens.css` + Tailwind preset)
- [x] `next-themes` for dark mode (Providers wraps ThemeProvider, default light)
- [ ] Sentry SDK client + server (deferred — pkg added in spec, wiring lands when SENTRY_DSN is set in P1)
- [x] Landing page that loads (server component, themed via tokens)

### Database
- [x] `pnpm db:setup` script: probe Postgres → push schema → enable extensions → verify-setup
- [x] RLS policy templates in `packages/db/prisma/sql/rls-policies.sql` (empty for now, structure ready)

### Tests
- [x] One unit test per app proving framework wiring (api 3, worker 2, web 3, contracts 6)
- [x] One Playwright smoke test loading landing page (`apps/web/e2e/smoke.spec.ts`)

### Static verification (`pnpm turbo typecheck lint test build`)
- [x] **typecheck**: 11 tasks green
- [x] **lint**: 9 tasks green
- [x] **test**: 19 tasks green (14 unit tests + 5 no-test pass-through)
- [x] **build**: 8 tasks green (web 102KB shared JS, 4 static pages)

### Exit (live infra — run by user after starting Docker Desktop)
- [ ] `pnpm docker:up` → all 5 containers healthy
- [ ] `pnpm db:setup` → green checks for postgres reachable + extensions enabled
- [ ] `pnpm dev` → web on :3000, api on :4000, worker connected, ml on :8000 (`pnpm ml:install && pnpm ml:dev` separately)
- [ ] `curl :4000/health` returns `{db: "ok", redis: "ok"}`
- [ ] `curl :8000/health` returns `{ok: true}`
- [ ] `pnpm --filter @kpi-nexus/web test:e2e` passes
- [ ] CI green on a push (requires GitHub remote — `git remote add origin <url>`)
- [ ] When all above pass: `git tag p0-complete`

---

## P1 — Identity, Tenancy, RBAC (≈4 weeks)

### Schema
- [ ] Add: `Organization`, `CustomDomain`, `User`, `RefreshToken`, `EmailVerificationToken`, `PasswordResetToken`, `Session`, `LoginAttempt`, `PlatformAdmin`
- [ ] Add: `RoleDefinition`, `RoleInheritance`, `Position`, `PermissionDelegation`, `ResourcePermission`
- [ ] Add: `OrgUnitDimension`, `OrgUnitType`, `OrgUnit`, `OrgUnitMember`, `OrgUnitNameHistory`
- [ ] Add: `AuditLog`, `Plan`, `TenantQuota`, `FeatureFlag`, `CostMetric`, `RetentionPolicy`
- [ ] RLS policies on every tenant-scoped table
- [ ] Prisma middleware sets `app.current_org` GUC at connection checkout

### Backend modules
- [ ] `TenancyModule`: `RequestContextStore` (ALS) + `TenancyInterceptor`
- [ ] `AuthModule`: login, register-org, refresh rotation with reuse-detection, multi-org lookup, org switching, accept-invitation
- [ ] `PasswordModule`: reset request + confirm (1h expiry, single-use)
- [ ] `MfaModule`: TOTP enroll/confirm/disable (RFC 6238, pure Node, recovery codes)
- [ ] `PlatformAdminModule`: list + grant/revoke + impersonation
- [ ] `OrganizationsModule`: CRUD, settings, terminology, fiscal calendar, lifecycle transitions, export
- [ ] `CustomDomainModule`: DNS TXT verification flow
- [ ] `UsersModule`: CRUD + invitation lifecycle + offboarding + GDPR export
- [ ] `RbacModule`: 18-permission enum, `@RequirePermissions`/`@RequireAnyPermission`/`@OwnerOverride` decorators, `PermissionsGuard`, Redis 5-min cache + in-memory fallback
- [ ] `RolesModule`: CRUD + multi-parent inheritance + 4 presets + audit timeline
- [ ] `PositionsModule`: CRUD + industry presets
- [ ] `PermissionDelegationsModule`: CRUD + BullMQ delayed auto-revoke at validTo
- [ ] `ResourcePermissionsModule`: CRUD + `hasResourcePermission()` fast-path
- [ ] `OrgUnitDimensionsModule`, `OrgUnitTypesModule`, `OrgUnitsModule` (+ reorganization: move/merge/split/rename)
- [ ] `OrgChartModule`: read-side projection for SVG tree
- [ ] `AuditModule`: structured events + redaction + interceptor + cross-tenant guard with `runWithBypass`
- [ ] `BillingModule`: Plan catalog (FREE/PRO/ENTERPRISE lazy seed), TenantQuota counters, FeatureFlag, cost telemetry daily aggregate (schema only; UI is placeholder)
- [ ] `RateLimitModule`: Redis sliding window, 2 buckets (auth+general), 429 with retryAfter
- [ ] `HealthModule`: `/health` + `/health/details`

### Frontend
- [ ] App shell layout (sidebar + header) with permission-filtered nav
- [ ] Auth pages: `/login` (multi-org picker), `/register`, `/auth/password/reset`, `/auth/accept-invitation/[token]`, `/auth/mfa-required`, `/unauthorized`
- [ ] AuthContext with token + permissions + 5-min refresh
- [ ] Route guards: `<ProtectedRoute>`, `<RequirePermission>`, `<RequireAnyPermission>`, `<PermissionGuard>`
- [ ] `/settings/organization`, `/settings/branding`, `/settings/custom-domain`, `/settings/locale`, `/settings/fiscal`, `/settings/terminology`, `/settings/password-policy`
- [ ] `/users` table + create/edit sheet + invite + role/position assignment
- [ ] `/users/[id]` detail + memberships + audit timeline + offboarding action
- [ ] `/me/profile`, `/me/sessions`, `/me/mentions` (empty for now), `/me/preferences`, MFA enrollment
- [ ] `/roles` list + matrix bulk editor + hierarchy SVG + presets page + audit timeline
- [ ] `/positions` + presets page
- [ ] `/org-units` tree + chart + dimensions + reorganize
- [ ] `/audit` log viewer with filters + JSON change diff
- [ ] `/billing` placeholder page (plan card + usage bars + "Upgrade" → modal)
- [ ] `/admin/impersonate` page (UUID-paste start form + persistent amber banner)
- [ ] `/status` health page
- [ ] Custom-terminology rendering driven by org settings (30s in-memory cache, smart pluralization)
- [ ] Basic onboarding wizard stub at `/signup/wizard` (5 routes, no AI, no templates — full version in P6)

### Tests
- [ ] AuthService unit ≥95% coverage
- [ ] RBAC guard truth-table for all 18 permissions × 4 default roles
- [ ] Cross-tenant fuzz harness over 8+ resources × 4 verbs (GET/PATCH/DELETE/LIST)
- [ ] e2e UC-01 (Login & Auth), UC-02 (Manage Roles), UC-11 (Org Settings)
- [ ] Full happy-path e2e: register → wizard skip → invite user → role gating → audit visible
- [ ] Refresh-token reuse-detection test: presenting revoked-but-not-replaced token kills chain
- [ ] **12-case visibility helper unit test (3 scopes × 4 default roles) — required for spec §6 compliance**

### Exit
- [ ] Cross-tenant fuzz green on all P1 endpoints
- [ ] e2e UC-01/02/11 pass
- [ ] Full happy-path e2e pass
- [ ] MFA TOTP enroll → login works
- [ ] Postgres RLS enforces on every tenant-scoped table (pen-test pass)
- [ ] Tag `git tag p1-complete`

---

## P2 — KPI Engine + Data Layer (≈5 weeks)

### Schema
- [ ] `KPICategory`, `KPI` (with scope enum ORG_WIDE/PER_UNIT/PER_USER), `KPIVersion`, `KPIDependency`, `FormulaExpression`
- [ ] `KPITarget` (6 types), `KPIThresholdBand`, `KPIBenchmark`, `KPICascade`
- [ ] `KPIDataPoint` (TimescaleDB hypertable target), `KPIDataPointHistory`, `KPIWatch`, `KPISavedView`, `KPITemplate`
- [ ] `LineageEdge`, `DataSnapshot`
- [ ] `UserKPIAssignment`, `OrgUnitKPIAssignment` (with `inherited` boolean)
- [ ] Convert `KPIDataPoint` to TimescaleDB hypertable partitioned by week
- [ ] 5 continuous aggregates (hourly/daily/weekly/monthly/quarterly)
- [ ] Auto-refresh policy every 30 min
- [ ] Compression policy after 90 days

### Packages
- [ ] `packages/formula/`: parser + AST + serializer + isolated-vm evaluator (100ms timeout, 32MB memory, allow-listed functions)
- [ ] `packages/formula/`: DAG resolver + topological sort + cycle detection
- [ ] 50+ formula unit tests including sandbox escape attempts

### Backend modules
- [ ] `KpiCategoriesModule`: CRUD
- [ ] `KpisModule`: CRUD with version snapshots, status lifecycle (DRAFT→PROPOSED→APPROVED→ACTIVE→PAUSED→DEPRECATED→ARCHIVED), deprecation chain, soft-delete + 30-day restore, sample-data seed, bulk CSV import
- [x] `KpiTemplatesModule`: curated catalog + relevance scoring + org-private + marketplace + instantiation
- [x] `FormulaModule`: validate + attach/detach + dependency wiring
- [x] `CalculationEngineModule`: BullMQ queue `calc-engine` + processor wired to FormulaEvaluator + KpiCascadeService + LineageService
- [ ] `DataPointsModule`: single + bulk insert with idempotency, validation, outlier flag (Welford streaming 3σ), adjust with history
- [ ] **Critical: `POST /kpis/:id/data` returns HTTP 422 if KPI scope ≠ ORG_WIDE with correct endpoint name in error**
- [x] `KpiTargetsModule`: 6 target types (STATIC/TIERED/DYNAMIC/TIME_VARYING/CONDITIONAL/SCENARIO) + `resolveActive(kpiId, at)`
- [x] `KpiThresholdBandsModule`: N-band thresholds + hysteresis (`consecutivePointsRequired`)
- [x] `KpiBenchmarksModule`: internal (auto-computed N-day average) + external (industry) + compute trigger
- [x] `KpiCascadesModule`: parent↔child with weight + rollupMethod + cycle detection
- [x] `LineageModule`: record + BFS trace upstream/downstream
- [ ] `UserKpisModule`: per-user assignments + personal data entry via `POST /user-kpis/my-kpis/:assignmentId/data`
- [ ] `OrgUnitKpisModule`: per-unit assignments + inheritance to descendants

### Frontend
- [ ] `/kpis` catalog with table + grid toggle + filters (category/scope/status/owner/quadrant/search) + bulk actions
- [ ] `/kpis/new` 3-panel form (basics/measurement/assignment)
- [ ] `/kpis/[id]` detail page with tabs (Overview/Data/Formula/Cascade/Targets/Thresholds/Benchmarks/Lineage/Audit)
- [ ] `/kpis/[id]/data` entry form (scope-aware — posts to correct endpoint) + recent points
- [ ] `/kpis/[id]/formula` visual block editor + Monaco code mode + dependency graph
- [ ] `/kpis/[id]/cascade` parents above, children below, weight + rollup editor
- [ ] `/kpis/[id]/targets` type tab strip + per-type fields + history
- [ ] `/kpis/[id]/threshold-bands` N-band editor + status preview
- [ ] `/kpis/[id]/benchmarks` 1D scale chart + manual add + auto-compute
- [ ] `/kpis/[id]/lineage` SVG graph (depth-1 upstream left, downstream right) + BFS trace lists
- [ ] `/kpis/tree` global cascade tree (color-coded by quadrant)
- [ ] `/kpis/scorecard` 2×2 BSC quadrant grid
- [ ] `/kpis/templates` marketplace browse + instantiate
- [ ] `/kpis/import` CSV upload → preview → column map → dry-run + commit
- [ ] `/kpis/archive` soft-deleted with restore/purge
- [ ] Home page "My KPIs" panel listing PER_USER assignments with inline value entry
- [ ] `/team` (manager view) showing direct reports' PER_USER KPIs side-by-side
- [ ] `/users/[id]` per-user KPI panel

### Tests
- [ ] `scripts/bench-hypertable.ts` seeds 1000 KPIs × 365 days, benchmarks 3 query patterns with p50/p95/p99
- [ ] Cascade weighted-avg correctness on parent recompute (6+ tests covering SUM/AVG/WEIGHTED_AVG/MIN/MAX/CUSTOM_FORMULA)
- [ ] e2e UC-03 (Configure KPIs), UC-04 (Record KPI Data Point)
- [ ] **PER_USER cross-user isolation test: user A records data, user B cannot see it via any endpoint**
- [ ] **Scope enforcement test: POST /kpis/:id/data with PER_USER KPI returns 422**
- [ ] **Visibility helper exhaustive test: 12 cases (3 scopes × 4 default roles)**

### Exit
- [ ] Dashboard summary endpoint <100ms p95 with 1000 KPIs × 365-day history
- [ ] Formula evaluator passes 50+ tests inc. sandbox escapes (process/require/global/eval/setTimeout/__proto__/fs/this/infinite-loop)
- [ ] Cascade rollup correct: parent = weighted avg of N children, recomputes on child change
- [ ] e2e UC-03/04 pass
- [ ] PER_USER scope isolation tests pass
- [ ] Tag `git tag p2-complete`

---

## P3 — Visualization & Reporting (≈4 weeks)

### Schema
- [x] `Dashboard` (with `version` for optimistic concurrency + `deletedAt`), `DashboardWidget`
- [x] `DashboardSnapshot`, `DashboardShareLink` (token + expiry + viewCount + passwordHash + revokedAt) — with FK relations to Dashboard/User
- [x] `ScheduledReport`, `ReportRun` (+ `ReportFormat`/`ReportRunStatus` enums)

### Backend modules
- [x] `DashboardsModule`: CRUD + widget CRUD + share rules (owner OR isShared) + default-dashboard logic + ETag/If-Match concurrency + soft-delete (20 unit tests; live-verified)
- [x] `DashboardSnapshotsModule`: point-in-time capture (dashboard + widgets + latest KPI values) + list + get + delete (14 unit tests)
- [x] `DashboardShareLinksModule`: 32-byte tokens + expiry + view counter + bcrypt password + revoke; public resolve via runWithBypass; password via POST body not query (30 unit tests)
- [x] `RealtimeModule`: SSE endpoint (Fastify hijack + 25s heartbeat) + ioredis pub/sub + org-filtered events + event catalog; wired into KPI data writes (15 unit tests; live SSE smoke verified)
- [x] `ReportsModule`: CSV (Papa+BOM), Excel (exceljs), PDF (pdfkit — chosen over @react-pdf, no JSX build needed) generation; board-pack composer; HMAC-signed embed tokens (19 unit tests)
- [x] Scheduled reports: BullMQ repeatable jobs + processor (runs as report creator for correct §6 visibility) → MinIO upload → presigned URL → Mailhog email; CRUD + trigger (7 unit + 1 integration test, Mailhog email asserted)

### Frontend
- [x] `/dashboards` list + create + set-default + delete actions (Playwright-verified)
- [x] `/dashboards/new` form
- [x] `/dashboards/[id]` detail: drag-drop grid + real-time refresh + date-range bar + snapshot/share/print actions
- [x] `/dashboards/[id]/widgets/add` widget type select + KPI ID picker + config (inline on detail page)
- [x] Drag-drop dashboard builder (react-grid-layout, 12-col, debounced 350ms PATCH; delete tagged `.widget-no-drag`)
- [x] 10 widget types (kpi_card, line, bar, pie, gauge, number, list, trend, activity, strategy_map) via recharts
- [x] `<RealtimeRefresh>` client component — subscribes via fetch-stream SSE (bearer auth; EventSource can't send headers) + debounced 1.5s re-fetch
- [x] `/dashboards/[id]/widgets/[wid]` drill-down with from/to/quality filters + min/avg/max tiles + chart toggle
- [x] Date-range bar with 4 presets + custom (full cross-filtering deferred to P9 per plan)
- [x] `/reports` list (run/pause/delete) + `/reports/new` (cron presets + KPI multi-select + recipients) + `/reports/[id]` (run history with download)
- [x] `/reports/board-pack` executive summary composer
- [x] `/dashboards/[id]/share` admin view of share links
- [x] `/dashboards/[id]/snapshots` snapshot history + capture + view
- [x] `/share/[token]` public viewer (no auth, no app shell; password prompt)
- [x] `/kpis/[id]/embed` generator (iframe snippet + live preview)
- [x] `/embed/kpi/[token]` chrome-less single-KPI viewer
- [x] `<PrintButton>` + print stylesheets (`@media print` hides chrome)
- [ ] Optimistic-concurrency 3-way diff dialog on dashboard edit (backend 412 done + tested; FE conflict dialog NOT yet built)

### Tests
- [x] e2e UC-05 (Real-Time Dashboard), UC-09 (Generate Reports), UC-10 (Export Reports) — Playwright, 13 specs green vs live stack
- [x] SSE propagation: data point insert → SSE stream receives `data_point_added` (live curl smoke + e2e two-tab)
- [x] Scheduled report end-to-end (trigger → file in MinIO → Mailhog inbox; integration test)
- [ ] Lighthouse Performance ≥90 on `/dashboards/[id]` route — NOT run (needs browser perf harness)

### Exit
- [ ] 12-widget dashboard with 1000 KPIs renders <3s p95 — NOT measured (needs seeded perf dataset + browser timing)
- [x] SSE: data point insert reflected across clients (live-verified; e2e two-tab)
- [x] Scheduled report cron triggers + emails delivered within 30s (integration-verified)
- [ ] Lighthouse Performance ≥90 on dashboard — NOT run
- [ ] Tag `git tag p3-complete` — held pending Lighthouse/perf verification + FE concurrency dialog

---

## P4 — Alerting (≈3 weeks)

### Schema
- [ ] `AlertRule`, `EscalationRule`, `Alert`
- [ ] `NotificationChannel`, `NotificationDelivery`
- [ ] `WebhookSubscription`, `ApiKey` (used by webhook signing + ingest)

### Backend modules
- [ ] `AlertRulesModule`: rule CRUD with 5 types (STATIC_THRESHOLD/DYNAMIC_STDDEV/RATE_OF_CHANGE/NO_DATA/COMPOSITE), severity, escalation editor
- [ ] `AlertEngineModule`: BullMQ queue `alert-eval`, post-data-point auto-enqueue, evaluator
- [ ] `EscalationsModule`: delayed BullMQ jobs per level with deterministic jobId `escalate:{alertId}:lvl{n}`, abort-if-not-OPEN
- [ ] `NotificationChannelsModule`: per-org channels (6 kinds: EMAIL/SLACK/TEAMS/SMS/IN_APP/WEBHOOK) + test-send
- [ ] `NotificationsModule`: dispatcher + per-kind adapters (Resend/Slack webhook/Teams webhook/Twilio/IN_APP ack/HMAC webhook)
- [ ] Notification retry queue with exponential backoff (30s → 5min → 30min, max 3 attempts) + DLQ
- [ ] DLQ admin endpoints: `GET /notification-deliveries?status=FAILED`, `POST /notification-deliveries/:id/retry`
- [ ] Per-user dedup window via `cooldownMinutes` config on rule
- [ ] Digest mode: 60s BullMQ batching collator + `alert_digest` realtime event
- [ ] `WebhooksModule`: outbound subscription CRUD + HMAC-SHA256 signing + secret rotation
- [ ] `ApiKeysModule`: mint `kpinx_<base64url(24)>` plaintext once + SHA-256 hash + 12-char prefix + scopes + JwtAuthGuard short-circuit

### Frontend
- [ ] `/alerts` list with severity/status/category filters + search + manual scan + bulk acknowledge
- [ ] `/alerts/new` rule basics + structured condition tree (5 rule types) + escalation editor
- [ ] `/alerts/[id]` detail with related KPI chart + recommendation panel (stubbed until P5) + comments + ack/snooze
- [ ] `/alerts/channels` channel CRUD + test-send
- [ ] `<EscalationBuilder>` client component with dynamic levels (delayMinutes + channels + notify roles/users + up/down/remove)
- [ ] `/settings/notifications` per-user prefs (digest mode + mute hours)
- [ ] DLQ admin view (filter status=FAILED + manual retry)

### Tests
- [ ] Alert latency benchmark: data point inserted → alert visible <10s p95
- [ ] Escalation level 2 fires after configured delay if not acknowledged
- [ ] Notification retry survives 5xx (eventual delivery within 30 min)
- [ ] Digest mode: 5 alerts within 60s → single email
- [ ] Cross-channel test: alert fans out to EMAIL + SLACK + IN_APP simultaneously
- [ ] Webhook signature verify test (constant-time + 5-min replay window)

### Exit
- [ ] Alert latency <10s p95
- [ ] Escalation chain works end-to-end
- [ ] Retry survives provider 5xx
- [ ] Digest collates within 60s window
- [ ] Tag `git tag p4-complete`

---

## P5 — AI Layer (≈5 weeks)

### Schema
- [ ] `AnomalyDetection`, `Forecast` (with `ForecastModelKind` enum), `KPIInsight`, `Recommendation`
- [ ] `NLQQuery` (with per-provider embedding columns: `embedding_openai vector(1536)?`, `embedding_gemini vector(768)?`, `embedding_voyage vector(1024)?`)
- [ ] `KpiCatalogEmbedding` (with per-provider columns; `@@unique([kpiId, providerKey])`)
- [ ] `AiProvider`, `AiFeatureConfig`, `AiCallLog`, `AiBudget`
- [ ] `Workflow` (for non-alert automation; engine wiring in P7)

### Packages
- [ ] `packages/ai/src/types.ts`: `IAiProvider` interface + normalized request/result/chunk shapes
- [ ] `packages/ai/src/providers/claude.ts`: Anthropic Messages API + `cache_control: ephemeral` + tool_use translation + SSE
- [ ] `packages/ai/src/providers/gemini.ts`: `:generateContent` + `:streamGenerateContent` + 8-key rotation + functionCall normalization
- [ ] `packages/ai/src/providers/openai.ts`: chat completions + tools + embeddings + cached_tokens capture
- [ ] `packages/ai/src/providers/ollama.ts`: `/api/chat` + `/api/embeddings` (cost=$0)
- [ ] `packages/ai/src/pricing.ts`: per-provider price table

### Backend modules
- [ ] `AiModule` (core): `AiProviderRegistry` + `AiRouter` + `AiBudgetService` + `AiCallLogService` + 11-feature catalog + `DEFAULT_FYP_CONFIG`
- [ ] `AiRouter`: resolves `(orgId, feature) → (providerId, model)` from `AiFeatureConfig`; fallback chain on rate-limit/5xx/budget
- [ ] `AiBudgetService`: per-org daily/monthly Redis counters with DB persistence; circuit breaker FAIL_CLOSED or FALLBACK; lazy rollover
- [ ] `AiCallLogService`: every call → AiCallLog with provider/model/tokens/cost/latency/status; cost via `priceCall()`
- [ ] BYO-key flow in `apps/api/src/ai/byo/`: AES-256-GCM encryption + per-deploy master secret + validate via test ping + persist + invalidate cache
- [ ] Prompt caching on Claude (`cache_control: ephemeral` on system prompts + KPI catalogs)
- [ ] `AnomalyDetectionModule`: routes to ML `/anomaly/detect`; confirm-triggers-alert + confirm-triggers-recommendation on false→true transition
- [ ] `ForecastsModule`: routes to ML `/forecast`; yhat + 80%/95% bands + fit metrics
- [ ] `WhatIfModule`: routes to ML `/whatif`
- [ ] `KpiSuggestionsModule`: AI-suggested KPIs from org profile + existing catalog
- [ ] `InsightsModule`: scheduled cron `30 2 * * *` UTC + on-demand + batch endpoints; Claude haiku narratives
- [ ] `RecommendationsModule`: alert-triggered (auto) + anomaly-confirm-triggered (auto) + manual; structured JSON output; status flow PENDING→ACTIONED/DISMISSED
- [ ] `NlqModule`: embed → pgvector cosine search → Claude tool-use loop (max 5 rounds) with 5 tools (`query_timeseries`, `compare_kpis`, `get_metadata`, `forecast_kpi`, `get_kpi_history`); visibility-aware tool calls
- [ ] Auto-reembed on KPI create/update (name/description/tags/unit change)
- [ ] Background `nlq-reembed` BullMQ queue + processor when org switches embedding provider (chunked, idempotent via deterministic jobId)

### ML sidecar
- [ ] `POST /anomaly/detect`: IsolationForest + Z-score + EWMA ensemble; configurable per-detector knobs
- [ ] `POST /forecast`: Prophet → ARIMA fallback → naive last-resort; yhat + 80%/95% bands + rmse/mape/aic fit metrics
- [ ] `POST /whatif`: parameterized scenario simulator (additive/multiplicative + floor/ceiling clamps)
- [ ] `POST /correlation`: pairwise + matrix via scipy.stats
- [ ] `POST /seasonality`: statsmodels.tsa.seasonal_decompose
- [ ] HMAC auth (X-Tenant-Id + X-Signature-Timestamp + X-Signature SHA256 of `${ts}.${orgId}` keyed by `ML_SIDECAR_HMAC_SECRET`); constant-time verify; 5-min skew; refuses placeholder dev secret in production

### Frontend
- [ ] `/settings/ai` per-feature dropdown (provider + model) + budget caps + cost dashboard + last-7d call counts per provider
- [ ] BYO-key paste-and-validate flow
- [ ] `/ask` NLQ chat page: client component POST to `/api/nlq/ask` proxy; renders answer + sources + chart preview + provider/model/cost footer
- [ ] `/insights` server-rendered list of KPIInsight with KPI link + narrative + "Generate insights" Server Action
- [ ] `/recommendations` panel with status badges + priority-coded actions + root-cause hypotheses + confidence + status flip buttons
- [ ] `/kpis/[id]/anomalies` series chart with confidence bands + anomaly markers + threshold knob + persist toggle + live vs saved tables
- [ ] `/kpis/[id]/forecast` model + horizon controls + prediction chart with bands + fit-metric tiles
- [ ] `/kpis/[id]/whatif` upstream-dep sliders + mechanic toggle + baseline vs scenario charts + aggregate lift tiles
- [ ] AI confidence indicators throughout (badges, footers)

### Tests
- [ ] Claude cost guard test: budget exceeded throws AiBudgetExceededError correctly at boundaries
- [ ] AiRouter fallback test: primary fails → fallback called → success
- [ ] NLQ golden question harness: 20 hand-crafted Q&A; goal 18/20 correct
- [ ] Anomaly F1 ≥0.7 on synthetic seasonal+spike test set
- [ ] Forecast MAPE ≤15% at 90-day horizon on test KPIs
- [ ] e2e UC-06 (Predictive Analytics), UC-07 (Detect Anomalies), UC-08 (Alerts & Recommendations)
- [ ] **NLQ visibility test: viewer asking about restricted PER_USER data — must refuse or show only visible**

### Exit
- [ ] Per-org Claude spend <$1/day with default settings
- [ ] Provider failover works (kill Claude → falls back to Gemini → response returns)
- [ ] NLQ 18/20 golden questions correct
- [ ] Anomaly F1 ≥0.7
- [ ] Forecast MAPE ≤15% at 90-day
- [ ] Alert latency still <10s (no regression)
- [ ] Tag `git tag p5-complete`

---

## P6 — Onboarding 2.0 + AI Co-pilot (≈3 weeks)

### Schema
- [ ] Extend `OnboardingSession` with `userId?`, `userEmail`, `lastEditedStep`, `entryMode` (quick/full/template:slug)
- [ ] `OnboardingAIInteraction` (mode/prompt/response/applied/edited/tokens/latency)
- [ ] `OrgTemplate` (tier: rich/starter/legacy)
- [ ] `OnboardingTask` (14 default keys: domain_verification, sso, mfa, data_source, channels, historical_import, default_dashboard, scheduled_report, ai_tuning, remaining_invites, okrs, escalation, custom_domain, compliance_review)

### Backend modules
- [ ] `OnboardingModule` extended: auto-save on every field change, resumable, per-step sample-data seed, per-step advanced expand, materialization transaction
- [ ] `OnboardingAiModule` 4 modes: `generator` (full org from prompt), `assistant` (RFC 6902 patch), `suggest` (chips), `explain` (Q&A)
- [ ] AIDiffPreview gate — every output reviewed before applied; logged to OnboardingAIInteraction
- [ ] Per-mode rate limits (generator 5/hr, assistant 30/hr, suggest 60/hr, explain 100/hr per session)
- [ ] `OrgTemplatesModule`: tiered templates; rich SaaS-Startup template seeded from original-app `seed.ts`; starter templates per industry
- [ ] `SetupChecklistModule`: 14 default tasks, lazy upsert, status flow pending/complete/dismissed

### Frontend
- [ ] `/signup/wizard` 3-pane shell (step sidebar | content | AI co-pilot rail)
- [ ] Entry splash with 3 cards: Quick start / Full setup / Template gallery
- [ ] 5 step routes: organization, structure, roles, KPIs, team
- [ ] Per-step advanced expand-to-reveal sections (matching original seed.ts depth)
- [ ] AI co-pilot rail: thread + composer + AIDiffPreview modal + SuggestChip inline
- [ ] DraftSyncProvider with 600ms debounced backend sync + instant localStorage cache
- [ ] OfflineBanner + ResumeBanner + DraftStatusBadge
- [ ] Keyboard shortcuts: Ctrl+Enter (save & continue), Esc (close rail/diff)
- [ ] `<TemplateGallery>` with rich + starter previews + apply
- [ ] Post-onboarding `/setup-checklist` page with progress bar + pending tasks + collapsed completed group
- [ ] Onboarding tour (first-login tooltips, 5 slides) — flag stored on User.notificationSettings

### Tests
- [ ] Full happy-path e2e: enter org details → AI generates full org → review diff → apply → complete onboarding → setup checklist appears
- [ ] AI generator test: prompt "B2B SaaS startup, 50 employees" → returns valid org JSON with ≥5 roles + ≥3 unit types + ≥5 KPIs
- [ ] Draft survives browser crash: write to draft → kill browser → reload → state restored from localStorage
- [ ] Rate-limit test: 6th generator call within 1h returns 429

### Exit
- [ ] A new admin can reproduce the full original-app seed.ts demo org (10 roles, 14 positions, 11 units, 20 KPIs, 5 categories) in a single onboarding session
- [ ] AI generator returns reasonable org JSON in <30s
- [ ] Draft survives browser crash
- [ ] 14-task setup checklist appears on home page after onboarding
- [ ] Tag `git tag p6-complete`

---

## P7 — Collaboration & Workflow (≈4 weeks)

### Schema
- [ ] `Task` (with TaskStatus + TaskPriority enums + 3 indexes)
- [ ] `Comment` (with parentCommentId for threading + mentionedUserIds + deletedAt soft-delete)
- [ ] `Mention` (per-recipient inbox row)
- [ ] `Objective` (with ObjectiveStatus enum + parentObjectiveId self-FK + progress)
- [ ] `KeyResult` (with kpiId? FK + baseline/target/current + weight + progress)
- [ ] `ApprovalWorkflow` (with ApprovalEntityType enum + requiredApproverRoleIds[] + requireAll)
- [ ] `ApprovalRequest` (with ApprovalRequestStatus enum + decisions Json + proposedPayload Json)

### Backend modules
- [ ] `TasksModule`: CRUD + status flow (TODO/IN_PROGRESS/BLOCKED/DONE/CANCELLED) + KPI/alert links + audit
- [ ] `CommentsModule`: threaded on KPI/Dashboard/Alert/Task + soft-delete + author-only edit/delete + mention support
- [ ] `MentionsModule`: per-recipient inbox; created in same transaction as comment; self-mentions stripped
- [ ] `OkrsModule`: Objectives + KeyResults + KPI-linked auto-progress + weighted rollup + parent objective alignment + cycle guard (depth 10)
- [ ] OKR progress math (`keyResultProgress`, `objectiveProgress`) covering all 4 KR shape variants + weighted average + zero-weight fallback
- [ ] `syncFromLinkedKpis()` pulls latest KPI data point into linked KRs
- [ ] `ApprovalsModule`: workflows + requests + `resolveStatus()` decision logic + self-approval blocked + duplicate decisions blocked
- [ ] `requireApprovalIfActive(entityType, entityId, payload)` seam — wired into KpisService.update + KpiTargetsService.create/update + RolesService.update
- [ ] `ApprovalApplyService` replays approved patches (uses bypassApproval flag)
- [ ] `WorkflowsModule`: generic rule engine (kpi_changed/schedule/alert/manual triggers; value-condition filters with 6 operators; create_task/post_webhook/send_notification actions); wired into DataPointsService.create

### Frontend
- [ ] `/tasks` kanban board (5 columns) with HTML5 drag-drop + quick-create + optimistic UI + per-card delete
- [ ] `<CommentsDrawer entityType entityId />` 380px slide-out anchored to right; trigger as 💬 pill in page header; mounted on KPI/Dashboard/Alert detail pages
- [ ] `<CommentsPanel>` inline at page bottom (complementary layout)
- [ ] `/me/mentions` inbox with mark-read actions
- [ ] `/okrs` grid of objective cards (progress bars + status badges)
- [ ] `/okrs/new` form (name/description/owner/parent/period)
- [ ] `/okrs/[id]` overall progress meter + KR cards (inline currentValue edit + delete + add-KR + status dropdown + sync-from-linked-KPIs button + aligned children list)
- [ ] `/approvals` Pending/Resolved split with per-request decision buttons + comment field + cancel button
- [ ] `/approvals/workflows` per-entity-type config (approver roles + requireAll + active toggle)
- [ ] `/workflows` rule engine editor (trigger picker + condition builder + action selector)

### Tests
- [ ] OKR progress aggregation correctness (13+ tests): higher-is-better, lower-is-better, no-baseline, baseline==target; weighted avg + zero-weight fallback; parent rollup with cycle guard
- [ ] Approval flow test: KPI update with active workflow → throws 202 with requestId → approver approves → patch is replayed via ApprovalApplyService
- [ ] Workflow rule engine test: kpi_changed event triggers task creation via rule engine
- [ ] Mention test: comment with @mention creates Mention row in same transaction; self-mentions stripped

### Exit
- [ ] OKR objective with mixed KR types aggregates correctly
- [ ] Approval workflow round-trip works
- [ ] Comment + mention in same transaction
- [ ] Workflow rule engine triggers on KPI change
- [ ] Tag `git tag p7-complete`

---

## P8 — Integrations & Extensibility (≈4 weeks)

### Schema
- [ ] `IntegrationConnection` (OAuth tokens encrypted AES-256-GCM)
- [ ] `Connector` (with type enum REST/GraphQL/postgres/mysql/s3/gcs/webhook + schedule + lastRunAt/Status)
- [ ] `Pipeline` (with status enum IDLE/RUNNING/SUCCEEDED/FAILED + step interpreters)
- [ ] `IngestionJob` (kind + source Json + status + errorLog)
- [ ] `Plugin` (with type WIDGET/TEMPLATE/FORMULA_FN/CONNECTOR + version + entryUrl)

### Backend modules
- [ ] `IntegrationsModule`: `IntegrationConnection` CRUD + AES-256-GCM encryption (KMS-ready master key loading) + audit log never carries raw tokens
- [ ] `IntegrationCryptoService`: 12-byte random IV + 16-byte auth tag (ciphertext layout `IV‖tag‖ct` base64); 12+ unit tests covering hex/base64/passphrase key loading, round-trip, tampering rejection, short-cipher reject, 8KB+UTF-8 payloads
- [ ] `SlackModule`: bot, slash command `/kpi <name>`, alert posting with action buttons, NLQ from Slack
- [ ] `TeamsModule`: webhook + adaptive cards
- [ ] `JiraModule`: create issue from alert + two-way status sync to `Task`
- [ ] `InboundEmailModule`: public webhook receiver at `POST /webhooks/inbound/email`; plus-addressing routing `inbound+<type>-<id>@host`; HMAC-SHA256 verifier; sender must match user in resolved org; strips quoted-reply lines
- [ ] `ConnectorsModule`: registry CRUD; REST runner + GraphQL runner first; Postgres + MySQL second; idempotency-key namespace per type
- [ ] `ConnectorSchedulerService` + processor: per-connector repeatable BullMQ jobs (deterministic jobId), auto-reconcile on create/update/remove
- [ ] `IngestModule`: `POST /ingest` authenticated by `Bearer kpinx_*` (ApiKey strategy) gated by `kpi:data_entry` scope; 1-10k rows per call; per-row idempotency
- [ ] `ApiKeysModule`: (already shipped in P4) — extend with SCIM scope
- [ ] `WebhooksModule`: (already shipped in P4) — extend with event catalog
- [ ] `PluginsModule`: catalog + lifecycle (WIDGET/TEMPLATE/FORMULA_FN/CONNECTOR types); isolated-vm sandbox for formula-fn; iframe sandbox for widget rendering

### Frontend
- [ ] `/integrations` marketplace cards (Slack/Teams/Jira/Salesforce/Snowflake/etc.) with OAuth status badges
- [ ] OAuth callback handlers per provider
- [ ] `/connectors` list + create wizard (source picker → schema map → schedule → test)
- [ ] `/connectors/[id]` detail + run history + manual trigger + edit schedule
- [ ] `/settings/api-keys` list with key prefix + scopes + last used + revoke; mint flow (show plaintext ONCE)
- [ ] `/settings/webhooks` list + create + rotate secret + test
- [ ] `/plugins` gallery + install/uninstall

### Tests
- [ ] Slack alert with action buttons → click "Acknowledge" → status syncs back to Alert
- [ ] Jira issue lifecycle round-trip (create from alert → close → Task status updates)
- [ ] REST connector pulls a public sample API daily into a KPI (verified for a week)
- [ ] Inbound email: send to `inbound+kpi-<id>@host` → comment appears on the KPI
- [ ] API key minted with `kpi:data_entry` scope can hit `POST /ingest` but receives 403 on `POST /kpis`

### Exit
- [ ] Slack OAuth + alert posting + ack sync-back
- [ ] Jira issue create + status sync
- [ ] REST connector pulls public API daily
- [ ] Inbound email → comment
- [ ] API key scope enforcement works
- [ ] Tag `git tag p8-complete`

---

## P9 — Polish (≈3 weeks)

### Schema
- [ ] `SsoConfig` (organizationId/protocol/idpEntityId/idpSsoUrl/encryptedCertificate/allowJitProvisioning/defaultRoleId)
- [ ] `ScimToken` (organizationId/label/hashedToken/expiresAt/lastUsedAt/revokedAt)

### Backend modules
- [ ] `SsoModule`: SAML + OIDC via WorkOS provider; JIT user provisioning; default-role assignment
- [ ] `ScimModule`: RFC 7644 `/scim/v2/*` endpoints (Users + Groups + ServiceProviderConfig + ResourceTypes); auth via ApiKey + `scim:provision` scope; PATCH active=false → suspend (reversible via active=true); DELETE → archive; Okta-style member filter `members[value eq "<id>"]`
- [ ] Full `GdprModule.delete()` (P1 only had export; this adds cascade delete with audit)
- [ ] KMS data key wiring for IntegrationConnection encryption (production AWS KMS GenerateDataKey)
- [ ] Per-tenant audit retention tiers (FREE 90d / PRO 1yr / ENTERPRISE 7yr); `RETENTION_TIERS` constant; `POST /retention-policies/apply-tier {tier}` one-click apply
- [ ] `SearchModule`: global FTS across KPIs/dashboards/users/units with relevance scoring (exact 1.0 / prefix 0.8 / substring 0.5); per-type cap 12, overall cap 50
- [ ] `ActivityModule`: per-user/per-org timeline from AuditLog; cursor pagination via `nextCursor`
- [ ] Custom-domain ACM cert provisioning via lambda (or document manual cert flow)
- [ ] OpenAPI auto-gen from NestJS + Zod via `nestjs-zod`; Spectral lint passes
- [ ] TypeScript SDK auto-gen into `packages/sdk/`; CI regenerates on schema change

### Frontend
- [ ] Soft-delete + 30-day restore UI for KPIs (`/kpis/archive`), Dashboards (`/dashboards/archive`), Users (trash list)
- [ ] Per-card countdown badge + restore/purge actions
- [ ] In-app help drawer with contextual route → tip cards; floating `?` button (top-right) with pulse hint until first open; CONTEXTUAL_HELP registry maps pathname patterns
- [ ] Sample-data toggle: `POST /organizations/seed-demo-data` instantiates 5 curated KPIs (MRR/NPS/Churn/Deployment Frequency/Engagement Score) and back-fills 30 days of deterministic-pseudorandom data points; idempotent
- [ ] Global search bar in app shell (⌘K command palette across navigation, KPIs, dashboards, users, recent actions)
- [ ] `/activity` per-user/per-org timeline page
- [ ] i18n scaffolding: 4 starter locales (en-US, es, fr, ur-PK with RTL); `apps/web/src/i18n/dictionaries/`; `getDictionary()` + `<LocaleProvider>` + `useTranslations()` hook; locale picker on `/me`; layout sets `dir="rtl"` for ur-PK
- [ ] Status page at `/status` (also `status.kpinexus.app` via custom domain)
- [ ] Color-contrast token audit + axe-core enforcement (zero violations on top 10 pages)
- [ ] Bundle budget enforcement (track JS size per route, fail CI on regression)
- [ ] RSC streaming for dashboard route
- [ ] Route-level prefetch
- [ ] ARIA labels on all charts (extend the SeriesChart pattern to remaining)
- [ ] Custom domain UI at `/settings/custom-domain` with DNS TXT verification flow + last-checked-at + last-check-error diagnostics
- [ ] SSO config UI at `/settings/sso`
- [ ] SCIM token management at `/settings/scim`
- [ ] Retention UI at `/settings/retention` with per-entity policies + tier preset cards + run-now + schedule-daily

### Plugin sandbox hardening
- [ ] Plugin formula-fn isolated-vm sandbox (per-tenant 100ms/32MB limits)
- [ ] Plugin widget iframe sandbox (sandboxed src, message-passing API)
- [ ] Plugin permission scoping at execution time

### Tests
- [ ] SAML round-trip with Okta dev tenant
- [ ] SCIM Okta provisions user → User row appears with status=INVITED → admin completes → status=ACTIVE
- [ ] axe-core: 0 violations on top 10 pages (CI gate)
- [ ] k6 load test: 100 RPS sustained, p95 < 800ms
- [ ] GDPR export end-to-end < 30s
- [ ] OpenAPI Spectral lint passes; SDK regenerates cleanly
- [ ] Lighthouse Performance ≥ 90 on all top routes
- [ ] i18n: switch to ur-PK → layout flips to RTL → translated strings render

### Exit
- [ ] SAML round-trip green
- [ ] SCIM full provisioning works
- [ ] axe-core: 0 violations on 10 critical pages
- [ ] k6: 100 RPS sustained, p95 < 800ms
- [ ] GDPR export < 30s
- [ ] OpenAPI Spectral clean; SDK regen clean
- [ ] Lighthouse ≥ 90 all top routes
- [ ] Tag `git tag p9-complete` + `git tag v1.0.0`

---

## Frontend design handoff (post-P9, or interleaved at phase boundaries)

The frontend visual design is deferred to a "Claude Design" session per design spec §12. Once a phase's backend is stable, the design session can produce:
- [ ] `packages/ui/src/tokens.css` — final tokens light + dark
- [ ] `packages/ui/src/components/` — implemented primitives + composites with Storybook stories
- [ ] `apps/web/src/app/**/page.tsx` — final pages per route map
- [ ] Storybook component documentation
- [ ] Updated CLAUDE.md with design conventions adopted

This can happen incrementally — design + implement P1's auth pages before P2's KPI pages, etc. — or in one big handoff at the end.

---

## Always-on (every phase)

- [ ] CI green on every commit
- [ ] Cross-tenant fuzz suite extended with each new endpoint
- [ ] Dependency + secret + SAST scans on every PR
- [ ] Per-phase exit criteria block phase advancement
- [ ] Architectural decision changes update `docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md`
- [ ] Breaking deviations add an ADR (`docs/adrs/NNNN-<title>.md`)
