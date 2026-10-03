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
| BE-007 reset link logged, not emailed + FE-018 no reset UI | ✅ fixed | _this commit_ | `test/integration/password-reset.spec.ts` (4), `password-reset.service.spec.ts` (4), `e2e/password-reset.spec.ts` (2) |

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
