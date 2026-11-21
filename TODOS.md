# TODOS — KPI Nexus Final

Flat checklist across all 10 phases. Tick items as work lands. Each phase has a corresponding detailed plan in `docs/superpowers/plans/` — this file is the at-a-glance tracker.

For per-phase detail, see `ROADMAP.md` and the linked plan files.

---

## ✅ Status (reconciled 2026-05-31) — v1.0.0 shipped + gap-closure complete

All 10 phases **P0–P9 are implemented and tagged** (`p0-complete`..`p9-complete`, `v1.0.0`).
An independent completeness audit (2026-05-31) verified this against the actual code and
found that **this flat checklist had drifted** — many boxes below were left unticked even
though the work shipped. Treat the phase plans + the audit/gap-closure docs as the source of
truth, not the checkbox state below.

**Independent verification (2026-05-31):** automated suites green — API unit 1080, packages/ai
42, contracts 11, web unit 59, ML pytest 34; plus P2–P9 e2e suites. The critical per-user
scope invariant (`POST /kpis/:id/data` on a non-ORG_WIDE KPI → 422 with `correctEndpoint`)
is enforced live.

**Gap-closure (branch `chore/v1-gap-closure`, 2026-05-31):** the audit surfaced 18 deliverables
that were planned but never built; all 18 were closed (TDD + review). See
[`docs/superpowers/specs/2026-05-31-v1-gap-closure-design.md`](docs/superpowers/specs/2026-05-31-v1-gap-closure-design.md)
and [`docs/superpowers/plans/2026-05-31-v1-gap-closure.md`](docs/superpowers/plans/2026-05-31-v1-gap-closure.md).
Closed: frontend permission-gating layer (AppShell + `<PermissionGuard>`/`<RequirePermission>` +
filtered nav + gated buttons), OrgUnit reorganization (rename/move/merge/split + name history),
`/me/sessions`, ML `/seasonality` + NLQ auto-reembed, roles presets/hierarchy/apply/audit,
dashboards archive/restore/purge, `/status` + `/health/details`, in-app help drawer,
TimescaleDB continuous aggregates + policies, onboarding stale-draft cleanup cron, PDF
sparklines, P4 alerting integration specs, and the P1 settings pages
(`/settings/{branding,fiscal,password-policy,custom-domain}` + `/billing` + a `/settings` index).

**Confirmed deferred (post-v1)** — NOT gaps: Frontend "Claude Design" visual session; beta
hardening; Stripe/payment billing wiring; mobile + real-time collab; live SAML/OIDC IdP
handshake (JIT is built+tested); Lighthouse/k6/axe blocking CI gates + bundle budgets;
OpenAPI/Spectral + `packages/sdk`; plugin isolated-vm/iframe sandbox; ACM TLS automation;
P8 Postgres/MySQL connector runners; Turbo remote cache; Sentry wiring;
cloud-KMS data-key sourcing; admin impersonation.

**Accepted deviations (documented, not "fixed"):** NLQ golden set is 8/8 ≥80% (not 20/18);
notification adapters live in one `notification-adapters.service.ts` (not 6 files).

**Known minor issues (non-blocking):** ~21 pre-existing web files reference a `text-status-positive`
Tailwind class that isn't defined in the UI preset (silent no-op; use `text-status-success`); the
live-API integration suite (`test:int`) has a few specs that are flaky under full-suite parallel
load (pass in isolation).

---

## Reconciled a third time (2026-11-16) — every box says what is true (DOC-007)

Every phase box below is now either ticked, with the evidence after it (the spec, page or file that shows it, and whether a test proves it in hosted CI), or unticked with the reason after it:

- *partly*: built differently or only in part; the note says what exists.
- *not built*: nothing exists for it.
- *not verified*: built, but the measurement or live check the box asks for (a benchmark, a week of runs, a real Slack / Okta tenant) has never been run.
- *deferred* / *won't do*: a decision, with its reason (post-v1, or ADR-001's free hosting).
- *not followed*: a process rule that was not kept.

"Done at unit level" means a unit test proves the logic, but nothing ran it on a real clock or against a real third party. Hosted CI runs the integration suite (live API, RLS enforced) and the browser suite on every PR. Only the ML-dependent AI-analytics specs and the opt-in audit crawler skip there.

Tally: 390 ticked, 60 unticked (57 explained by the notes below, plus the two owner to-dos and AWS KMS above).

## Reconciled again (2026-11-13) — boxes ticked from code evidence

Boxes ticked in this pass were checked against the source: every model, module, route, file, function or queue an item names exists in `apps/`, `packages/`, `scripts/`, `infra/` or `.github/` (paths checked on disk), and phase-tag items match the existing `pN-complete` tags. Existence was checked, not completeness; the phase plans, audit and fix log remain the source of truth. Items built under a different name are ticked with a note saying where they live.

### Owner to-dos (need the project owner)
- [ ] **Windows launcher cold run (OT-017):** run `setupScripts/start.cmd` once on a Windows machine; watch whether `db:setup`'s 10 s Postgres probe is long enough on a first start.
- [ ] **Go live:** follow `docs/deploy.md` (Oracle Free Tier VM, DuckDNS, Brevo, Object Storage, GitHub secrets, first deploy, Vercel, then its *Check it* list incl. a backup-restore drill).

### Not built (remaining work)
- [x] **Web access-token refresh:** the web app now calls `POST /auth/refresh` on a 401 (one shared refresh, then the request is retried), so a signed-in user stays signed in past the 15-minute access-token expiry (FE-019).
- [x] **Scheduled connector runs:** an active connector with a schedule now runs on it (a 5-field cron, at most once a minute), as well as on `POST /connectors/:id/run` (BE-030).
- [x] **Onboarding co-pilot rail:** the wizard's slide-out rail now uses all four modes: Generate (per-section accept / reject), Assistant (JSON Patch previewed and accepted per section), Suggest (chips) and Explain (FE-020).
- [x] **Onboarding offline / resume / draft-status banners:** the wizard keeps a failed save, shows an offline banner with Retry, re-saves on reconnect, and won't finish with an unsaved edit; the resume banner has Start over (FE-021).
- [x] **NLQ tool loop:** up to 5 model calls with `get_metadata`, `get_kpi_history`, `query_timeseries` and `compare_kpis`, each reading through the scoped `listForKpi`; tool turns in every AI adapter (BE-033).
- [x] **Analytics reads ignore per-user point scope:** forecast, anomaly, what-if and seasonality now use only the points the caller may analyse; stored forecasts and anomalies are filtered the same way (BE-034).
- [x] **NLQ `forecast_kpi` tool** — through ForecastsService (visibility, ANALYTICS ceiling, point scope), not saved (BE-035).
- [x] **Data point corrections (`KPIDataPointHistory`):** `PATCH /kpis/:id/data/:pointId` (recorder or KPI_EDIT, reason required) keeps every correction; `GET …/history`; Correct + History on the KPI Data tab (BE-037).
- [x] **KPI saved views (`KPISavedView`):** `/kpi-saved-views` CRUD (owner-only changes, optional share with the org; filters only, so a shared view never widens what a viewer sees); Saved views bar on `/kpis` (FE-022).
- [x] **KPI watches (`KPIWatch`):** Watch on a KPI page for chosen events (new value, rule fired, anomaly confirmed, status change); a background job raises a personal, value-free notice per watcher, checked as that watcher (BE-038).
- [x] **KPI snapshots (`DataSnapshot`):** freeze a KPI's definition and the values you can read, with a reason (KPI_EDIT); visible to the taker and admins only; Snapshots on the KPI Audit tab (BE-039).
- [x] **`KPI.allowNegative` is enforced:** recording (any scope, bulk ingest) or correcting a negative value on a KPI that disallows it is 422 `NEGATIVE_NOT_ALLOWED` (BE-043).
- [x] **OpenAPI generation** and the **TypeScript SDK** (`packages/sdk/`): document built from the registered routes at `/api/v1/openapi.json` (request schemas via `@ApiBody`, not `nestjs-zod`), Spectral-linted, committed and checked in CI; SDK = `openapi-typescript` types + `openapi-fetch` (BE-040).
- [x] **Teams adaptive cards:** Teams alert notifications are an Adaptive Card 1.4 (severity colour, message, facts, Open in KPI Nexus), replacing the retired MessageCard (BE-041).
- [x] **Slack slash command `/kpi`:** `/kpi <name>`, `/kpi ask <question>`, `/kpi unlink`; a Slack user first links their KPI Nexus account through a private, signed, 10-minute link, and every answer runs as that account (BE-042).
- [x] **Shared UI component library with Storybook** in `packages/ui/src/components/`: the 20 primitives + Sparkline, a story for each (checked by a test), `pnpm --filter @kpi-nexus/ui storybook`; the web app imports them from `@kpi-nexus/ui` (FE-023).
- [ ] **Single sign-on (UI-014, plan 6.8) — on hold, to do later.** Hidden from Settings since 2026-11-20 (owner's decision); its page and API are kept. First write ADR-002: the spec names WorkOS, which charges for every company that connects, against free-forever hosting (ADR-001); the free route is OIDC with `openid-client`, then SAML with `@node-saml/node-saml`. Then build plan 6.8 and take `/settings/sso` out of `apps/web/src/lib/settings-on-hold.ts`.
- [ ] **Custom domains (UI-014, plan 6.9) — on hold, to do later.** Hidden from Settings since 2026-11-20 (owner's decision); its page and API are kept. First write ADR-003: each company's own address needs its own HTTPS certificate (Vercel can add domains on Hobby, or Caddy on the Oracle VM can issue them). Then build plan 6.9 and take `/settings/custom-domain` out of `apps/web/src/lib/settings-on-hold.ts`.
- [ ] **AWS KMS data keys** — *won't do while hosting must stay free*: KMS bills per key per month (ADR-001). `integration-crypto.ts` keeps a KMS-ready key-loading hook.

---

## P0 — Foundation (≈2 weeks)

### Infra
- [x] Initialize pnpm + Turborepo monorepo (`apps/{web,api,worker,ml}` + `packages/{contracts,db,ai,formula,ui,config}`)
- [x] Wire Turbo pipeline: `build`, `lint`, `typecheck`, `test`, `dev`, `db:generate`, `db:migrate`
- [x] `docker-compose.yml` with Postgres 16 + TimescaleDB + pgvector, Redis 7, MinIO, Mailhog, Jaeger
- [x] GitHub Actions: `ci.yml` matrix (lint/typecheck/test/build per app), Dependabot, gitleaks, CodeQL
- [ ] Turbo remote cache via Vercel free tier (deferred — optional, set TURBO_TOKEN + TURBO_TEAM later) — *deferred: `ci.yml` reads `TURBO_TOKEN` / `TURBO_TEAM`, but neither is set, so CI uses no remote cache*
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
- [ ] Sentry SDK client + server (deferred — pkg added in spec, wiring lands when SENTRY_DSN is set in P1) — *partly: the API initialises Sentry in `instrumentation.ts` (a no-op without `SENTRY_DSN`); the web app has no Sentry SDK*
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
- [x] `pnpm docker:up` → all 5 containers healthy
- [x] `pnpm db:setup` → green checks for postgres reachable + extensions enabled
- [x] `pnpm dev` → web on :3000, api on :4000, worker connected, ml on :8000 (`pnpm ml:install && pnpm ml:dev` separately) — *done: the Linux startup check (HANDOFF §5) booted web, api, the queue worker and ml together; the worker is now `dist/worker.js` built from `apps/api`*
- [x] `curl :4000/health` returns `{db: "ok", redis: "ok"}`
- [x] `curl :8000/health` returns `{ok: true}`
- [x] `pnpm --filter @kpi-nexus/web test:e2e` passes
- [x] CI green on a push (requires GitHub remote — `git remote add origin <url>`)
- [x] When all above pass: `git tag p0-complete`

---

## P1 — Identity, Tenancy, RBAC (≈4 weeks)

### Schema
- [x] Add: `Organization`, `CustomDomain`, `User`, `RefreshToken`, `EmailVerificationToken`, `PasswordResetToken`, `Session`, `LoginAttempt`, `PlatformAdmin`
- [x] Add: `RoleDefinition`, `RoleInheritance`, `Position`, `PermissionDelegation`, `ResourcePermission`
- [x] Add: `OrgUnitDimension`, `OrgUnitType`, `OrgUnit`, `OrgUnitMember`, `OrgUnitNameHistory`
- [x] Add: `AuditLog`, `Plan`, `TenantQuota`, `FeatureFlag`, `CostMetric`, `RetentionPolicy`
- [x] RLS policies on every tenant-scoped table — *done: FORCE RLS on every tenant table (OT-014); `rls-enforcement.spec.ts` checks the catalog for a table without RLS*
- [x] Prisma middleware sets `app.current_org` GUC at connection checkout

### Backend modules
- [x] `TenancyModule`: `RequestContextStore` (ALS) + `TenancyInterceptor`
- [x] `AuthModule`: login, register-org, refresh rotation with reuse-detection, multi-org lookup, org switching, accept-invitation
- [x] `PasswordModule`: reset request + confirm (1h expiry, single-use)
- [x] `MfaModule`: TOTP enroll/confirm/disable (RFC 6238, pure Node, recovery codes)
- [x] `PlatformAdminModule`: list + grant/revoke + bootstrap-if-empty guard (impersonation deferred) — built 2026-05-29
- [x] `OrganizationsModule`: CRUD, settings, terminology, fiscal calendar, lifecycle transitions, export
- [x] `CustomDomainModule`: DNS TXT verification flow (register/list/verify/delete) — built 2026-05-29
- [x] `UsersModule`: CRUD + invitation lifecycle + offboarding + GDPR export
- [x] `RbacModule`: 18-permission enum, `@RequirePermissions`/`@RequireAnyPermission`/`@OwnerOverride` decorators, `PermissionsGuard`, Redis 5-min cache + in-memory fallback
- [x] `RolesModule`: CRUD + multi-parent inheritance + 4 presets + audit timeline
- [x] `PositionsModule`: CRUD + industry presets
- [x] `PermissionDelegationsModule`: CRUD + BullMQ delayed auto-revoke at validTo
- [x] `ResourcePermissionsModule`: CRUD + `hasResourcePermission()` fast-path
- [x] `OrgUnitDimensionsModule`, `OrgUnitTypesModule` (dedicated CRUD + in-use guards, built 2026-05-29), `OrgUnitsModule` (+ reorganization: move/merge/split/rename)
- [x] `OrgChartModule`: read-side projection for SVG tree — *built into `OrgUnitsModule` (`GET /org-units` returns the tree) + the `/org-units` chart page*
- [x] `AuditModule`: structured events + redaction + interceptor + cross-tenant guard with `runWithBypass`
- [x] `BillingModule`: Plan catalog (FREE/PRO/ENTERPRISE lazy seed), quota enforcement (assertWithinQuota wired into KPI create — 402 on exceed), FeatureFlag gating, setPlan, GET /billing status (built 2026-05-29; cost-telemetry cron + UI still deferred)
- [x] `RateLimitModule`: Redis ZSET sliding window, 2 buckets (auth 10/60s by IP + general 600/60s by org), 429; env-gated APP_GUARD (RATE_LIMIT_ENABLED, off by default so tests/dev unaffected) — built 2026-05-29
- [x] `HealthModule`: `/health` + `/health/details`

### Frontend
- [x] App shell layout (sidebar + header) with permission-filtered nav — *done: `app-shell.tsx` (+ `app-shell.spec.tsx`), `e2e/permission-nav.spec.ts`*
- [x] Auth pages: `/login` (multi-org picker), `/register`, `/auth/password/reset`, `/auth/accept-invitation/[token]`, `/auth/mfa-required`, `/unauthorized` — *the MFA step is inline on `/login` (`MFA_REQUIRED` → code field), not a separate `/auth/mfa-required` page*
- [x] AuthContext with token + permissions + 5-min refresh — *refreshes on a 401 in `lib/api-client.ts` instead of on a timer (FE-019)*
- [x] Route guards: `<ProtectedRoute>`, `<RequirePermission>`, `<RequireAnyPermission>`, `<PermissionGuard>` — *done: `RequirePermission`, `RequireAnyPermission`, `PermissionGuard` in `components/auth/`; there is no `<ProtectedRoute>`: the AppShell sends signed-out users to `/login?next=` (FE-009)*
- [x] `/settings/organization`, `/settings/branding`, `/settings/custom-domain`, `/settings/locale`, `/settings/fiscal`, `/settings/terminology`, `/settings/password-policy`
- [x] `/users` table + create/edit sheet + invite + role/position assignment
- [x] `/users/[id]` detail + memberships + audit timeline + offboarding action
- [x] `/me/profile`, `/me/sessions`, `/me/mentions` (empty for now), `/me/preferences`, MFA enrollment
- [x] `/roles` list + matrix bulk editor + hierarchy SVG + presets page + audit timeline
- [x] `/positions` + presets page
- [x] `/org-units` tree + chart + dimensions + reorganize
- [x] `/audit` log viewer with filters + JSON change diff
- [x] `/billing` placeholder page (plan card + usage bars + "Upgrade" → modal)
- [x] `/admin/impersonate` page (UUID-paste start form + persistent amber banner)
- [x] `/status` health page
- [ ] Custom-terminology rendering driven by org settings (30s in-memory cache, smart pluralization) — *partly: org terminology with smart pluralization (`terminology-context.tsx`, `nav-terminology.ts`, `e2e/settings-flow.spec.ts`); no 30 s client cache*
- [x] Basic onboarding wizard stub at `/signup/wizard` (5 routes, no AI, no templates — full version in P6)

### Tests
- [x] AuthService unit ≥95% coverage
- [x] RBAC guard truth-table for all 18 permissions × 4 default roles — *done: `default-roles.spec.ts`, now 25 permissions × 4 roles = 100 cases*
- [x] Cross-tenant fuzz harness over 8+ resources × 4 verbs (GET/PATCH/DELETE/LIST) — *done, narrower than planned: `cross-tenant.fuzz.spec.ts` covers 5 resource types (users, roles, positions, org-units, organization) × GET / LIST / PATCH / DELETE; KPIs, data points and reports have cross-tenant cases in their own integration specs*
- [x] e2e UC-01 (Login & Auth), UC-02 (Manage Roles), UC-11 (Org Settings) — *done: `auth-flow.spec.ts` (UC-01), `roles-flow.spec.ts` (UC-02), `settings-flow.spec.ts` (UC-11)*
- [ ] Full happy-path e2e: register → wizard skip → invite user → role gating → audit visible — *partly: covered in pieces, not one spec: `audit-flow.spec.ts` (register → invite → audit entry visible), `permission-nav.spec.ts` (role gating)*
- [x] Refresh-token reuse-detection test: presenting revoked-but-not-replaced token kills chain — *done: `test/integration/refresh-token.spec.ts`*
- [x] **12-case visibility helper unit test (3 scopes × 4 default roles) — required for spec §6 compliance** — *done: `kpi-visibility.spec.ts` (the 12-case matrix plus boundary cases)*

### Exit
- [x] Cross-tenant fuzz green on all P1 endpoints — *done: green in hosted CI on every PR (live API, RLS enforced)*
- [x] e2e UC-01/02/11 pass — *done: in the hosted web-e2e job*
- [ ] Full happy-path e2e pass — *partly: see the happy-path item above*
- [x] MFA TOTP enroll → login works — *done: `test/integration/mfa-flow.spec.ts` (enroll → confirm → login gated → recovery code → disable)*
- [x] Postgres RLS enforces on every tenant-scoped table (pen-test pass) — *done: `rls-enforcement.spec.ts` (cross-tenant read / insert / update, the hypertable, role bypass attributes, catalog check) and the audit's 301-step cross-tenant `api-crud.mjs` run (OT-014)*
- [x] Tag `git tag p1-complete`

---

## P2 — KPI Engine + Data Layer (≈5 weeks)

### Schema
- [x] `KPICategory`, `KPI` (with scope enum ORG_WIDE/PER_UNIT/PER_USER), `KPIVersion`, `KPIDependency`, `FormulaExpression`
- [x] `KPITarget` (6 types), `KPIThresholdBand`, `KPIBenchmark`, `KPICascade` — *done: all four models; `KPITargetType` has the six types*
- [x] `KPIDataPoint` (TimescaleDB hypertable target), `KPIDataPointHistory`, `KPIWatch`, `KPISavedView`, `KPITemplate` — *done: all six models; `KPIDataPoint` is a hypertable (`sql/hypertables.sql`)*
- [x] `LineageEdge`, `DataSnapshot` — *done*
- [x] `UserKPIAssignment`, `OrgUnitKPIAssignment` (with `inherited` boolean) — *built as `KPIAssignmentUser` / `KPIAssignmentOrgUnit` (with `inherited`)*
- [x] Convert `KPIDataPoint` to TimescaleDB hypertable partitioned by week
- [x] 5 continuous aggregates (hourly/daily/weekly/monthly/quarterly) — *done: `sql/continuous-aggregates.sql`, applied by `db:setup` / `db:release`*
- [x] Auto-refresh policy every 30 min — *done: `schedule_interval => 30 minutes` on each aggregate*
- [x] Compression policy after 90 days — *done: `add_compression_policy(… 90 days)` on each aggregate*

### Packages
- [x] `packages/formula/`: parser + AST + serializer + isolated-vm evaluator (100ms timeout, 32MB memory, allow-listed functions)
- [x] `packages/formula/`: DAG resolver + topological sort + cycle detection
- [x] 50+ formula unit tests including sandbox escape attempts — *done: 68 tests in `apps/api/src/formula/formula.spec.ts`; the evaluator is a hand-written parser that executes no JS*

### Backend modules
- [x] `KpiCategoriesModule`: CRUD
- [x] `KpisModule`: CRUD with version snapshots, status lifecycle (DRAFT→PROPOSED→APPROVED→ACTIVE→PAUSED→DEPRECATED→ARCHIVED), deprecation chain, soft-delete + 30-day restore, sample-data seed, bulk CSV import
- [x] `KpiTemplatesModule`: curated catalog + relevance scoring + org-private + marketplace + instantiation
- [x] `FormulaModule`: validate + attach/detach + dependency wiring
- [x] `CalculationEngineModule`: BullMQ queue `calc-engine` + processor wired to FormulaEvaluator + KpiCascadeService + LineageService
- [x] `DataPointsModule`: single + bulk insert with idempotency, validation, outlier flag (Welford streaming 3σ), adjust with history — *built as `KpiDataService` in the KPIs module*
- [x] **Critical: `POST /kpis/:id/data` returns HTTP 422 if KPI scope ≠ ORG_WIDE with correct endpoint name in error**
- [x] `KpiTargetsModule`: 6 target types (STATIC/TIERED/DYNAMIC/TIME_VARYING/CONDITIONAL/SCENARIO) + `resolveActive(kpiId, at)`
- [x] `KpiThresholdBandsModule`: N-band thresholds + hysteresis (`consecutivePointsRequired`)
- [x] `KpiBenchmarksModule`: internal (auto-computed N-day average) + external (industry) + compute trigger
- [x] `KpiCascadesModule`: parent↔child with weight + rollupMethod + cycle detection
- [x] `LineageModule`: record + BFS trace upstream/downstream
- [x] `UserKpisModule`: per-user assignments + personal data entry via `POST /user-kpis/my-kpis/:assignmentId/data`
- [x] `OrgUnitKpisModule`: per-unit assignments + inheritance to descendants

### Frontend
- [x] `/kpis` catalog with table + grid toggle + filters (category/scope/status/owner/quadrant/search) + bulk actions
- [x] `/kpis/new` 3-panel form (basics/measurement/assignment)
- [x] `/kpis/[id]` detail page with tabs (Overview/Data/Formula/Cascade/Targets/Thresholds/Benchmarks/Lineage/Audit) — *done: the nine tabs in `app/kpis/[id]/page.tsx`; `e2e/kpi-detail.spec.ts`*
- [x] `/kpis/[id]/data` entry form (scope-aware — posts to correct endpoint) + recent points
- [x] `/kpis/[id]/formula` visual block editor + Monaco code mode + dependency graph
- [x] `/kpis/[id]/cascade` parents above, children below, weight + rollup editor
- [x] `/kpis/[id]/targets` type tab strip + per-type fields + history
- [x] `/kpis/[id]/threshold-bands` N-band editor + status preview
- [ ] `/kpis/[id]/benchmarks` 1D scale chart + manual add + auto-compute — *partly: Benchmarks is a tab on the KPI page with manual add and Auto-compute (30 d); it lists benchmarks, with no 1-D scale chart*
- [x] `/kpis/[id]/lineage` SVG graph (depth-1 upstream left, downstream right) + BFS trace lists
- [x] `/kpis/tree` global cascade tree (color-coded by quadrant)
- [x] `/kpis/scorecard` 2×2 BSC quadrant grid
- [x] `/kpis/templates` marketplace browse + instantiate
- [x] `/kpis/import` CSV upload → preview → column map → dry-run + commit
- [x] `/kpis/archive` soft-deleted with restore/purge
- [ ] Home page "My KPIs" panel listing PER_USER assignments with inline value entry — *partly: the dashboard has a My KPIs card that links to `/my-kpis`, where values are recorded inline (`e2e/user-kpi-views.spec.ts`)*
- [x] `/team` (manager view) showing direct reports' PER_USER KPIs side-by-side
- [x] `/users/[id]` per-user KPI panel

### Tests
- [x] `scripts/bench-hypertable.mjs` seeds N KPIs × D days, benchmarks 3 query patterns with p50/p95/p99 (configurable; auto-cleanup) — built 2026-05-29
- [x] Cascade weighted-avg correctness on parent recompute (6+ tests covering SUM/AVG/WEIGHTED_AVG/MIN/MAX/CUSTOM_FORMULA) — *done: 24 tests in `cascade.service.spec.ts` covering all six methods*
- [x] e2e UC-03 (Configure KPIs), UC-04 (Record KPI Data Point) — *done: `kpis-flow.spec.ts`, `kpi-detail.spec.ts` (UC-03); inline entry in `kpis-flow.spec.ts` and `user-kpi-views.spec.ts` (UC-04)*
- [x] **PER_USER cross-user isolation test: user A records data, user B cannot see it via any endpoint** — *done: `kpi-data-scope.spec.ts` "§6 critical: PER_USER cross-user isolation" (integration, live API)*
- [x] **Scope enforcement test: POST /kpis/:id/data with PER_USER KPI returns 422** — *done: `kpi-data-scope.spec.ts` (422 with `correctEndpoint`)*
- [x] **Visibility helper exhaustive test: 12 cases (3 scopes × 4 default roles)** — *done: `kpi-visibility.spec.ts`*

### Exit
- [ ] Dashboard summary endpoint <100ms p95 with 1000 KPIs × 365-day history — *not verified: `scripts/bench-hypertable.mjs` (defaults 1000 × 365, p95 budget 100 ms) exists, but no full run is recorded; CI runs a 20 × 30 smoke under 500 ms (`kpi-dashboard-summary.spec.ts`)*
- [x] Formula evaluator passes 50+ tests inc. sandbox escapes (process/require/global/eval/setTimeout/__proto__/fs/this/infinite-loop) — *done: see the formula tests above*
- [x] Cascade rollup correct: parent = weighted avg of N children, recomputes on child change — *done: `cascade.service.spec.ts`*
- [x] e2e UC-03/04 pass — *done: in the hosted web-e2e job*
- [x] PER_USER scope isolation tests pass — *done: in the hosted integration job*
- [x] Tag `git tag p2-complete`

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
- [x] Optimistic-concurrency 3-way diff dialog on dashboard edit (backend 412 + FE conflict dialog built; e2e dashboard-conflict.spec.ts green) — reconciled 2026-05-29 (was stale)

### Tests
- [x] e2e UC-05 (Real-Time Dashboard), UC-09 (Generate Reports), UC-10 (Export Reports) — Playwright, 13 specs green vs live stack
- [x] SSE propagation: data point insert → SSE stream receives `data_point_added` (live curl smoke + e2e two-tab)
- [x] Scheduled report end-to-end (trigger → file in MinIO → Mailhog inbox; integration test)
- [x] Lighthouse Performance ≥90 — measured 97 on `/share/[token]` (prod build) — reconciled 2026-05-29

### Exit
- [x] 12-widget dashboard renders <3s p95 — measured 706ms p95 (prod build, 12 widgets); 1000-KPI scale noted as a caveat — reconciled 2026-05-29
- [x] SSE: data point insert reflected across clients (live-verified; e2e two-tab)
- [x] Scheduled report cron triggers + emails delivered within 30s (integration-verified)
- [x] Lighthouse Performance ≥90 on dashboard — 97 measured — reconciled 2026-05-29
- [x] Tag `git tag p3-complete` — tag exists in repo

---

## P4 — Alerting (≈3 weeks)

### Schema
- [x] `AlertRule`, `EscalationRule`, `Alert`
- [x] `NotificationChannel`, `NotificationDelivery`
- [x] `WebhookSubscription`, `ApiKey` (used by webhook signing + ingest)

### Backend modules
- [x] `AlertRulesModule`: rule CRUD with 5 types (STATIC_THRESHOLD/DYNAMIC_STDDEV/RATE_OF_CHANGE/NO_DATA/COMPOSITE), severity, escalation editor
- [x] `AlertEngineModule`: BullMQ queue `alert-eval`, post-data-point auto-enqueue, evaluator
- [x] `EscalationsModule`: delayed BullMQ jobs per level with deterministic jobId `escalate:{alertId}:lvl{n}`, abort-if-not-OPEN — *jobId is `escalate-{alertId}-lvl{n}` (BullMQ rejects `:` in custom job IDs)*
- [x] `NotificationChannelsModule`: per-org channels (6 kinds: EMAIL/SLACK/TEAMS/SMS/IN_APP/WEBHOOK) + test-send
- [x] `NotificationsModule`: dispatcher + per-kind adapters (Resend/Slack webhook/Teams webhook/Twilio/IN_APP ack/HMAC webhook)
- [x] Notification retry queue with exponential backoff (30s → 5min → 30min, max 3 attempts) + DLQ — *done: `RETRY_BACKOFF_MS` in `notification-dispatcher.service.ts` (+ spec); failed deliveries stay FAILED for the DLQ view*
- [x] DLQ admin endpoints: `GET /notification-deliveries?status=FAILED`, `POST /notification-deliveries/:id/retry`
- [x] Per-user dedup window via `cooldownMinutes` config on rule
- [x] Digest mode: 60s BullMQ batching collator + `alert_digest` realtime event
- [x] `WebhooksModule`: outbound subscription CRUD + HMAC-SHA256 signing + secret rotation
- [x] `ApiKeysModule`: mint `kpinx_<base64url(24)>` plaintext once + SHA-256 hash + 12-char prefix + scopes + JwtAuthGuard short-circuit

### Frontend
- [x] `/alerts` list with severity/status/category filters + search + manual scan + bulk acknowledge
- [x] `/alerts/new` rule basics + structured condition tree (5 rule types) + escalation editor
- [x] `/alerts/[id]` detail with related KPI chart + recommendation panel (stubbed until P5) + comments + ack/snooze
- [x] `/alerts/channels` channel CRUD + test-send
- [ ] `<EscalationBuilder>` client component with dynamic levels (delayMinutes + channels + notify roles/users + up/down/remove) — *partly: `/alerts/new` adds, edits and removes levels (delay, channels); no picker for notify roles / users and no move up / down*
- [x] `/settings/notifications` per-user prefs (digest mode + mute hours)
- [x] DLQ admin view (filter status=FAILED + manual retry) — *done: `/settings/notifications/dlq` (FAILED deliveries, Retry)*

### Tests
- [ ] Alert latency benchmark: data point inserted → alert visible <10s p95 — *not verified: `alerting.spec.ts` checks breach → alert end to end with a bounded poll, but no p95 latency is measured*
- [x] Escalation level 2 fires after configured delay if not acknowledged — *done at unit level: `escalation.processor.spec.ts` (the next level is enqueued with its delay; acknowledged alerts are not escalated); not run on a wall clock*
- [x] Notification retry survives 5xx (eventual delivery within 30 min) — *done at unit level: `notification-dispatcher.service.spec.ts`*
- [x] Digest mode: 5 alerts within 60s → single email — *done at unit level: `notification-digest.service.spec.ts`*
- [ ] Cross-channel test: alert fans out to EMAIL + SLACK + IN_APP simultaneously — *not built: no test sends one alert to EMAIL, SLACK and IN_APP channels together*
- [x] Webhook signature verify test (constant-time + 5-min replay window) — *done: `webhooks-signing.spec.ts` (tolerance window, constant-time compare)*

### Exit
- [ ] Alert latency <10s p95 — *not verified: no latency measurement (see above)*
- [ ] Escalation chain works end-to-end — *not verified live: level 0 runs end to end in `alerting.spec.ts`; later levels only in unit tests*
- [ ] Retry survives provider 5xx — *not verified live: unit tests only*
- [ ] Digest collates within 60s window — *not verified live: unit tests only*
- [x] Tag `git tag p4-complete`

---

## P5 — AI Layer (≈5 weeks)

### Schema
- [x] `AnomalyDetection`, `Forecast` (with `ForecastModelKind` enum), `KPIInsight`, `Recommendation`
- [x] `NLQQuery` (with per-provider embedding columns: `embedding_openai vector(1536)?`, `embedding_gemini vector(768)?`, `embedding_voyage vector(1024)?`)
- [x] `KpiCatalogEmbedding` (with per-provider columns; `@@unique([kpiId, providerKey])`)
- [x] `AiProvider`, `AiFeatureConfig`, `AiCallLog`, `AiBudget`
- [x] `Workflow` (for non-alert automation; engine wiring in P7)

### Packages
- [x] `packages/ai/src/types.ts`: `IAiProvider` interface + normalized request/result/chunk shapes
- [x] `packages/ai/src/providers/claude.ts`: Anthropic Messages API + `cache_control: ephemeral` + tool_use translation + SSE
- [x] `packages/ai/src/providers/gemini.ts`: `:generateContent` + `:streamGenerateContent` + 8-key rotation + functionCall normalization
- [x] `packages/ai/src/providers/openai.ts`: chat completions + tools + embeddings + cached_tokens capture
- [x] `packages/ai/src/providers/ollama.ts`: `/api/chat` + `/api/embeddings` (cost=$0)
- [x] `packages/ai/src/pricing.ts`: per-provider price table

### Backend modules
- [x] `AiModule` (core): `AiProviderRegistry` + `AiRouter` + `AiBudgetService` + `AiCallLogService` + 11-feature catalog + `DEFAULT_FYP_CONFIG`
- [x] `AiRouter`: resolves `(orgId, feature) → (providerId, model)` from `AiFeatureConfig`; fallback chain on rate-limit/5xx/budget
- [x] `AiBudgetService`: per-org daily/monthly Redis counters with DB persistence; circuit breaker FAIL_CLOSED or FALLBACK; lazy rollover
- [x] `AiCallLogService`: every call → AiCallLog with provider/model/tokens/cost/latency/status; cost via `priceCall()` — *done: `ai-call-log.service.ts`; the router prices each call with `priceCall()`*
- [x] BYO-key flow in `apps/api/src/ai/byo/`: AES-256-GCM encryption + per-deploy master secret + validate via test ping + persist + invalidate cache
- [x] Prompt caching on Claude (`cache_control: ephemeral` on system prompts + KPI catalogs)
- [x] `AnomalyDetectionModule`: routes to ML `/anomaly/detect`; confirm-triggers-alert + confirm-triggers-recommendation on false→true transition — *built as `AnomalyService` in `AnalyticsModule`*
- [x] `ForecastsModule`: routes to ML `/forecast`; yhat + 80%/95% bands + fit metrics — *built as the forecasts service in `AnalyticsModule`*
- [x] `WhatIfModule`: routes to ML `/whatif` — *built as `WhatIfService` in `AnalyticsModule`*
- [x] `KpiSuggestionsModule`: AI-suggested KPIs from org profile + existing catalog
- [x] `InsightsModule`: scheduled cron `30 2 * * *` UTC + on-demand + batch endpoints; Claude haiku narratives
- [x] `RecommendationsModule`: alert-triggered (auto) + anomaly-confirm-triggered (auto) + manual; structured JSON output; status flow PENDING→ACTIONED/DISMISSED
- [x] `NlqModule`: embed → pgvector cosine search → Claude tool-use loop (max 5 rounds) with 5 tools (`query_timeseries`, `compare_kpis`, `get_metadata`, `forecast_kpi`, `get_kpi_history`); visibility-aware tool calls — *done (BE-033, BE-035): the five tools and up to 5 model calls work through every provider adapter, not only Claude*
- [x] Auto-reembed on KPI create/update (name/description/tags/unit change) — *done: `kpis.service.ts` enqueues a re-embed on create and on relevant updates*
- [x] Background `nlq-reembed` BullMQ queue + processor when org switches embedding provider (chunked, idempotent via deterministic jobId)

### ML sidecar
- [x] `POST /anomaly/detect`: IsolationForest + Z-score + EWMA ensemble; configurable per-detector knobs
- [x] `POST /forecast`: Prophet / ARIMA / naive; yhat + 80%/95% bands + rmse/mape fit metrics (OT-005). The requested model runs, with naive as the reported fallback; no AIC in the response
- [x] `POST /whatif`: parameterized scenario simulator (additive/multiplicative + floor/ceiling clamps)
- [x] `POST /correlation`: pairwise + matrix via scipy.stats
- [x] `POST /seasonality`: statsmodels.tsa.seasonal_decompose
- [x] HMAC auth (X-Tenant-Id + X-Signature-Timestamp + X-Signature SHA256 of `${ts}.${orgId}` keyed by `ML_SIDECAR_HMAC_SECRET`); constant-time verify; 5-min skew; refuses placeholder dev secret in production — *signed in `ml/ml-client.service.ts`, verified by `apps/ml/app/middleware/hmac_auth.py`*

### Frontend
- [x] `/settings/ai` per-feature dropdown (provider + model) + budget caps + cost dashboard + last-7d call counts per provider
- [x] BYO-key paste-and-validate flow — *done: `POST /ai/providers/:key/byok` stores the key and pings the provider; paste field on `/settings/ai`*
- [x] `/ask` NLQ chat page: client component POST to `/api/nlq/ask` proxy; renders answer + sources + chart preview + provider/model/cost footer
- [x] `/insights` server-rendered list of KPIInsight with KPI link + narrative + "Generate insights" Server Action
- [x] `/recommendations` panel with status badges + priority-coded actions + root-cause hypotheses + confidence + status flip buttons
- [x] `/kpis/[id]/anomalies` series chart with confidence bands + anomaly markers + threshold knob + persist toggle + live vs saved tables
- [x] `/kpis/[id]/forecast` model + horizon controls + prediction chart with bands + fit-metric tiles
- [x] `/kpis/[id]/whatif` upstream-dep sliders + mechanic toggle + baseline vs scenario charts + aggregate lift tiles
- [x] AI confidence indicators throughout (badges, footers) — *done: confidence on insights, recommendations, forecasts and the dashboard*

### Tests
- [x] Claude cost guard test: budget exceeded throws AiBudgetExceededError correctly at boundaries
- [x] AiRouter fallback test: primary fails → fallback called → success
- [ ] NLQ golden question harness: 20 hand-crafted Q&A; goal 18/20 correct — *partly, accepted deviation: 8 golden questions with an 80 % target (`nlq/acceptance/`, `scripts/nlq-golden.mjs`)*
- [ ] Anomaly F1 ≥0.7 on synthetic seasonal+spike test set — *not built: no F1 test; the anomaly tests check behaviour, not a score*
- [ ] Forecast MAPE ≤15% at 90-day horizon on test KPIs — *not built: forecasts report in-sample MAPE (`fitMetrics`), but no test checks a 90-day hold-out against 15 %*
- [x] e2e UC-06 (Predictive Analytics), UC-07 (Detect Anomalies), UC-08 (Alerts & Recommendations) — *done: `ai-analytics.spec.ts` / `ai-analytics-ui.spec.ts` (UC-06/07; they need the ML sidecar, so hosted CI skips them; they passed in the 2026-11-05 local run with ML), `uc-alerts.spec.ts`, `ai-recommendations.spec.ts` (UC-08)*
- [x] **NLQ visibility test: viewer asking about restricted PER_USER data — must refuse or show only visible** — *done: `nlq.tools.spec.ts` (hidden KPIs are "not found" and no data is read); BE-032, BE-034*

### Exit
- [x] Per-org Claude spend <$1/day with default settings — *done by construction: the default budget caps each org at $1 a day (`AiBudget.dailyCapUsd @default(1.0)`, `ai-budget-policy.ts`), and the default provider is Gemini's free tier*
- [x] Provider failover works (kill Claude → falls back to Gemini → response returns) — *done: `ai-router.service.spec.ts` (failover, FAIL_CLOSED vs FALLBACK); BE-026, AI-003*
- [ ] NLQ 18/20 golden questions correct — *partly: see the golden harness item above*
- [ ] Anomaly F1 ≥0.7 — *not built: see above*
- [ ] Forecast MAPE ≤15% at 90-day — *not built: see above*
- [ ] Alert latency still <10s (no regression) — *not verified: see P4*
- [x] Tag `git tag p5-complete`

---

## P6 — Onboarding 2.0 + AI Co-pilot (≈3 weeks)

### Schema
- [x] Extend `OnboardingSession` with `userId?`, `userEmail`, `lastEditedStep`, `entryMode` (quick/full/template:slug)
- [x] `OnboardingAIInteraction` (mode/prompt/response/applied/edited/tokens/latency) — *done*
- [x] `OrgTemplate` (tier: rich/starter/legacy)
- [x] `OnboardingTask` (14 default keys: domain_verification, sso, mfa, data_source, channels, historical_import, default_dashboard, scheduled_report, ai_tuning, remaining_invites, okrs, escalation, custom_domain, compliance_review)

### Backend modules
- [x] `OnboardingModule` extended: auto-save on every field change, resumable, per-step sample-data seed, per-step advanced expand, materialization transaction
- [x] `OnboardingAiModule` 4 modes: `generator` (full org from prompt), `assistant` (RFC 6902 patch), `suggest` (chips), `explain` (Q&A)
- [x] AIDiffPreview gate — every output reviewed before applied; logged to OnboardingAIInteraction — *done: the co-pilot rail previews each section and applies only what is accepted; the interaction row records the applied sections (FE-020)*
- [x] Per-mode rate limits (generator 5/hr, assistant 30/hr, suggest 60/hr, explain 100/hr per session) — *done: `onboarding-ai-limits.ts` (+ `onboarding-ai.pure.spec.ts`)*
- [x] `OrgTemplatesModule`: tiered templates; rich SaaS-Startup template seeded from original-app `seed.ts`; starter templates per industry
- [x] `SetupChecklistModule`: 14 default tasks, lazy upsert, status flow pending/complete/dismissed

### Frontend
- [x] `/signup/wizard` 3-pane shell (step sidebar | content | AI co-pilot rail)
- [x] Entry splash with 3 cards: Quick start / Full setup / Template gallery — *done: `/signup`*
- [ ] 5 step routes: organization, structure, roles, KPIs, team — *partly: one wizard page (`/signup/wizard`) with Organization and Review sections; structure, roles, KPIs and team come from a template or the co-pilot, not from separate step routes*
- [ ] Per-step advanced expand-to-reveal sections (matching original seed.ts depth) — *not built: the depth comes from the rich template or the co-pilot, not per-step forms*
- [x] AI co-pilot rail: thread + composer + AIDiffPreview modal + SuggestChip inline — *`components/onboarding/ai-copilot-rail.tsx`; the diff preview is inline in the thread, not a modal; per-section accept / reject (no in-place edit)*
- [x] DraftSyncProvider with 600ms debounced backend sync + instant localStorage cache
- [x] OfflineBanner + ResumeBanner + DraftStatusBadge — *`components/onboarding/draft-sync-ui.tsx` + `lib/draft-sync.ts`; ResumeBanner was already on `/signup`, now with Start over*
- [ ] Keyboard shortcuts: Ctrl+Enter (save & continue), Esc (close rail/diff) — *partly: Esc closes the co-pilot rail; no Ctrl+Enter*
- [x] `<TemplateGallery>` with rich + starter previews + apply — *done: the template gallery on `/signup` lists and applies templates (`e2e/onboarding-wizard.spec.ts`)*
- [x] Post-onboarding `/setup-checklist` page with progress bar + pending tasks + collapsed completed group
- [x] Onboarding tour (first-login tooltips, 5 slides) — flag stored on User.notificationSettings — *done: `onboarding-tour.tsx` (5 slides); the flag is kept in localStorage, not `User.notificationSettings`*

### Tests
- [x] Full happy-path e2e: enter org details → AI generates full org → review diff → apply → complete onboarding → setup checklist appears — *done in two tests of `onboarding-wizard.spec.ts`: "AI co-pilot generate populates a draft" (generate → diff → apply) and "template gallery → apply rich → complete → dashboard + checklist"*
- [ ] AI generator test: prompt "B2B SaaS startup, 50 employees" → returns valid org JSON with ≥5 roles + ≥3 unit types + ≥5 KPIs — *partly: `onboarding-ai.spec.ts` sends that prompt and checks ≥ 3 roles and ≥ 3 KPIs; in CI the AI answer is the canned fixture*
- [x] Draft survives browser crash: write to draft → kill browser → reload → state restored from localStorage — *done: `onboarding-wizard.spec.ts` "draft survives a reload" plus the offline / retry cases (FE-021); a reload, not a killed browser*
- [x] Rate-limit test: 6th generator call within 1h returns 429 — *done: `onboarding-ai.spec.ts` "6th call → 429"*

### Exit
- [x] A new admin can reproduce the full original-app seed.ts demo org (10 roles, 14 positions, 11 units, 20 KPIs, 5 categories) in a single onboarding session — *done: `onboarding.spec.ts` "template → complete reproduces seed.ts depth (10/14/11/20/5)"*
- [ ] AI generator returns reasonable org JSON in <30s — *not verified: the e2e allows 35 s against the canned answer; the real-Gemini check (HANDOFF §6 step 4) showed generation works but recorded no time*
- [x] Draft survives browser crash — *done: see above*
- [x] 14-task setup checklist appears on home page after onboarding — *done: `setup-checklist.spec.ts`, `onboarding-wizard.spec.ts`*
- [x] Tag `git tag p6-complete`

---

## P7 — Collaboration & Workflow (≈4 weeks)

### Schema
- [x] `Task` (with TaskStatus + TaskPriority enums + 3 indexes)
- [x] `Comment` (with parentCommentId for threading + mentionedUserIds + deletedAt soft-delete)
- [x] `Mention` (per-recipient inbox row)
- [x] `Objective` (with ObjectiveStatus enum + parentObjectiveId self-FK + progress)
- [x] `KeyResult` (with kpiId? FK + baseline/target/current + weight + progress)
- [x] `ApprovalWorkflow` (with ApprovalEntityType enum + requiredApproverRoleIds[] + requireAll)
- [x] `ApprovalRequest` (with ApprovalRequestStatus enum + decisions Json + proposedPayload Json)

### Backend modules
- [x] `TasksModule`: CRUD + status flow (TODO/IN_PROGRESS/BLOCKED/DONE/CANCELLED) + KPI/alert links + audit
- [x] `CommentsModule`: threaded on KPI/Dashboard/Alert/Task + soft-delete + author-only edit/delete + mention support
- [x] `MentionsModule`: per-recipient inbox; created in same transaction as comment; self-mentions stripped — *built as `mentions.service.ts` in the comments module*
- [x] `OkrsModule`: Objectives + KeyResults + KPI-linked auto-progress + weighted rollup + parent objective alignment + cycle guard (depth 10)
- [x] OKR progress math (`keyResultProgress`, `objectiveProgress`) covering all 4 KR shape variants + weighted average + zero-weight fallback
- [x] `syncFromLinkedKpis()` pulls latest KPI data point into linked KRs
- [x] `ApprovalsModule`: workflows + requests + `resolveStatus()` decision logic + self-approval blocked + duplicate decisions blocked
- [x] `requireApprovalIfActive(entityType, entityId, payload)` seam — wired into KpisService.update + KpiTargetsService.create/update + RolesService.update
- [x] `ApprovalApplyService` replays approved patches (uses bypassApproval flag)
- [x] `WorkflowsModule`: generic rule engine (kpi_changed/schedule/alert/manual triggers; value-condition filters with 6 operators; create_task/post_webhook/send_notification actions); wired into DataPointsService.create

### Frontend
- [x] `/tasks` kanban board (5 columns) with HTML5 drag-drop + quick-create + optimistic UI + per-card delete
- [ ] `<CommentsDrawer entityType entityId />` 380px slide-out anchored to right; trigger as 💬 pill in page header; mounted on KPI/Dashboard/Alert detail pages — *partly: the 380 px drawer is on the KPI, OKR and task pages, not on dashboards or alerts*
- [ ] `<CommentsPanel>` inline at page bottom (complementary layout) — *not built: the drawer is the only comments UI*
- [x] `/me/mentions` inbox with mark-read actions
- [x] `/okrs` grid of objective cards (progress bars + status badges)
- [x] `/okrs/new` form (name/description/owner/parent/period)
- [x] `/okrs/[id]` overall progress meter + KR cards (inline currentValue edit + delete + add-KR + status dropdown + sync-from-linked-KPIs button + aligned children list)
- [x] `/approvals` Pending/Resolved split with per-request decision buttons + comment field + cancel button
- [x] `/approvals/workflows` per-entity-type config (approver roles + requireAll + active toggle)
- [x] `/workflows` rule engine editor (trigger picker + condition builder + action selector)

### Tests
- [x] OKR progress aggregation correctness (13+ tests): higher-is-better, lower-is-better, no-baseline, baseline==target; weighted avg + zero-weight fallback; parent rollup with cycle guard — *done: 16 tests in `progress-math.spec.ts`*
- [x] Approval flow test: KPI update with active workflow → throws 202 with requestId → approver approves → patch is replayed via ApprovalApplyService
- [x] Workflow rule engine test: kpi_changed event triggers task creation via rule engine — *done: `p7-collaboration.spec.ts` "a kpi_changed event auto-creates a task"*
- [x] Mention test: comment with @mention creates Mention row in same transaction; self-mentions stripped — *done: `comments.service.spec.ts` (one transaction, rollback, self-mention stripped)*

### Exit
- [x] OKR objective with mixed KR types aggregates correctly — *done: `p7-collaboration.spec.ts` (weighted progress), `progress-math.spec.ts`*
- [x] Approval workflow round-trip works — *done: `p7-collaboration.spec.ts` (202 → approver applies)*
- [x] Comment + mention in same transaction — *done*
- [x] Workflow rule engine triggers on KPI change — *done*
- [x] Tag `git tag p7-complete`

---

## P8 — Integrations & Extensibility (≈4 weeks)

### Schema
- [x] `IntegrationConnection` (OAuth tokens encrypted AES-256-GCM)
- [x] `Connector` (with type enum REST/GraphQL/postgres/mysql/s3/gcs/webhook + schedule + lastRunAt/Status)
- [x] `Pipeline` (with status enum IDLE/RUNNING/SUCCEEDED/FAILED + step interpreters)
- [x] `IngestionJob` (kind + source Json + status + errorLog)
- [x] `Plugin` (with type WIDGET/TEMPLATE/FORMULA_FN/CONNECTOR + version + entryUrl)

### Backend modules
- [x] `IntegrationsModule`: `IntegrationConnection` CRUD + AES-256-GCM encryption (KMS-ready master key loading) + audit log never carries raw tokens
- [x] `IntegrationCryptoService`: 12-byte random IV + 16-byte auth tag (ciphertext layout `IV‖tag‖ct` base64); 12+ unit tests covering hex/base64/passphrase key loading, round-trip, tampering rejection, short-cipher reject, 8KB+UTF-8 payloads — *built in `integrations/integration-crypto.ts`*
- [x] `SlackModule`: bot, slash command `/kpi <name>`, alert posting with action buttons, NLQ from Slack — *done: alert posts with an Acknowledge button, `/kpi <name>`, `/kpi ask` (NLQ), account linking (BE-042)*
- [x] `TeamsModule`: webhook + adaptive cards — *done: incoming webhook with Adaptive Cards (BE-041)*
- [x] `JiraModule`: create issue from alert + two-way status sync to `Task` — *built as `integrations/providers/jira.service.ts` (+ `POST /integrations/jira/webhook/:connectionId`)*
- [x] `InboundEmailModule`: public webhook receiver at `POST /webhooks/inbound/email`; plus-addressing routing `inbound+<type>-<id>@host`; HMAC-SHA256 verifier; sender must match user in resolved org; strips quoted-reply lines
- [x] `ConnectorsModule`: registry CRUD; REST runner + GraphQL runner first; Postgres + MySQL second; idempotency-key namespace per type
- [x] `ConnectorSchedulerService` + processor: per-connector repeatable BullMQ jobs (deterministic jobId), auto-reconcile on create/update/remove — *one BullMQ job scheduler per connector (`connector:<id>`), reconciled on create/update/delete and at boot; `ConnectorRunProcessor` runs it as the connector's creator*
- [x] `IngestModule`: `POST /ingest` authenticated by `Bearer kpinx_*` (ApiKey strategy) gated by `kpi:data_entry` scope; 1-10k rows per call; per-row idempotency — *API-key scopes are `PermissionKey` values (`KPI_DATA_ENTRY`), not `kpi:data_entry`*
- [x] `ApiKeysModule`: (already shipped in P4) — extend with SCIM scope
- [x] `WebhooksModule`: (already shipped in P4) — extend with event catalog
- [x] `PluginsModule`: catalog + lifecycle (WIDGET/TEMPLATE/FORMULA_FN/CONNECTOR types); isolated-vm sandbox for formula-fn; iframe sandbox for widget rendering

### Frontend
- [x] `/integrations` marketplace cards (Slack/Teams/Jira/Salesforce/Snowflake/etc.) with OAuth status badges
- [ ] OAuth callback handlers per provider — *not built: connections are made by pasting tokens or webhook URLs; OAuth needs registered Slack / Jira apps and a public callback URL*
- [x] `/connectors` list + create wizard (source picker → schema map → schedule → test)
- [x] `/connectors/[id]` detail + run history + manual trigger + edit schedule
- [x] `/settings/api-keys` list with key prefix + scopes + last used + revoke; mint flow (show plaintext ONCE)
- [x] `/settings/webhooks` list + create + rotate secret + test
- [x] `/plugins` gallery + install/uninstall

### Tests
- [x] Slack alert with action buttons → click "Acknowledge" → status syncs back to Alert — *done at unit level: `provider-handlers.spec.ts` (acknowledge_alert acks the alert), `slack-interactive.controller.spec.ts` (signature checks); never run against a real Slack workspace*
- [ ] Jira issue lifecycle round-trip (create from alert → close → Task status updates) — *partly: Jira webhooks move the linked task (Done → DONE; `provider-handlers.spec.ts`, `jira-webhook.spec.ts`); there is no "create issue from alert"*
- [ ] REST connector pulls a public sample API daily into a KPI (verified for a week) — *not verified: scheduled connector runs exist (BE-030, `connector-schedule.spec.ts`); nothing has run daily for a week*
- [x] Inbound email: send to `inbound+kpi-<id>@host` → comment appears on the KPI — *done: `p8-integrations.spec.ts` "inbound email → comment on the addressed KPI"*
- [x] API key minted with `kpi:data_entry` scope can hit `POST /ingest` but receives 403 on `POST /kpis` — *scope is `KPI_DATA_ENTRY` (`PermissionKey`), not `kpi:data_entry`*

### Exit
- [ ] Slack OAuth + alert posting + ack sync-back — *not verified: no OAuth (above) and no live Slack workspace; ack handling is unit-tested*
- [ ] Jira issue create + status sync — *partly: status sync only (above)*
- [ ] REST connector pulls public API daily — *not verified: see above*
- [x] Inbound email → comment — *done*
- [x] API key scope enforcement works — *done: `p8-integrations.spec.ts` (a KPI_DATA_ENTRY key can POST /ingest, 403 on POST /kpis)*
- [x] Tag `git tag p8-complete`

---

## P9 — Polish (≈3 weeks)

### Schema
- [x] `SsoConfig` (organizationId/protocol/idpEntityId/idpSsoUrl/encryptedCertificate/allowJitProvisioning/defaultRoleId)
- [x] `ScimToken` (organizationId/label/hashedToken/expiresAt/lastUsedAt/revokedAt)

### Backend modules
- [x] `SsoModule`: SAML + OIDC via WorkOS provider; JIT user provisioning; default-role assignment
- [x] `ScimModule`: RFC 7644 `/scim/v2/*` endpoints (Users + Groups + ServiceProviderConfig + ResourceTypes); auth via ApiKey + `scim:provision` scope; PATCH active=false → suspend (reversible via active=true); DELETE → archive; Okta-style member filter `members[value eq "<id>"]` — *built in `apps/api/src/scim/` (SCIM tokens are their own credential, no `scim:provision` scope)*
- [x] Full `GdprModule.delete()` (P1 only had export; this adds cascade delete with audit) — *built as `UsersService.purge()` (GDPR hard-purge after offboarding)*
- [ ] KMS data key wiring for IntegrationConnection encryption (production AWS KMS GenerateDataKey) — *won't do while hosting must stay free: see AWS KMS at the top*
- [x] Per-tenant audit retention tiers (FREE 90d / PRO 1yr / ENTERPRISE 7yr); `RETENTION_TIERS` constant; `POST /retention-policies/apply-tier {tier}` one-click apply
- [x] `SearchModule`: global FTS across KPIs/dashboards/users/units with relevance scoring (exact 1.0 / prefix 0.8 / substring 0.5); per-type cap 12, overall cap 50
- [x] `ActivityModule`: per-user/per-org timeline from AuditLog; cursor pagination via `nextCursor`
- [ ] Custom-domain ACM cert provisioning via lambda (or document manual cert flow) — *won't do as written: no AWS (ADR-001); Caddy gets the API's certificate; TLS for tenant custom domains is not wired*
- [x] OpenAPI auto-gen from NestJS + Zod via `nestjs-zod`; Spectral lint passes — *done (BE-040), with `@ApiBody` instead of `nestjs-zod`; Spectral-linted in CI*
- [x] TypeScript SDK auto-gen into `packages/sdk/`; CI regenerates on schema change — *done (BE-040): CI fails if the committed SDK differs from a fresh regeneration*

### Frontend
- [x] Soft-delete + 30-day restore UI for KPIs (`/kpis/archive`), Dashboards (`/dashboards/archive`), Users (trash list)
- [x] Per-card countdown badge + restore/purge actions — *done: days-until-purge, Restore and Purge on `/kpis/archive` and `/dashboards/archive`*
- [x] In-app help drawer with contextual route → tip cards; floating `?` button (top-right) with pulse hint until first open; CONTEXTUAL_HELP registry maps pathname patterns — *done: `help-drawer.tsx`, `contextual-help.ts`, `e2e/help-drawer.spec.ts`*
- [x] Sample-data toggle: `POST /organizations/seed-demo-data` instantiates 5 curated KPIs (MRR/NPS/Churn/Deployment Frequency/Engagement Score) and back-fills 30 days of deterministic-pseudorandom data points; idempotent — *built as `POST /demo-data/seed`*
- [x] Global search bar in app shell (⌘K command palette across navigation, KPIs, dashboards, users, recent actions) — *done: `global-search.tsx` (⌘K / Ctrl-K, grouped results); `p9-polish.spec.ts`*
- [x] `/activity` per-user/per-org timeline page
- [x] i18n scaffolding: 4 starter locales (en-US, es, fr, ur-PK with RTL); `apps/web/src/i18n/dictionaries/`; `getDictionary()` + `<LocaleProvider>` + `useTranslations()` hook; locale picker on `/me`; layout sets `dir="rtl"` for ur-PK — *built as `apps/web/src/i18n/` (`dictionaries.ts`, `translate`, RTL via `locale-provider.tsx`)*
- [x] Status page at `/status` (also `status.kpinexus.app` via custom domain) — *done: `/status`; no `status.kpinexus.app` (no custom domain)*
- [ ] Color-contrast token audit + axe-core enforcement (zero violations on top 10 pages) — *deferred (post-v1, see the status banner): no axe-core gate*
- [ ] Bundle budget enforcement (track JS size per route, fail CI on regression) — *deferred (post-v1): no bundle budget*
- [ ] RSC streaming for dashboard route — *not built: the dashboard is a client component*
- [x] Route-level prefetch — *done by Next.js: `<Link>` prefetches routes in production; nothing custom*
- [x] ARIA labels on all charts (extend the SeriesChart pattern to remaining)
- [x] Custom domain UI at `/settings/custom-domain` with DNS TXT verification flow + last-checked-at + last-check-error diagnostics
- [x] SSO config UI at `/settings/sso`
- [x] SCIM token management at `/settings/scim`
- [x] Retention UI at `/settings/retention` with per-entity policies + tier preset cards + run-now + schedule-daily

### Plugin sandbox hardening
- [ ] Plugin formula-fn isolated-vm sandbox (per-tenant 100ms/32MB limits) — *deferred (post-v1): plugins are a catalog only; nothing executes*
- [ ] Plugin widget iframe sandbox (sandboxed src, message-passing API) — *deferred (post-v1): as above*
- [ ] Plugin permission scoping at execution time — *deferred (post-v1): nothing executes yet*

### Tests
- [ ] SAML round-trip with Okta dev tenant — *not verified: no Okta tenant; SSO just-in-time provisioning is unit-tested (`sso.service.spec.ts`)*
- [ ] SCIM Okta provisions user → User row appears with status=INVITED → admin completes → status=ACTIVE — *partly: `p9-polish.spec.ts` drives SCIM provision (INVITED) → deactivate → delete with a stand-in client; no Okta*
- [ ] axe-core: 0 violations on top 10 pages (CI gate) — *deferred (post-v1): no axe-core run*
- [ ] k6 load test: 100 RPS sustained, p95 < 800ms — *not verified: no k6 run*
- [ ] GDPR export end-to-end < 30s — *not built: there is a GDPR purge (`UsersService.purge()`), but no per-user data export*
- [x] OpenAPI Spectral lint passes; SDK regenerates cleanly — *done: CI step "OpenAPI is current, lints clean, and the SDK regenerates unchanged"*
- [ ] Lighthouse Performance ≥ 90 on all top routes — *not verified: no Lighthouse run recorded*
- [x] i18n: switch to ur-PK → layout flips to RTL → translated strings render — *done: `e2e/i18n-rtl.spec.ts`*

### Exit
- [ ] SAML round-trip green — *not verified: see above*
- [ ] SCIM full provisioning works — *partly: see above*
- [ ] axe-core: 0 violations on 10 critical pages — *deferred: see above*
- [ ] k6: 100 RPS sustained, p95 < 800ms — *not verified: see above*
- [ ] GDPR export < 30s — *not built: see above*
- [x] OpenAPI Spectral clean; SDK regen clean — *done: see above*
- [ ] Lighthouse ≥ 90 all top routes — *not verified: see above*
- [x] Tag `git tag p9-complete` + `git tag v1.0.0`

---

## Frontend design handoff (post-P9, or interleaved at phase boundaries)

The frontend visual design is deferred to a "Claude Design" session per design spec §12. Once a phase's backend is stable, the design session can produce:
- [x] `packages/ui/src/tokens.css` — final tokens light + dark
- [x] `packages/ui/src/components/` — implemented primitives + composites with Storybook stories (FE-023)
- [x] `apps/web/src/app/**/page.tsx` — final pages per route map
- [x] Storybook component documentation (`pnpm --filter @kpi-nexus/ui storybook`)
- [x] Updated CLAUDE.md with design conventions adopted — *done: CLAUDE.md says where the primitives live and that each needs a Storybook story (DOC-003)*

This can happen incrementally — design + implement P1's auth pages before P2's KPI pages, etc. — or in one big handoff at the end.

---

## Always-on (every phase)

- [x] CI green on every commit — *done since 2026-11-05: CI and Security must pass on each PR's head and on the resulting main (HANDOFF §5a)*
- [ ] Cross-tenant fuzz suite extended with each new endpoint — *not followed: the harness still covers the P1 resources; later endpoints rely on RLS, cross-tenant cases in their own specs and the audit's `api-crud.mjs`*
- [x] Dependency + secret + SAST scans on every PR — *done: `security.yml` (gitleaks, CodeQL, pnpm audit) on every PR*
- [ ] Per-phase exit criteria block phase advancement — *not followed: phases were tagged while some exit checks (benchmarks, live third-party checks) had not run; this file now says which*
- [x] Architectural decision changes update `docs/superpowers/specs/2026-05-25-kpi-nexus-final-design.md`
- [x] Breaking deviations add an ADR (`docs/adrs/NNNN-<title>.md`) — *done: `docs/adrs/` (index in its README); the 2026-06-01 capability refinement is recorded in the granular-access spec*
