# KPI Nexus Final — full audit (2026-10)

Report-only audit: problems are documented here with repro steps; **no product code is changed** during the audit. Fixes come afterwards, in batches, once the findings are reviewed.

| Part | Report | Status |
|---|---|---|
| Backend — API, worker, ML | [backend.md](./backend.md) | ✅ done — 25 findings: 2 Critical · 7 High · 8 Medium · 8 Low |
| Frontend — all 80 pages | [frontend.md](./frontend.md) | ✅ done — 17 findings: 4 High · 6 Medium · 7 Low |
| Everything else — packages, infra, CI, security, docs | [other.md](./other.md) | ✅ done — 17 findings: 1 Critical · 2 High · 4 Medium · 9 Low · 1 Info |

## Conventions

**Finding IDs:** `BE-nnn` backend · `FE-nnn` frontend · `OT-nnn` other.

**Severity**

| Level | Meaning |
|---|---|
| Critical | Security hole, data loss/corruption, crash |
| High | Feature broken / unusable |
| Medium | Wrong behaviour, workaround exists |
| Low | Cosmetic, lint, test drift, docs |

Each finding lists: area · severity · summary · repro · expected vs actual · evidence · suspected location.

## Environment

- Branch `fix/full-audit` (from `feat/okrs-tasks-pages` @ `2971f87`)
- Local stack: Docker (Postgres 16 + TimescaleDB, Redis 7, MinIO, Mailhog, Jaeger), API :4000, web :3000, worker, ML :8000
- Data: seeded `helios` demo org (`SEED_ANCHOR` = current month); login `admin@helios.io` / `Password123!`

## Baseline (static checks)

| Check | Result |
|---|---|
| Typecheck (all packages) | ✅ pass |
| Lint | ❌ 12 errors (api 11, db 1) + 96 `sort-imports` warnings → OT-001 |
| Unit tests — api | ✅ 1364 / 1364 |
| Unit tests — web | ✅ 92 / 92 |
| Unit tests — ai / worker | ✅ 42 / 42 · 2 / 2 |
| Unit tests — contracts | ❌ 19 / 20 → OT-002 |
| ML pytest | ✅ 34 / 34 |

## Re-running the audit tooling

```bash
node scripts/audit/api-routes.mjs                              # static route inventory → api-routes.json
node --env-file=.env scripts/audit/api-sweep.mjs               # live GET sweep, 5 personas → api-sweep.json
node --env-file=.env scripts/audit/api-crud.mjs [domain ...]   # write-side cycles in 2 disposable orgs → api-crud.json
node --env-file=apps/ml/.env scripts/audit/ml-probe.mjs        # ML sidecar edge cases + HMAC → ml-probe.json
```

The sweep and CRUD scripts need the stack running and `helios` seeded. The CRUD script registers two new `audit-*` orgs per run (never touches `helios`). Response excerpts are secret-redacted before being written.

## Summary

**62 findings: 3 Critical · 16 High · 18 Medium · 24 Low · 1 Info** (backend 28 · frontend 17 · other 17). Three frontend findings are the user-facing side of backend ones (FE-005 = BE-001, FE-012 = BE-027, FE-013 = BE-028), so there are 59 distinct problems.

**What's solid:**
- Typecheck is clean.
- Unit suites: 1364 API + 92 web tests pass; the API integration suite is 89/89.
- Every one of the 332 API routes enforces auth, and permission gates match each persona's effective capabilities (610-request sweep).
- Cross-tenant reads return 404 everywhere probed, and NLQ answers are tenant-isolated.
- The formula sandbox rejects escape attempts.
- The alert → email pipeline works end to end in under a second.
- Share links, API-key scopes and SCIM isolation all behave.
- No page returns a 5xx, and 79/80 pages render for an admin.

**What isn't:**
- Several unauthenticated or fail-open endpoints.
- No defence-in-depth at the DB layer.
- Known-vulnerable dependencies.
- A handful of headline features that are broken or silently degraded: templates, board pack, live updates, AI reliability, email delivery.
- A CI pipeline that has never once passed.

### Critical & High

| ID | Severity | Problem |
|---|---|---|
| [BE-014](./backend.md) | Critical | Anyone can change task status in **any** tenant via the public Jira webhook (proven) |
| [BE-007](./backend.md) | Critical | Password-reset links (with token) are logged instead of emailed — log readers can take over accounts; real users never get the email |
| [OT-013](./other.md) | Critical | Vulnerable runtime deps incl. Next.js 15.5.18 **unauthenticated RCE** advisories; fastify / Nest middleware bypass; nodemailer |
| BE-015 | High | Slack interactive endpoint skips signature check when headers are omitted |
| BE-016 | High | SSRF via notification channels, webhooks and REST/GraphQL connectors (full read) |
| BE-010 | High | Anonymous, unthrottled LLM usage via public onboarding AI endpoints (real Gemini keys configured) |
| BE-009 | High | Org-unit update allows cycles and parents in **another tenant** (blocks the other org's deletes) |
| OT-014 | High | RLS on 17/83 tables, never forced; the API connects as a Postgres **superuser** |
| BE-008 | High | Invitations are never emailed — production invites can't be accepted |
| BE-001 / FE-005 | High | `GET /org-templates` 500s for everyone → signup "Template gallery" shows no templates |
| BE-026 | High | ~1 in 4 AI calls fail: key failover stops on a retired-model 404; fallback provider has no key |
| BE-027 / FE-012 | High | Board pack crashes (API/web contract drift) and the API returns no values |
| BE-028 / FE-013 | High | Live dashboard updates blocked by CORS (SSE `reply.hijack()` skips CORS headers) |
| FE-001 | High | Dashboard shows over-target "lower is better" KPIs as On track |
| BE-002 | High | Demo seed wires role inheritance backwards — Contributors get Department-Manager rights |
| OT-007 | High | CI has never passed (0/40 runs) — pnpm setup misconfigured; 21 PRs stuck |

### Suggested fix batches

1. **Security (before any deployment):**
   - BE-014: authenticate + org-scope the Jira webhook.
   - BE-007: email the reset link; never log the token.
   - BE-015: Slack — fail closed.
   - OT-013: upgrade Next.js, fastify, `@nestjs/platform-fastify`, nodemailer, OpenTelemetry; drop `bcrypt@5`.
   - BE-016: SSRF guard on all outbound fetches.
   - BE-010 + BE-017 + OT-009: rate limiting on by default, a real `trustProxy`, IP throttle on onboarding start / AI.
   - OT-014: connect as `kpi_app`, force RLS.
   - BE-009 + BE-021: validate referenced ids are in the caller's org; cycle checks.
   - OT-008: refuse fallback crypto keys in production.
2. **Broken features:**
   - BE-001 / FE-005 — fix the seed row and make `countPayload` defensive.
   - BE-008 — wire `EmailService` into invites.
   - BE-026 — key-level 404 handling, current model, keyed fallback, log provider errors.
   - BE-027 / FE-012 — board-pack contract + data.
   - BE-028 / FE-013 — CORS headers on SSE.
   - FE-001 — direction-aware status (chip `task_867fcaec` already queued).
   - BE-002 + BE-011 — seed roles.
   - BE-003 / BE-004 — enforce scopes consistently.
   - FE-006 — alert-rule management UI.
   - FE-009 — signed-out users → login.
   - FE-014 — page gating.
   - BE-018, BE-019.
3. **CI & tests:**
   - OT-007 — remove `version:` from `pnpm/action-setup`; add Postgres / Redis services + API boot to `web-e2e`.
   - OT-001 lint, OT-002, OT-006.
   - Update the ~16 stale E2E specs and the date-dependent one (see the frontend triage table).
   - FE-008.
4. **UX, consistency and docs:** remaining Medium / Low items — FE-002 permission editing, FE-007 terminology in nav, FE-010/011/015/016/017, BE-012/013/020/022/023/024/025, OT-003/004/005/011/012/015, and OT-016 (missing tenant FKs — do before any real tenant deletion).

## Fix log

Fixes land one finding at a time on `fix/full-audit`, each with a failing test first.

| Finding | Status | Commit | Regression test |
|---|---|---|---|
| BE-014 Jira webhook | ✅ fixed | `4263927` | `apps/api/test/integration/jira-webhook.spec.ts` (7) + `provider-handlers.spec.ts` |
| BE-015 Slack signature fail-open | ✅ fixed | `e46e7d1` | `slack-interactive.controller.spec.ts` (8) |
| BE-029 Slack `team.id` payload shape | ✅ fixed | `2f623e1` | `provider-handlers.spec.ts` |
| BE-007 reset link logged, not emailed + FE-018 no reset UI | ✅ fixed | `e39802f` | `test/integration/password-reset.spec.ts` (4), `password-reset.service.spec.ts` (4), `e2e/password-reset.spec.ts` (2) |
| BE-008 invitations never emailed | ✅ fixed | `7cc5a3a` | `test/integration/invitation-email.spec.ts` (2) |
| OT-013 vulnerable dependencies | ✅ fixed (2 unfixable prod-path items documented) | `d52b012` | `pnpm audit`, builds, unit + integration suites, 14 E2E specs |
| BE-016 SSRF | ✅ fixed | `da4340d` | `src/outbound/outbound-fetch.spec.ts` (41), `test/integration/ssrf-guard.spec.ts` (17) |
| OT-009 spoofable client IP / IP not recorded | ✅ fixed | `b541281` | `trust-proxy.spec.ts` (11), `auth.service.spec.ts`, `test/integration/client-ip.spec.ts` |
| BE-017 no brute-force protection by default | ✅ fixed | `fdcce5c` | `rate-limit-policy.spec.ts` (7), `rate-limit.guard.spec.ts` (4) + live check |
| BE-010 anonymous, unlimited onboarding LLM spend | ✅ fixed | `ab3bf7c` | `rate-limit-policy.spec.ts` (+3), `onboarding-ai.service.spec.ts` (4), `test/integration/rate-limit-service.spec.ts` (2) + live check |
| BE-009 org-unit cycles + cross-tenant parent/type/head (+ merge-into-descendant cycle) | ✅ fixed | `91de434` | `org-units.service.spec.ts` (+7) + live check |
| BE-021 cross-tenant references on tasks / comments / widgets | ✅ fixed | `842373e` | `assert-same-tenant.spec.ts` (2), `tasks.service.spec.ts` (+4), `comments.service.spec.ts` (+6), `widgets.service.spec.ts` (4) + live check |
| OT-008 public fallback secrets in production (+ embed/JWT secrets, + draft secret ignored .env) | ✅ fixed | `88844ca` | `config/secrets.spec.ts` (9) + live boot checks |
| BE-001 / FE-005 `/org-templates` 500 (legacy seed payload) | ✅ fixed | `c6875db` | `template-payload.spec.ts` (+3), seed run on scratch DB + live check |
| BE-028 / FE-013 SSE stream blocked by CORS | ✅ fixed | `8c0b96a` | `realtime.controller.spec.ts` (1) + live header check |
| BE-027 / FE-012 board pack: wrong shape, no values, crash | ✅ fixed | `5f46c1e` | `board-pack.service.spec.ts` (7, rewritten) + live API + browser check |
| FE-001 dashboard status ignored KPI direction (+ List widget; shared server rule with board pack) | ✅ fixed | `ba32638` | `kpi-health.spec.ts` (8), `board-pack.service.spec.ts` + integration perf + browser check |
| BE-026 AI calls failing on per-key 404; keyless fallbacks; invisible errors (+ public 503 leaked provider text) | ✅ fixed | `bf7bf12` | `gemini-failover.spec.ts` (+4), `ai-router.service.spec.ts` (+1), `ai-provider-registry.spec.ts` (4), `onboarding-ai.service.spec.ts` (+1) + 8-call live run |
| BE-002 + BE-011 seed roles: backwards inheritance, invalid permission keys (+ OBJECTIVES→OKRS scope) | ✅ fixed | `83376ae` | `packages/db/prisma/seed-roles.spec.ts` (24, mutation-checked), seed on scratch DB + dev repair + live check |
| BE-003 KPI SELF scope bypassed on detail/data/summary | ✅ fixed | `2494d15` | `kpi-visibility.spec.ts` (+4), `access-context.service.spec.ts` (+3) + live persona matrix |
| BE-004 (insights part) + BE-025 insights ignored KPI visibility; foreign-tenant generate | 🟡 partial / ✅ fixed | `5b8d913` | `insights.service.spec.ts` (+3), `insights.controller.spec.ts` (3) + live check |
| BE-018 /health hung on a frozen Redis (+ rate limiter hung every request) | ✅ fixed | `d6a01e7` | `health.controller.spec.ts` (+2), black-hole Redis test in `rate-limit-service.spec.ts` + live docker pause |
| BE-019 invalid cron → 500 + orphan row | ✅ fixed | `a5df263` | `cron.spec.ts` (14) + live check |
| FE-009 + FE-014 signed-out → /unauthorized; 12 ungated pages | ✅ fixed | `33ba4bb` | `auth-redirect.spec.ts` (13) + browser check |
| FE-006 alert rules unmanageable in the UI | ✅ fixed | `fafbffc` | `uc-alerts` e2e (now green end-to-end) + browser check |
| OT-001 lint errors | ✅ fixed | `51ef31c` | `pnpm turbo lint` (0 errors) |
| OT-002 contracts fixture drift | ✅ fixed | `a6afcd2` | `packages/contracts/src/access.spec.ts` (+2) |
| OT-006 integration specs pass silently without the API | ✅ fixed | `59039b2` | `test/integration/global-setup.ts` (run fails when API down) |
| FE-016 what-if unrounded delta | ✅ fixed | `0716970` | `delta.spec.ts` |
| FE-007 terminology never reaches nav | ✅ fixed | `39759ab` | `nav-terminology.spec.ts` (4) |
| FE-008 password accessible name (+ register helper text in label) | ✅ fixed | `0fb188f` | e2e `getByLabel('Password', { exact: true })` across 5 specs |
| FE-011 positions track (stale spec) + stale E2E specs; KPI short-name error hidden; seed template vocabulary; OKR / my-kpis test ids | ✅ fixed | `182acc2`, `d5aad1e`, `4a07d58` | full CI-mode Playwright run (0 retries) |
| OT-007 CI fresh-install failures | ✅ fixed — main CI `41874623263` and Security `41874623698` green on `d69c04e` | PRs #26, #28, #29, #27 | clean install/generation, billing unit + fresh-DB regression, 133 integrations, hosted 167 E2E + 8 expected skips |
| BE-012 threshold bands accept lower > upper | ✅ fixed | `e2edbc8` | `threshold-band.dto.spec.ts` (3), `kpi-threshold-bands.service.spec.ts` (+2) |
| BE-020 objective self/descendant parenting, inverted periods | ✅ fixed | `551dbc0` | `objectives.service.spec.ts` (+5) |
| FE-003 objectives in a parent cycle vanish from the OKR tree | ✅ fixed | `d50aefd` | `okr-tree.spec.ts` (4, mutation-checked) |
| BE-022 any member can change the org setup checklist | ✅ fixed | `27f936c` | `setup-checklist.controller.spec.ts` (2) |
| BE-006 platform-admin guard 403'd everyone (+ open bootstrap now opt-in) | ✅ fixed | `045fd45` | `platform-admin.guard.spec.ts` (5, no ALS context — as in production) |
| BE-005 Redis clients without error listeners | ✅ fixed | `db07e80` | `redis-error-logger.spec.ts` (2) |
| FE-015 My KPIs dev text; Record without KPI_DATA_ENTRY | ✅ fixed | `70bdaa7` | typecheck + e2e `user-kpi-views` |
| BE-023 unknown webhook events; javascript: plugin URLs | ✅ fixed | `6e449b7`, `b0f5cf7` | `webhooks.dto.spec.ts` (2), `plugin.dto.spec.ts` (2), integration `alerting` + `ssrf-guard` |
| FE-004 no 404 page / error boundaries | ✅ fixed | `470c5fd` | e2e `smoke` (+1) |
| FE-017 phone layout (sidebar never collapsed; widget page overflow) | ✅ fixed | `7ca23ed` | 375 px measurement + drawer/desktop browser check |
| BE-024 ML sidecar input validation + request-bound HMAC | ✅ fixed | `0c66ef8`, `d64ea98` | `test_validation.py` (10), `test_hmac.py` (rewritten), `ml-signature.spec.ts`, analytics specs (+2), live probe |
| OT-005 Prophet/ARIMA offered but not implemented | ✅ labelled "coming soon", then implemented (see OT-005 parts 1–2 below) | `6216b14` | typecheck |
| OT-015 demo seed recorded the newest value in the future | ✅ fixed | `f6f1411` | scratch-DB seed check + db tests (24) |
| FE-002 role permissions read-only, 7 missing (+ role escalation by non-admin ROLES_MANAGE; preset bypassed approval) | ✅ fixed | `e465594`, `4d51f7a` | `roles.service.spec.ts` (+8), `role-permissions.spec.ts` (5), e2e `roles-flow` (+1), live escalation matrix |
| OT-004 status docs contradict each other | ✅ fixed | `0b4c273` | — |
| OT-012 formula package / docs mismatch | ✅ fixed (docs) | `0b4c273` | — |
| OT-011 unpinned images (+ Postgres data never persisted — found when a recreate wiped the dev DB) | 🟡 partial (MinIO image unpullable; no deploy config) | `44676f2` | force-recreate keeps data; `compose config` valid |
| FE-010 org units shown as a flat list | ✅ fixed | `6f323e2` | `tree-order.spec.ts` (3), e2e org-units (7), nested-org screenshot |
| OT-018 tracing never started / recorded nothing | ✅ fixed | `d3f92b2` | live Jaeger check; API unit 1573 |
| OT-016 tenant tables without org FK (db push never created them) | ✅ fixed | `809c2a7` | scratch migrate deploy, FK enforcement + cascade checks, API unit/integration |
| BE-004 PEOPLE / ORG / ANALYTICS scopes enforced (+ search scope leak, benchmark KPI scope, cache invalidation) | ✅ fixed | `05ce2f3`..`5da1954` | access-context (+6), domain-visibility (+7), users (+6), org-units (+7), org-unit-kpis (+1), search (+3), analytics (+4), benchmarks (+1); integration `people-org-analytics-scope.spec.ts` (7) |
| BE-013 suspended user keeps a ≤15 min token | ✔ accepted (user decision) | — | — |
| Rate limit was per IP (org lookup read an empty context) | ✅ fixed — per user / API key, per IP without login | `7f34fe4` | policy + guard specs (+7), live budget check |
| AI defaults on retired / zero-quota models; thinking models truncated answers | ✅ fixed — tiered free Gemini models + reasoning budget | `25a445e` | gemini (+3), router (+2), default-config (+3), live 4-feature run |
| OT-011 MinIO image no longer pullable | ✅ fixed — SeaweedFS S3 gateway | `ee2c133` | SDK probe, scheduled-report integration (2), CSV download |
| OT-014 RLS not in effect — option A (hardened RLS): stage A policies + explicit contexts; stage B roles `kpi_app`/`kpi_system`, GUC bypass removed, every table covered, `KPIDataPoint` compression off + policy, API runs as `kpi_app` with transaction-local org (`RLS_ENFORCED`); stage C FORCE RLS, enforcement on in `.env.example` + CI | ✅ fixed | `ecc6d1f` `48b2281` `6cae9f4` `6df4028` `47cc0e8` `99ebe9b` `ad405fb` | `rls-enforcement.spec.ts` (11), `tenant-prisma.spec.ts` (11), `prisma.module.spec.ts` (2); unit 1634, integration 133, web e2e 167 — all with enforcement on |
| MV-001 ML HMAC bypass: a forged Host header made analytics routes look like `/health`, or verified a signature captured for another route | ✅ fixed | `7ce0d43` | `apps/ml/tests/test_hmac.py` (+11: five routes × two forged Hosts, cross-route replay, unusual-Host valid signature); live: 60 unsigned forged/plain-Host requests → 401 on native, container and `ENV=production` container; 36/36 signed probes; 7 API→ML browser cases |
| MV-002 BullMQ ignored the Redis URL database, username and `rediss://` TLS (API + worker) | ✅ fixed | `cfa77f2` | `redis-connection.spec.ts` in api (7) and worker (7); live: old build with `REDIS_URL=…/15` put 48 queue keys in db 0, fixed build puts all 58 in db 15 with db 0 empty; full integration 133 passed / 3 documented skips. TLS covered by unit tests only (no Upstash available) |
| MV-003 production-required `INTEGRATION_CRYPTO_KEY` missing from both env templates and the handoff; API template also lacked `BYO_ENCRYPTION_KEY` | ✅ fixed | `21857fe` | `env-template.spec.ts` (14: every production-enforced key in both templates); live: production-mode API boots with only the template-documented keys, and refuses without `INTEGRATION_CRYPTO_KEY` |
| MV-004 web app had no icon (`/favicon.ico` 404 was the only non-permission console error in the crawl) | ✅ fixed | `21857fe` | live: `link[rel=icon]` → `/icon.svg` 200; full crawl 332 visits, 0 runtime errors / error screens / overflow, only expected contributor 403 and anonymous 401 |
| OT-003 (part 1 of 2) queue processors could only run inside the API; `apps/worker` was a stub | ✅ fixed | `79c4a93` | `config/queue-workers.spec.ts` (7), `worker.module.spec.ts` (4: all 10 processors in the API by default, none with `RUN_QUEUE_WORKERS=false`, all 10 in `WorkerModule`); live split mode (API `RUN_QUEUE_WORKERS=false` + `dist/worker.js`): with no worker, jobs wait and no alert is raised; the worker drains them, holds the only worker on each of the 10 queues, and its `alert_triggered` reaches an SSE client on the API; a job queued while the worker is stopped (SIGTERM, clean exit) runs after restart; production-mode worker starts with real keys and refuses a dev-default secret before any processor starts; integration 133 passed / 3 documented skips; browser 174 passed (crawl opt-in skipped). CI reruns the queue specs in split mode |
| OT-003 (part 2 of 2) remove the `apps/worker` stub; docs, handoff and spec amended | ✅ fixed | `1b39aef` | frozen install + 28/28 uncached workspace tasks (1,669 API unit tests); default layout (`pnpm dev`, no flag) still runs every processor inside the API: one worker per queue, alerting + scheduled-report specs pass |
| DR-001 the 38 migrations did not reproduce `schema.prisma` (extra database defaults on `updatedAt` and array columns; no migration created `timescaledb`); production must use `migrate deploy` while dev used `db push` | ✅ fixed | `584aec0` | `packages/db/scripts/check-migrations.mjs` (red before the alignment migration, green after; runs in CI); schema dumps of a pushed and a migrated database match except the migration table, intentionally `NOT VALID` OT-016 keys and stricter `NOT NULL` arrays |
| DR-002 database setup was not re-runnable: after RLS, `compress = false` and `decompress_chunk` failed, so a second `db:setup` (and any redeploy) aborted | ✅ fixed | `584aec0`, `81e54ee` | `db-steps.spec.mjs` (4); live: `db:setup` twice, and the image's release on an empty, re-released and seeded database, all succeed |
| DR-003 a migrated database exposed `_prisma_migrations` to `kpi_app` / `kpi_system` (blanket grants, no RLS) | ✅ fixed | `81e54ee` | `rls-enforcement.spec.ts` (red on a migrated database, green after); live: `kpi_app` gets `permission denied` on the table |
| OT-011 (part 1 of 3) no deployable API/worker image or production database release | ✅ fixed | `b3aa0fb` | live from the image (`apps/api/Dockerfile`, 960 MB, non-root): release on an empty database, again, and after seeding; API (`RUN_QUEUE_WORKERS=false`, `RLS_ENFORCED=true`: requests as `kpi_app`, system work as `kpi_system`) + worker containers pass integration 133 passed / 3 documented skips in development mode, and in production mode fail only the 6 cases that need the dev-only invite token; CI now runs `db:release` twice plus the drift check, and builds the image |
| DR-004 the TimescaleDB image cannot initialise on a new Fly volume: the mount is root-owned, the image runs as `postgres` (reproduced: `mkdir … Permission denied`, crash loop) | ✅ fixed | `36e48bc` | `infra/fly/postgres` wrapper (`fly-entrypoint.sh` hands the mount to postgres, then `gosu`); live: first boot on a root-owned mount, restart keeps data, server runs as `postgres`; CI boots it on a root-owned directory |
| DR-005 the production schema owner would have been a superuser (the image's `POSTGRES_USER`), which bypasses RLS despite FORCE (`rls-policies.sql` requires otherwise) | ✅ fixed | `36e48bc` | first-boot script creates a non-superuser `kpi_nexus` owner, the database, extensions and runtime roles; role pinning only when drifted; live: release twice as that owner, integration 133 passed / 3 skipped with RLS enforced; an owner connection without RLS_ENFORCED fails closed (no rows) |
| DR-006 mail TLS: `SMTP_SECURE` was documented but ignored (`secure: false`), and the root template said `SMTP_PASSWORD` while the code reads `SMTP_PASS` (deploys would send unauthenticated) | ✅ fixed | `ff7dda1` | `email.service.spec.ts` (3), `env-template.spec.ts` reverse check (red on the old template) |
| OT-011 (part 2 of 3) Fly.io + Vercel config, manual release workflow, production rehearsal | ✅ fixed | `356518a` | `deploy-config.spec.ts` (34; fails on a broken process split or volume path); flags and keys checked against flyctl v0.5.7 source; rehearsal (`prod-rehearsal.compose.yml`, production mode, RLS enforced, non-superuser owner): integration 120 passed / 3 skipped, failing only the 6 dev-only invite-token cases; browser 160 passed, failing only 8 invite-token cases (all 17 tests in those specs pass with `NODE_ENV=development` on the same images); crawl 332 visits, 0 page errors / empty pages, only expected 403/401; ML 36/36 probes + forged-Host 401 + 7 browser cases; idle Redis about 1.3 M commands/day (Upstash free tier insufficient, see `infra/fly/README.md`) |
| OT-011 (part 3 of 3) close OT-011; closure ledger, handoff | ✅ fixed (config; no live deploy) | this PR | docs only; rollback of #52, #53 and this PR rehearsed in a temporary clone |
| ADR-001 the locked Fly.io + Upstash target cannot run for free (no Fly free tier; idle BullMQ needs about 1.3 M Redis commands a day against Upstash's 10k) | accepted (step 1 of 7) | this PR | ADR-001 signed off by the project owner; spec Appendix A #4, §10.2 and §10.3 carry amendment notes |
| ADR-001 step 2: images must run on the ARM VM, and a deploy needs to see which build is live | ✅ fixed | this PR | `health.controller.spec.ts` (version from `APP_VERSION`, else `dev`); CI builds the API, ML and Postgres images on native amd64 and arm64 runners, checks the image architecture and baked version, boots Postgres on a root-owned volume, runs the database release twice from the API image and gets ML `/health`; ML base image pinned by digest |
| ADR-001 step 3: no production stack for the VM (compose, HTTPS, backups) | ✅ fixed | this PR | `prod-compose.spec.ts` (19; each fails when a port is published, the API runs the processors, Redis may evict, or the Postgres volume path changes); rehearsal of `infra/prod` + `rehearsal.override.yml` from empty: release twice, `/health` through Caddy (HTTPS, `tls internal`) reports db/redis ok and the build version, HTTP redirects to HTTPS, a spoofed `X-Forwarded-For` through Caddy is ignored; integration 119 passed / 3 skipped (failing only the 6 invite-token cases and `client-ip`, which calls the API past the proxy); browser 159 passed (failing only the same 8 invite-token cases as #53); encrypted backup to the S3 stand-in, restore drill into a scratch database gives identical row counts; about 700 MiB used in total; ShellCheck clean |
| ADR-001 step 4: no automatic deploy; a bad build would need a manual fix | ✅ fixed | this PR | `deploy-sh.spec.ts` (6, red before `deploy.sh` existed: pull → release → up order, a failed release changes nothing, an unhealthy or stale build rolls back, a first deploy fails loudly, only commit SHAs accepted); `prod-compose.spec.ts` workflow checks (6); rehearsal against the real stack with a throwaway registry: a good build went live, a broken one rolled back by itself and the API kept serving; an older build's release runs on a newer schema; actionlint and ShellCheck clean |
| ADR-001 step 5: no repeatable VM setup or runbook | ✅ fixed | this PR | `bootstrap.sh` ran twice in a fresh `ubuntu:24.04` container (systemd stubbed, DuckDNS blocked locally): Docker 29.9 + Compose v5.7 installed, `deploy` user with a `restrict` key, SSH passwords off, token file root-only, cron for DuckDNS and the 03:30 backup; both compose setups validate under Compose v5.7; `prod-compose.spec.ts` bootstrap/runbook checks (4); CI now runs ShellCheck on every deploy and database-image script; `docs/deploy.md` covers the never-charged rules, setup, first deploy, day-to-day and recovery from backup |
| ADR-001 step 6: the superseded Fly.io config (#53) still in the tree | ✅ removed | this PR | `infra/fly/*.toml`, `infra/fly/README.md`, `release.yml`, the Fly rehearsal and `deploy-config.spec.ts` deleted; the Postgres image moved to `infra/prod/postgres` (entrypoint renamed) and still boots on a root-owned directory with a non-superuser owner and both extensions; its checks moved into `prod-compose.spec.ts`; `smol-toml` removed (lockfile: only its 9 lines; a frozen install passes); 1,721 API unit tests, ShellCheck and actionlint clean |
| ADR-001 step 7: closure ledger and handoff | ✅ done (config; not deployed live) | this PR | docs only; rollback of #55–#60 and this PR rehearsed in a temporary clone |
| OT-005 (part 1 of 2) Prophet could not run: prophet 1.1.6's bundled CmdStan is rejected by cmdstanpy 1.3, so `Prophet()` failed on construction (imports still succeeded) | ✅ fixed | this PR | `apps/ml/tests/test_prophet_compat.py` (red on 1.1.6, green on 1.5.0); prophet 1.5.0 keeps numpy 1.26.4 / pandas 2.2.3 / statsmodels 0.14.6; 62 ML tests pass on a fresh install; the ML image is built and health-checked on amd64 and arm64 by CI (integrates Dependabot #37) |
| OT-005 (part 2 of 2) Prophet / ARIMA were offered but disabled ("coming soon"); the sidecar ran every request as naive. The forecast also dated points by entry time (`recordedAt`), so a backfilled year looked like milliseconds | ✅ fixed | this PR | `apps/ml/tests/test_forecast_models.py` (13: both models run and report themselves, nested 80/95% bands, Prophet beats naive on a weekly pattern, ARIMA mean-reverts with widening bands, monthly/quarterly series continue on calendar dates, short/flat/undated series fall back to naive); `forecasts.service.spec.ts` (+3: period starts sent as timestamps, PROPHET/ARIMA saved, NAIVE saved on fallback); live on a disposable stack: 39/39 ML probes, 6/6 API→ML browser-suite API cases (incl. new Prophet and ARIMA), and the forecast page by hand: 24 monthly points → Prophet and ARIMA results dated 2027-01-01, 2027-02-01…, Model card PROPHET / ARIMA. 365 daily points: Prophet 1.1 s, ARIMA 3.0 s. The 4 page tests in `ai-analytics-ui.spec.ts` (incl. the new ARIMA one) could not run locally: Playwright has no browser build for Ubuntu 26.04, and CI does not start the ML sidecar, so they skip there |
| AN-001 anomaly detection, seasonality and what-if read the newest values by entry time (`recordedAt`), so a backfill entered out of order was analysed out of order (anomaly timestamps were entry times too) | ✅ fixed | #64 | `anomaly` / `seasonality` / `whatif` `.service.spec.ts` (+4, red first: order by `periodStart` then `recordedAt`; anomaly timestamps are period starts); live on a disposable stack with 2026 entered before 2025: what-if baseline = the twelve 2026 values, the zscore anomaly is the June 2025 point (index 5), seasonality trend rises 19 → 48. Other "latest value" reads (alerts, insights, dashboards, NLQ…) still use `recordedAt`; changing what "latest" means there is a separate product decision |
| AN-002 (part 1 of 4) a KPI's current value (dashboard summary → KPI list, reports, board pack, NLQ summary; LAST aggregation) and the outlier check's 30 prior values were the newest *entries* (`recordedAt`), so backfilling an old period replaced the current value. Decided: "latest" means the newest period | ✅ fixed | #65 | new `kpis/kpi-data.service.spec.ts` (3 tests, 2 red first: summary and outlier priors order by `periodStart` then `recordedAt`); live on a disposable seeded stack: posting a Jan 2024 value to Annual Recurring Revenue left `latestValue` at the Nov 2026 value (5,976,000), point count 12 → 13. Parts 2–4: dashboards outside the app, formula/OKR/bands, AI context. The NO_DATA alert stays on entry time (it measures reporting freshness) |
| AN-002 (part 2 of 4) dashboards seen outside the app — snapshots, public share links and KPI embeds (latest value and sparkline) — took the newest *entry* (`recordedAt`), so a backfilled old period showed as the current value | ✅ fixed | #66 | `snapshots` / `share-links` / `embed-token` `.service.spec.ts` (+3 assertions, red first: order by `periodStart` then `recordedAt`); live on a disposable seeded stack after posting a Jan 2024 value (−777): snapshot, public share link and embed all show the Nov 2026 value (498,000); the embed sparkline starts at the newest period. History-window clamps still filter on `recordedAt` (access rule, unchanged) |
| AN-002 (part 3 of 4) values that drive other values — the formula engine's source values, OKR key-result sync from a linked KPI, and the points threshold-band status is judged on — took the newest *entries* (`recordedAt`), so a backfilled old period changed formula results, KR progress and band status | ✅ fixed | #67 | new `calculation-engine/calculation-engine.service.spec.ts`, + `kpi-threshold-bands.service.spec.ts` (resolveStatus) and an assertion in `objectives.service.spec.ts` (3 red first: order by `periodStart` then `recordedAt`); live on a disposable seeded stack after Jan 2024 backfills: LTV:CAC recompute stayed 9.30 (LTV backfilled as 1), CAC band stayed Off Track (−1e9 backfilled; by entry time it would read On Track), an MRR-linked key result stayed 498,000 after sync (−424,242 backfilled) |
| AN-002 (part 4 of 4) AI context — the recent series behind insights, recommendations and NLQ trend lines — was the newest *entries* (`recordedAt`), so a backfilled old period was shown to the model as the latest value | ✅ fixed | #68 | `insights` / `recommendations` / `nlq` `.service.spec.ts` (+3 assertions, red first: order by `periodStart` then `recordedAt`); live on a disposable seeded stack with the mock provider (it echoes the prompt) after a Jan 2024 MRR backfill of −424,242: the insight reads "first -424242, last 498000" and the recommendation's oldest→newest series starts at −424,242. With this, every "latest value" read uses the newest period except the NO_DATA alert, which stays on entry time on purpose (it measures how recently data was reported) |
| DEP-001 the ML sidecar ran FastAPI 0.115.5 with Starlette 0.41.3, which has six known advisories (pip-audit: PYSEC-2026-248/249/1941/1942/2280/2281); Dependabot #11/#39 were deferred because Starlette 1.x rejects JSON sent without a Content-Type | ✅ fixed | #69 | FastAPI 0.162.0 (Starlette 1.10.0); pip-audit finds no Starlette advisories. `test_hmac.py` +2 (red first on 0.115.5: a signed request without Content-Type now gets 422; one labelled `application/json` gets 200). Accepted: both callers (`ml-client.service.ts`, `ml-probe.mjs`) always send `content-type: application/json` and the sidecar is internal only. 77/77 ML tests; live uvicorn on 0.162.0 passes 39/39 probe cases (`ml-probe.json` regenerated: timings and float noise only). The ML image itself is built by CI |
| FE-014 (verification) the 12 FE-014 pages: every one sends a user without access to /unauthorized, and the optional sections (`/alerts/new` channels, `/alerts/[id]` deliveries, `/roles` presets) skip their lookup. But 9 pages still ran their main loader before the gate redirected, so each visit drew a 403 from the api | ✅ fixed | #70 | new `e2e/gated-page-loads.spec.ts` (red first: an Employee's visit to `/alerts/channels` drew `403 GET /notification-channels`): each page's loader now waits for the same permission its gate checks. Live crawl on a disposable seeded stack: as `tom.becker@` and `greg.sullivan@`, all 9 pages redirect with no api call; as admin all 9 load with no failed call. `alerts-channels`, `p8-integrations`, `p9-polish` and `permission-nav` e2e (13) still pass |
| AI-001 onboarding co-pilot on real Gemini: the assistant returned an empty patch, because it calls providers directly and dropped the route's reasoning budget, so `gemini-3.5-flash` spent its 800-token answer budget thinking (764 of 800 tokens on a tiny draft) and the JSON came back cut off (107 chars). The generator lost its 4,096-token budget the same way | ✅ fixed | #71 | `onboarding-ai.service.spec.ts` +2 (red first: no `reasoningBudgetTokens` reached the provider): the co-pilot now passes the route's budget (assistant 2,048, generator 4,096), as the org-scoped AiRouter does. Live on a disposable stack with a real Gemini key: "Add a Quality Officer role" returns a complete patch (243 chars), as do a KPI add and an org rename (~2.5 s each; one call took 152 s on Gemini's side, still complete). Insights, recommendations, NLQ, KPI suggestions and generate also checked live |
| AI-002 onboarding co-pilot on real Gemini: AI-generated roles carried invented permission names (`all`, `view_clinical`, `kpi:read`) that were stored as-is, so every non-admin role in an AI-built org had no real access (the admin worked only through `isAdmin`; nothing treats `all` as a wildcard) | ✅ fixed | #72 | red first: `onboarding-ai.pure.spec.ts` (parser keeps only canonical keys), `template-payload.spec.ts` (+2: unknown permission is a validation problem) and `onboarding-ai.service.spec.ts` (generator and assistant prompts list the keys). The prompts now list the 25 keys, the parser drops anything else, and onboarding completion refuses a draft with an unknown permission (400 naming each one). Live with a real Gemini key: a hospital-network draft gave all 5 roles canonical permissions (e.g. Nurse Manager: KPI_VIEW, KPI_DATA_ENTRY, DASHBOARD_VIEW, ALERTS_VIEW, REPORTS_VIEW, ANALYTICS_VIEW), stored unchanged on completion; the assistant's "Quality Officer who can view KPIs and dashboards" gave KPI_VIEW + DASHBOARD_VIEW; a draft edited to hold `all` / `kpi:write` was refused at completion. 1,739 API unit tests pass |
| OT-017 (part 1) Windows launcher: on a fresh clone `start.ps1` would stop at step 4, because it never creates the `.env` files and `pnpm db:setup` runs `node --env-file=.env` (exit 9, `.env: not found`); the ML sidecar's `uvicorn --env-file .env` needs `apps/ml/.env` too | ✅ fixed (static; Windows cold run still pending) | this PR | new `config/windows-launcher.spec.ts` (6, red first): start.ps1 creates each missing `.env` (root, api, web, ml) from its `.env.example`, never overwriting, before db:setup and the sidecar. Not run on Windows: PowerShell isn't available here or in CI. Still to watch on the Windows run: `db:setup` probes Postgres for only 10 s after `docker compose up -d`, which a first-ever TimescaleDB start may exceed |

## Cleanup performed

- Deleted 277 test orgs (audit + E2E runs, incl. 3 from June) and 68 unclaimed onboarding drafts; removed the orphan rows they left in 31 FK-less tables (OT-016); reseeded `helios`.
- Backups taken first: `C:\work\FYP\khan\backups\kpi_nexus-2026-10-03-pre-audit-cleanup.dump` (and `…-pre-reseed.dump` from setup). Restore with `pg_restore --clean -d kpi_nexus`.

## Audit artefacts

| File | What |
|---|---|
| `api-routes.json` | static inventory of all 332 API routes (method, path, public flag, permissions, guards) |
| `api-sweep.json` | 610-request GET sweep across 5 personas |
| `api-crud.json` | 301 write-side / cross-tenant steps in two disposable orgs |
| `ml-probe.json` | ML sidecar edge cases + HMAC negatives |
| `frontend-crawl.md` / `.json` | 80 routes × 4 passes |

## Audit closure follow-up

See the [current reconciliation and evidence](closure-2026-11-06.md) for AC-001 (email rendering, `81ec98c`) and AC-002 (audit tooling, `54620c4`). Findings from the 2026-11-05 main verification are logged above as MV-00x. Set `AUDIT_OUTPUT_DIR` to a new scratch directory for fresh runs to preserve the October artifacts.
