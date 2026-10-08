# Audit — everything else (packages, worker, infra, CI, security, docs)

_Part 3 of the audit. Pre-loaded with findings from the baseline; the full pass happens after backend and frontend._

## Findings

### OT-001 · Low · Lint fails (12 errors) — ✅ FIXED
- **Fix (`51ef31c`):** removed the unused imports/vars and the one `any`; `pnpm turbo lint` → 0 errors.
- **Repro:** `pnpm turbo lint`
- **Actual:** `@kpi-nexus/api` 11 errors, `@kpi-nexus/db` 1 error (+96 `sort-imports` warnings, all auto-fixable). CI's lint step would fail.
- **Evidence:** unused vars — `apps/api/src/auth/me-sessions.controller.spec.ts:36` (`past`), `apps/api/src/nlq/reembed.spec.ts:14-19,92` (5 unused imports + `capturedOrgId`), `apps/api/src/onboarding/onboarding-cleanup.spec.ts:9`, `apps/api/src/reports/services/pdf-generator.ts:158` (`sparkY`), `apps/api/test/integration/cross-tenant.fuzz.spec.ts:26` (`Endpoint`), `apps/api/test/integration/owner-override.spec.ts:87` (`bobPw`), `packages/db/prisma/seed.ts:994` (`recChurn`); explicit `any` — `apps/api/src/rbac/services/access-context.service.spec.ts:65,102`.
- **Note:** `pdf-generator.ts:158` is the only one in product code — an unused `sparkY` may mean the sparkline is drawn at the wrong y-position; check during the reports audit.

### OT-002 · Low · Contracts test drift — `AccessProfile` fixture missing new required fields — ✅ FIXED
- **Fix (`a6afcd2`):** the fixture carries `resourceGrants` + `pageAccess`; new tests assert both layers are required and an unknown resource action is rejected.
- **Repro:** `pnpm --filter @kpi-nexus/contracts test`
- **Actual:** `src/access.spec.ts > parses a valid profile` fails: schema now requires `resourceGrants` (array) and `pageAccess` (object); the fixture predates them.
- **Expected:** fixture updated alongside the schema.
- **Location:** `packages/contracts/src/access.spec.ts:14-21`, schema `packages/contracts/src/access.ts`.

### OT-003 · Medium · Worker app is a stub
- **Actual:** `apps/worker/src` contains only `main.ts`, `app.module.ts` and an `echo` module. README describes the worker as "NestJS + BullMQ processors, same modules as api"; queue processors (alert engine, webhooks, …) actually live in the API process.
- **Verified:** all 10 BullMQ processors (`alert-engine`, `calculation-engine`, `escalation`, `insights`, `reembed`, `notification-digest`, `notification-retry`, `onboarding-cleanup`, `scheduled-report`, `outbound-webhook`) are registered in `apps/api`. The worker registers only an `echo` processor. Background work therefore runs in the API process — it works (alerts, emails and reports were delivered in Part 1), but there's no isolation or independent scaling, and the worker deployable is dead weight.

### OT-004 · Low · Status docs contradict each other — ✅ FIXED
- **Fix (`0b4c273`):** README "Current status" and NEXT-SESSION.md now describe v1.0.0 + this audit as the source of truth; TODOS.md keeps its reconciled banner.
- `ROADMAP.md`: P0–P9 all ✅.
- `TODOS.md`: 77 checked / 354 unchecked.
- `README.md` "Current status": "P0 merged… P1 is next".
- `NEXT-SESSION.md`: "Nothing is coded yet."

### OT-006 · Low · API integration specs pass silently when the API is down — ✅ FIXED
- **Fix (`59039b2`):** `test/integration/global-setup.ts` probes `/health` and fails the run when the API is down (opt out with `INTEGRATION_ALLOW_NO_API=1`, which only warns).
- **Evidence:** `apps/api/test/integration/cross-tenant.fuzz.spec.ts:140-163`, among others — `beforeAll` sets `apiAvailable = false` when `/health` is unreachable, and each test starts with `if (skipIfNoApi()) return;`. The test body is skipped but the test is reported as **passed**.
- **Impact:** a CI run without a live API shows a green "cross-tenant fuzz" that tested nothing.
- **Expected:** use `test.skipIf(!apiAvailable)` / `describe.skipIf` (as `redis-health.spec.ts` does) so skips are visible, or fail when `REQUIRE_LIVE_API=1`.
- **Note:** in this audit the API was up (no `[skip]` warnings printed), so the 89 passes are real.

### OT-013 · Critical · Known-vulnerable dependencies in the request path (incl. Next.js RCE advisories) — ✅ FIXED (residual noted)
- **Fix:** next 15.5.18 → 15.5.27; fastify → 5.12.5; all `@nestjs/*` → 11.2.7; nodemailer 8 → 10.0.13; bcrypt 5 → 6.0.0 (drops the `tar` chain; existing `$2b$` hashes verified); OpenTelemetry sdk-node 0.57 → 0.222 / resources 1.30 → 2.11 (`Resource` → `resourceFromAttributes`). Root `pnpm.overrides` pin patched transitive versions within their parents' ranges: fastify, find-my-way, fast-uri, @grpc/grpc-js, postcss, nanoid@3, browserslist, sharp, brace-expansion@1/@2.
- **Audit:** 4 critical · 62 high · 32 moderate · 3 low → **1 critical · 11 high · 9 moderate · 2 low**. Everything left is dev-only (vitest UI, vite, js-yaml, brace-expansion@5 via tooling) except two items in production paths:
  - `deepmerge-ts`, internal to `@prisma/client` 6.19 — the fix needs deepmerge-ts 8, which Prisma doesn't support yet;
  - `braces`, via tailwindcss's chokidar — build-time only, and no patched version exists.
- **Verified:** typecheck; unit suites unchanged (api 1382, web 92, ai 42, worker 2); `next build` + `nest build`; integration suite 102 / 105 (3 intentional skips); 14 E2E specs; OTel span exported to Jaeger.
- **Repro:** `pnpm audit --audit-level low` (the CI `pnpm-audit` job never got this far — OT-007) → **4 critical · 62 high · 32 moderate · 3 low**.
- **Production / runtime path:**

| Package | Installed | Fixed in | Advisories (examples) | Exposure |
|---|---|---|---|---|
| `next` | 15.5.18 | ≥ 15.5.24 | GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x (+3) — includes **unauthenticated RCE** (Image Optimization API; Windows-hosted servers) | web app, internet-facing |
| `fastify` | 5.8.5 | ≥ 5.12.2 | GHSA-667r-xxjv-c9mm, GHSA-p68q-wchp-6fh7 (+2) | API |
| `@nestjs/platform-fastify` | 11.1.23 | ≥ 11.2.4 | GHSA-6v32-fjc9-9qf6 — middleware bypass via trailing slash | API auth/middleware |
| `find-my-way` | 9.6.0 | ≥ 9.7.0 | GHSA-c96f-x56v-gq3h | API router |
| `nodemailer` | 8.0.9 | ≥ 9.1.0 | GHSA-p6gq-j5cr-w38f (+2) | email |
| `@opentelemetry/*` | 0.57.2 / 1.30.1 | ≥ 0.217.0 / ≥ 2.9.0 | GHSA-q7rr-3cgh-j5r3, GHSA-45rx-2jwx-cxfr — DoS | API telemetry |
| `sharp`, `postcss`, `nanoid`, `fast-uri`, `js-yaml`, `deepmerge-ts`, `@grpc/grpc-js` | — | — | various high | transitive |

- **Install-time only (lower runtime risk):** `tar` 6.2.1 (critical, ×9) via `bcrypt@5.1.1`'s native-build toolchain. Swapping to `bcryptjs` or `bcrypt@6` removes it.
- **Dev-only:** `vitest` (critical — UI server file read; only when the Vitest UI is running), `vite`, `brace-expansion` via tooling.
- **Context:** 21 Dependabot PRs are open but unmergeable because CI is broken (OT-007).

### OT-014 · High · Row-level security is not in effect; the API runs as a Postgres superuser — 🟡 PARTIAL (stage A of 3)
- **Done (stage A, no runtime behaviour change):**
  - Policies now cover **every** table with an `organizationId` column: 73 tables, up from 17. Coverage is discovered from the catalog, so new tenant tables are picked up on the next `db:setup`.
  - Special rules: `Organization` (by id); `AuditLog` / `LoginAttempt` (NULL-org rows are bypass-only); `KPITemplate` / `OrgTemplate` (NULL-org built-ins are readable by every tenant, but tenants can't write them).
  - Every code path that queried without a tenant context now sets one explicitly. Before this, they would have broken the moment RLS was enforced:
    - the global `PermissionsGuard` (it runs before `TenancyInterceptor`), which would have meant 403 on every gated route;
    - `POST /auth/refresh`, SSO login, MFA login check and the platform-admin list;
    - API-key / SCIM-token / Slack / Jira credential lookups, inbound email, and the stale-draft sweep.
  - Verified: a fresh `db:setup` (hypertables, continuous aggregates, compression) still passes, and the policy file re-runs idempotently.
- **Found along the way, fixed:** audit events written under `runWithBypass()` outside a request carried the `'platform-bypass'` placeholder as `organizationId`. That broke the FK and the error was swallowed, so **every password-reset audit event was lost** (13 reset tokens on the dev DB, 0 audit rows). `AuditService` now never persists the placeholder, and password reset records the user's real org.
- **Deliberately not covered:** `KPIDataPoint` (TimescaleDB refuses compression on a table with row security, verified in a scratch DB), the `kpi_data_*` continuous aggregates (materialized views can't carry RLS), and tables without `organizationId` (token tables, `KPIVersion`, `OrgUnitNameHistory`, …).
- **Remaining:**
  - **Stage B:** set `app.current_org` / `app.bypass_rls` per query from `RequestContextStore`. This needs a Prisma 6 `$extends`, because `$use` is gone, and it must handle the 13 interactive transactions plus raw SQL. Then connect the API as `kpi_app` (keep the owner URL for migrations), behind a flag that defaults OFF, and get every suite green with the flag ON.
  - **Stage C:** default ON plus `FORCE ROW LEVEL SECURITY`.
  - Also needed: an isolation plan for `KPIDataPoint` and the CAGGs (e.g. security-barrier views, with direct SELECT revoked from `kpi_app`).
- **Evidence (live DB):**
  - RLS is enabled on **17 of 83** public tables and **FORCE**d on 0.
  - All tables are owned by `kpi_nexus`; the API's `DATABASE_URL` uses `kpi_nexus`, which has `rolsuper = true`, `rolbypassrls = true`.
  - The `kpi_app` role (non-owner, no bypass) exists but nothing in `apps/api/src` connects with it. `rls-enforcement.spec.ts` documents this as a pending follow-up.
- **Impact:**
  - Tenant isolation depends only on application `where organizationId` filters — the layer that BE-009 / BE-014 / BE-021 show has gaps.
  - The database-layer safety net the design spec promises (spec §3.1 / §5.1, P1 exit criterion "Postgres RLS enforced") does not exist at runtime.
  - Running the app as a superuser also means any SQL-execution bug yields full cluster control (e.g. `COPY … PROGRAM`).
- **Expected:** connect the API as `kpi_app` (non-owner, `NOBYPASSRLS`); enable + `FORCE ROW LEVEL SECURITY` on every tenant table; keep the owner role for migrations only.

### OT-018 · Medium · OpenTelemetry tracing never starts, and would record nothing if it did — ✅ FIXED
- **Fix (`d3f92b2`):** `instrumentation.ts` loads `.env` itself (real env wins) and registers HTTP / ioredis / Prisma instrumentations; `start` / `start:prod` preload it with `node --import` (a first import in ESM `main.ts` is too late to patch the CJS deps). Jaeger now shows `kpi-nexus-api` with one trace per request (HTTP root → Redis + Prisma children). CI sets the endpoint empty (no collector). Under `nest start --watch` only Prisma spans are recorded.
- **Evidence:** `apps/api/src/main.ts:1` imports `./instrumentation.js` first, but `OTEL_EXPORTER_OTLP_ENDPOINT` lives in `apps/api/.env`, which `@nestjs/config` loads later. At import time the variable is unset, so the SDK never starts — Jaeger has never seen the `kpi-nexus-api` service.
- **Also:** `NodeSDK` is created with no `instrumentations` (no HTTP / Fastify / Prisma / ioredis), so even when started it records no spans automatically.
- **Status:** the upgraded SDK itself works (a manual span reached Jaeger during the OT-013 fix). Found while verifying OT-013.
- **Expected:** load `.env` before instrumentation (e.g. `node --env-file` or `dotenv/config` at the top of `instrumentation.ts`) and register `getNodeAutoInstrumentations()` or explicit HTTP / Fastify / Prisma instrumentations.

### OT-007 · High · CI has never passed — 0 of 40 runs since 2026-05-25 — ✅ FIXED
- **Fix (`0f405ae`):**
  - `pnpm/action-setup@v6` with no `version:` (taken from `packageManager`); checkout / setup-node / setup-python / upload-artifact moved to current majors on Node 22. Same in `security.yml`.
  - `web-e2e` now runs TimescaleDB + Redis + MailHog services, `db:setup`, builds api + web, boots the API with `AI_MOCK` and a canned response (`apps/api/test/fixtures/ai-mock-response.json`, guarded by `ai-mock-fixture.spec.ts`), and serves the production web build. Failures upload the Playwright report and API log.
  - The stale E2E specs were updated (`182acc2`) and real UI bugs they exposed fixed (`d5aad1e`, `4a07d58`, OKR / my-kpis test ids). Locally in CI mode: lint, typecheck, unit tests and build all pass; full E2E 161 / 165 run with 0 retries, and the remaining 4 pass after the fixes (8 intentional skips).
  - Not yet confirmed on GitHub: the branch hasn't been pushed.
- **Evidence:** `gh run list --workflow CI` → 40 runs (35 `pull_request`, 5 `push`), 0 successes. Every pnpm-based job dies in ~40 s at `pnpm/action-setup@v4`: *"Multiple versions of pnpm specified: version 9 in the GitHub Action config … "* — `.github/workflows/ci.yml` passes `version: 9` while `package.json` declares `"packageManager": "pnpm@9.15.0"`.
- **The weekly Security workflow fails the same way:** the `pnpm-audit` job fails 5+ weeks running (latest 2026-09-28); gitleaks and CodeQL pass.
- **Knock-on effects:**
  - 21 open PRs, mostly Dependabot, can't be validated.
  - Even with setup fixed, lint fails (OT-001).
  - The `web-e2e` job runs Playwright with **no API / Postgres / Redis services**, so every backend-dependent E2E test would fail in CI.
- **Expected:** drop `version:` from `pnpm/action-setup` (use `packageManager`), add service containers + API boot to `web-e2e`, and bump the actions off the deprecated Node 20 runtime (annotation on every run).

### OT-008 · Medium · Notification-channel secrets encrypted with a public fallback key in production — ✅ FIXED
- **Fix:** `apps/api/src/config/secrets.ts` follows the `byo-crypto` rule. Outside production the dev default still applies. In production, a missing secret, a dev-default value or one under 32 characters is refused.
  - Applies to all three fallbacks named here plus `EMBED_TOKEN_SECRET`, which had the same pattern, and `JWT_SECRET`, whose `.env.example` value is public.
  - `assertProductionSecrets()` runs at boot, after `ConfigModule` has loaded `.env`, and lists **every** problem in one error.
  - Every use site resolves its secret lazily. Side finding: the onboarding draft secret was a module-level constant evaluated *before* `.env` was loaded, so it silently ignored `JWT_SECRET` / `ONBOARDING_DRAFT_SECRET` and used the public default. Existing drafts are unaffected, because they are verified against a stored hash.
  - The env templates now document the rule.
  - Verified live: production with weak secrets refuses to start and names all of them; production with strong secrets and normal dev both boot.
- **Code:** `apps/api/src/notification-channels/notification-crypto.ts:14-20` — key = `NOTIFICATION_ENCRYPTION_KEY ?? BYO_ENCRYPTION_KEY ?? 'dev-only-notification-key-change-me'`, with no production guard.
- **Contrast:** `ai/byo/byo-crypto.ts:52-58` throws in production when its key is unset or short.
- **Impact:** a deployment that forgets both variables stores Slack / Teams webhook URLs and other channel config encrypted under a key that is in the public repo.
- **Similar fallbacks:** `ML_SIDECAR_HMAC_SECRET ?? 'dev-ml-shared-secret'` (`apps/api/src/ml/ml-client.service.ts:16` — the ML side refuses the default only when `ENV=production`, a variable the Node app doesn't use) and `ONBOARDING_DRAFT_SECRET ?? JWT_SECRET ?? 'dev-onboarding-secret'` (`onboarding/onboarding.service.ts:11`).

### OT-009 · Medium · Client IP is spoofable and never recorded on login attempts — ✅ FIXED
- **Fix:** `trustProxy` now comes from `TRUST_PROXY` (unset = don't trust XFF; `1`/`2` = hop count; `true`; or a CIDR list) via `src/config/trust-proxy.ts`. Login attempts record `ipAddress` and `userAgent`. Verified live: a spoofed `X-Forwarded-For` is ignored and the socket IP is recorded.
- `apps/api/src/main.ts:22` sets `trustProxy: true` unconditionally, so `req.ip` comes from the client-controlled `X-Forwarded-For` whenever the API isn't behind a proxy that overwrites it. The rate limiter keys on `req.ip` (`rate-limit.guard.ts`), so per-IP limits (once enabled — see BE-017) can be bypassed by rotating the header.
- `LoginAttempt.ipAddress` is empty for attempts (checked after a failed login) → the security audit trail has no IPs.
- **Expected:** set `trustProxy` to the real proxy hop count / CIDR via env; record `req.ip` on login attempts.

### OT-011 · Low · Deployment config promised by the README doesn't exist; local images are unpinned — 🟡 PARTIAL
- **Fix (`44676f2`):** images pinned (tag@digest / v1.0.1).
- **Found while fixing — data loss:** Postgres was mounted at `/var/lib/postgresql/data`, but timescaledb-ha uses `/home/postgres/pgdata/data`, so the DB lived in the container layer and vanished on any recreate. The pin triggered exactly that and wiped the local dev DB (rebuilt from the Helios seed; backup `C:workFYPkhanackupskpi_nexus-2026-10-08-helios-reseed.dump`). Now a named volume at `/home/postgres/pgdata`; force-recreate verified to keep data.
- **Open:** MinIO no longer publishes pullable community images (Docker Hub "repository does not exist", quay.io 401) — a fresh machine can't start the stack. Needs a replacement S3-compatible store (decision). Deploy config (`infra/fly`) still not written.
- `infra/fly/` and `infra/github/` are empty directories; the README describes "fly.toml per service" and the stack as deploying to Fly.io / Vercel. There is no deploy config in the repo.
- `infra/docker/docker-compose.yml` uses moving tags: `minio/minio:latest`, `mailhog/mailhog:latest` (unmaintained since 2020), `jaegertracing/all-in-one:latest`, `timescale/timescaledb-ha:pg16`. The Postgres log already warns `timescaledb extension is not up-to-date (2.26.4 vs 2.30.2)`.

### OT-012 · Low · `packages/formula` is an empty stub; docs describe a different sandbox — ✅ FIXED (docs)
- **Fix (`0b4c273`):** README and the stub now say the engine is `apps/api/src/formula` (no isolated-vm); the unused package is kept to avoid a lockfile change.
- `packages/formula/src/index.ts` is `export {}` with "Real implementation lands in P2". The real engine is `apps/api/src/formula/formula.ts` — a hand-written tokenizer/parser/AST evaluator (no `eval` / `Function`, 68 tests), which is sound and was confirmed to reject escape attempts (Part 1).
- README line 42 says "Formula parser + evaluator (isolated-vm sandbox)" — inaccurate. Either move the engine into the package or delete the package and fix the docs.

### OT-015 · Low · Demo seed's latest period ends in the future (made visible by the 2026-10-03 setup fix) — ✅ FIXED
- **Fix (`f6f1411`):** `recordedAt` is `min(periodEnd, SEED_NOW)`; scratch-DB seed shows the newest value on the 5th, not the 28th. Re-seed (or wait for the month to pass) to fix existing local data.
- **Repro:** KPI detail for "Monthly Recurring Revenue" → "LATEST VALUE 498000 USD, recorded **28/10/2026**", while today is 3 Oct 2026.
- **Cause:** the seed's 12 monthly periods end at the anchor month, and `periodEnd()` is the 28th (`packages/db/prisma/seed.ts`). The original seed had the same property relative to its fixed "now" (5 June with a June 28 period end). Anchoring to the current month in commit `2971f87` (this audit's setup fix) made it visible today.
- **Expected:** anchor to the last *completed* month, or clamp `periodEnd` / `recordedAt` to `SEED_NOW`.

### OT-016 · Medium · 39 tenant tables have no foreign key to `Organization` — deleting an org leaves its data behind — ✅ FIXED
- **Fix (`809c2a7`) — root cause:** 33 of the 39 FKs were in the migration chain, but `schema.prisma` never declared the relations, so every DB built with `prisma db push` (db:setup — dev, CI, this audit) had none; 6 were missing everywhere. All 39 relations are now in the schema (`onDelete: Cascade`, matching the migrations) and an idempotent migration adds the missing ones as `NOT VALID` (enforced for new rows and cascades; legacy orphans untouched — `VALIDATE CONSTRAINT` after cleanup).
- Verified: fresh `migrate deploy` → 39; dangling org id rejected; deleting helios in a rolled-back transaction cascaded its rows.
- **Evidence (found during audit cleanup):** these tables have an `organizationId` column with no FK constraint:
  - **Auth & security:** `ScimToken`, `SsoConfig`, `LoginAttempt`
  - **AI:** `AiProvider` (BYOK credentials), `AiBudget`, `AiCallLog`, `AiFeatureConfig`, `NLQQuery`, `KPIInsight`, `Recommendation`, `KpiCatalogEmbedding`, `AnomalyDetection`, `Forecast`
  - **Collaboration:** `Comment`, `Mention`, `Task`, `Objective`, `KeyResult`, `ApprovalRequest`, `ApprovalWorkflow`, `Workflow`, `OnboardingSession`, `OnboardingTask`
  - **KPI engine:** `KPITarget`, `KPIThresholdBand`, `KPIBenchmark`, `KPICascade`, `KPIDependency`, `KPIAssignmentOrgUnit`, `KPIAssignmentUser`, `FormulaExpression`, `LineageEdge`, `KPITemplate`
  - **Integrations:** `Connector`, `IntegrationConnection`, `Pipeline`, `Plugin`
  - **Other:** `OrgTemplate`
- **Repro:** deleting the 277 test orgs left orphan rows in 31 of those tables — e.g. `LoginAttempt` 196, `KpiCatalogEmbedding` 157, `AiCallLog` 62, `AiBudget` 35, `LineageEdge` 13, `KPITarget` 10, plus SCIM tokens, an SSO config and a BYOK AI provider. They were cleaned up by hand.
- **Impact:** tenant offboarding / deletion (and the GDPR-style tenant export & delete the spec describes) can't rely on cascades. Secrets (SCIM tokens, BYOK keys, SSO config) survive their org. The same gap lets rows reference non-existent orgs or KPIs (dangling ids) without the database objecting.
- **Expected:** add `@relation(... onDelete: Cascade)` FKs for these tables, or an explicit, tested org-purge routine.

### OT-017 · Info · `setupScripts/start.ps1` not cold-run end to end
- Not executed during the audit, because it restarts every service the audit depended on. Its pieces were exercised individually during the 2026-10-03 setup fixes (Docker start, `pnpm install`, `docker:up`, `db:setup`, the ML venv via `uv`, `pnpm dev`). A cold run on a clean machine is still worth doing once the fixes land.

### OT-010 · Low · Git history is clean of secrets ✅ (verified, no action)
- Scanned `git log --all -p` for Google / Anthropic / OpenAI / Slack / GitHub / AWS key patterns and private keys → none. `.env` files were never committed and are gitignored. CORS uses an explicit allow-list (`CORS_ALLOWED_ORIGINS`), and `JWT_SECRET` is mandatory.

### OT-005 · Low · Forecast models Prophet / ARIMA not implemented — ✅ FIXED (labelled)
- **Fix (`6216b14`):** the picker keeps Prophet / ARIMA visible but disabled and labelled "coming soon"; naive is the only selectable model. Implementing them remains a product choice.
- **Repro:** KPI → Forecast → Model "prophet" → Generate.
- **Actual:** result reports model `NAIVE`. `apps/ml/app/routers/forecast.py:19` — `model: str = "naive"  # prophet/arima deferred → naive fallback`. The UI offers prophet/arima as if available; ROADMAP P5 lists Prophet/ARIMA as shipped.
- **Expected:** either implement, or hide/label the unavailable models.
