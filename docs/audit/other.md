# Audit — everything else (packages, worker, infra, CI, security, docs)

_Part 3 of the audit. Pre-loaded with findings from the baseline; the full pass happens after backend and frontend._

## Findings

### OT-001 · Low · Lint fails (12 errors)
- **Repro:** `pnpm turbo lint`
- **Actual:** `@kpi-nexus/api` 11 errors, `@kpi-nexus/db` 1 error (+96 `sort-imports` warnings, all auto-fixable). CI's lint step would fail.
- **Evidence:** unused vars — `apps/api/src/auth/me-sessions.controller.spec.ts:36` (`past`), `apps/api/src/nlq/reembed.spec.ts:14-19,92` (5 unused imports + `capturedOrgId`), `apps/api/src/onboarding/onboarding-cleanup.spec.ts:9`, `apps/api/src/reports/services/pdf-generator.ts:158` (`sparkY`), `apps/api/test/integration/cross-tenant.fuzz.spec.ts:26` (`Endpoint`), `apps/api/test/integration/owner-override.spec.ts:87` (`bobPw`), `packages/db/prisma/seed.ts:994` (`recChurn`); explicit `any` — `apps/api/src/rbac/services/access-context.service.spec.ts:65,102`.
- **Note:** `pdf-generator.ts:158` is the only one in product code — an unused `sparkY` may mean the sparkline is drawn at the wrong y-position; check during the reports audit.

### OT-002 · Low · Contracts test drift — `AccessProfile` fixture missing new required fields
- **Repro:** `pnpm --filter @kpi-nexus/contracts test`
- **Actual:** `src/access.spec.ts > parses a valid profile` fails: schema now requires `resourceGrants` (array) and `pageAccess` (object); the fixture predates them.
- **Expected:** fixture updated alongside the schema.
- **Location:** `packages/contracts/src/access.spec.ts:14-21`, schema `packages/contracts/src/access.ts`.

### OT-003 · Medium · Worker app is a stub
- **Actual:** `apps/worker/src` contains only `main.ts`, `app.module.ts` and an `echo` module. README describes the worker as "NestJS + BullMQ processors, same modules as api"; queue processors (alert engine, webhooks, …) actually live in the API process.
- **To verify in Part 1e:** which queues are processed where, and whether anything is enqueued that nothing consumes.

### OT-004 · Low · Status docs contradict each other
- `ROADMAP.md`: P0–P9 all ✅.
- `TODOS.md`: 77 checked / 354 unchecked.
- `README.md` "Current status": "P0 merged… P1 is next".
- `NEXT-SESSION.md`: "Nothing is coded yet."

### OT-006 · Low · API integration specs pass silently when the API is down
- **Evidence:** `apps/api/test/integration/cross-tenant.fuzz.spec.ts:140-163`, among others — `beforeAll` sets `apiAvailable = false` when `/health` is unreachable, and each test starts with `if (skipIfNoApi()) return;`. The test body is skipped but the test is reported as **passed**.
- **Impact:** a CI run without a live API shows a green "cross-tenant fuzz" that tested nothing.
- **Expected:** use `test.skipIf(!apiAvailable)` / `describe.skipIf` (as `redis-health.spec.ts` does) so skips are visible, or fail when `REQUIRE_LIVE_API=1`.
- **Note:** in this audit the API was up (no `[skip]` warnings printed), so the 89 passes are real.

### OT-005 · Low · Forecast models Prophet / ARIMA not implemented
- **Repro:** KPI → Forecast → Model "prophet" → Generate.
- **Actual:** result reports model `NAIVE`. `apps/ml/app/routers/forecast.py:19` — `model: str = "naive"  # prophet/arima deferred → naive fallback`. The UI offers prophet/arima as if available; ROADMAP P5 lists Prophet/ARIMA as shipped.
- **Expected:** either implement, or hide/label the unavailable models.
