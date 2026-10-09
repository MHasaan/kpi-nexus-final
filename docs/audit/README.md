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
| OT-007 CI never passed | ✅ fixed locally (awaiting first GitHub run) | `0f405ae` | lint / typecheck / test / build + e2e run in CI mode; `ai-mock-fixture.spec.ts` (3) |
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
| OT-005 Prophet/ARIMA offered but not implemented | ✅ labelled "coming soon" | `6216b14` | typecheck |
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
| OT-014 RLS not in effect — **stage A**: policies on all 73 tenant tables + every no-context path given an explicit context (+ lost password-reset audit events) | 🟡 partial (stages B/C pending, see other.md) | `ecc6d1f` | `rls-enforcement.spec.ts` (+3), `tenancy/pre-tenant-lookups.spec.ts` (7), `permissions.guard.spec.ts` (+1), `audit.service.spec.ts` (3), auth/sso/mfa/password-reset specs (+4), fresh `db:setup` + live check |

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
