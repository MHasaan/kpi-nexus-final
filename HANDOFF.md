# Session handoff — resume here (updated 2026-11-17)

This file lets a new Claude Code session, on any computer, carry on exactly where the last one stopped. Read it top to bottom once. Then work from **§6 Next steps**.

> **Branch:** `main` is the only branch you need and GitHub's default. `master` was deleted on 2026-11-04 after everything was merged into `main`. Use `main` as the base; perform the approved integration review on isolated `codex/` branches.

---

## 1. The project and the problem

- **Product:** KPI Nexus Final is a multi-tenant KPI / OKR SaaS. It is the student's FYP.
- **Location:** this machine has three copies under `C:\work\FYP\khan\`. They are three successive versions:
  - `KPI_NEXUS orignal` is the first build.
  - `KPI_NEXUS` is the first rebuild attempt.
  - `KPI_NEXUS_Final` is the current version. It is this repo. It is the only one being worked on.
- **Build status:** all ten build phases (P0–P9) are done and tagged `v1.0.0`. See `ROADMAP.md`.
- **What the sessions did:**
  1. Got the stack running locally.
  2. Ran a **full audit**: report only, backend → frontend → everything else.
  3. **Fixed the findings one at a time.** Each fix was test-first and got its own commit plus a row in the fix log.
  - Branch: `fix/full-audit`, now merged into `master`/`main`.
- **The user's working rules for this work:**
  - One finding at a time, with a failing test first (TDD).
  - Commit per fix.
  - Record each fix in `docs/audit/README.md` → **Fix log**: finding → status → commit → regression test.
  - Never mark a finding fixed without a regression test **and** a live check.
  - Test orgs may be created and deleted freely. Reseed `helios` afterwards.
  - Ask before anything destructive to the dev DB. Take a `pg_dump` first; backups are in `C:\work\FYP\khan\backups\`.

### Stack

| Layer | Detail |
|---|---|
| Monorepo | pnpm 9.15 + Turborepo |
| `apps/web` | Next.js 16 + React 19 (App Router) |
| `apps/api` | NestJS 12 on Fastify 5, Prisma 7 (`@prisma/adapter-pg`), Zod 4, TypeScript 6 |
| Queue worker | Built from `apps/api` as `dist/worker.js`: the 13 BullMQ processors, no HTTP. The API runs them itself unless `RUN_QUEUE_WORKERS=false`; production runs the worker as its own process (OT-003). |
| `apps/ml` | FastAPI on Python 3.14, venv via `uv` |
| packages | `ai`, `contracts`, `db` (Prisma schema, seed, SQL), `formula` (empty stub), `ui`, `config` |
| Infra (`infra/docker/docker-compose.yml`) | Postgres 16 + TimescaleDB (`timescaledb-ha`), Redis 7, MailHog, Jaeger, SeaweedFS (S3 on :9000; replaced MinIO) |

Locked architecture decisions are in `CLAUDE.md` and spec Appendix A. Don't change them without an ADR and the user's sign-off.

---

## 2. Setting up on a new computer

Secrets and the database are **not** in git. A fresh clone needs the steps below.

1. **Prerequisites:** Docker Desktop, Node 22, pnpm 9.15 (`corepack enable`), `uv` (https://docs.astral.sh/uv/), git, gh.
2. **Clone:** `git clone https://github.com/MHasaan/kpi-nexus-final.git`, then `git checkout main`.
   - **Updating an older checkout instead?** `apps/worker` was removed in #51, but git leaves its ignored files behind (`dist`, `node_modules`, `.env`, `tsconfig.tsbuildinfo`). Nothing uses them; remove the folder with `git clean -fdX apps/worker`.
3. **Env files:** create each one from its template.
   - `.env` ← `.env.example`
   - `apps/api/.env` ← `apps/api/.env.example`
   - `apps/web/.env` ← `apps/web/.env.example`
   - `apps/ml/.env` ← `apps/ml/.env.example`
   - `packages/db/.env` has no template. A copy of `DATABASE_URL` from `.env` is enough.

   Then check these values:
   - **Use `127.0.0.1`, never `localhost`.** Docker Desktop publishes container ports on IPv4 only, and Prisma resolves `localhost` to `::1` without falling back. The result is `P1001: Can't reach database server`.
   - **Real secrets the user must bring over by hand:**
     - `GEMINI_API_KEYS`: comma-separated free-tier keys.
     - `BYO_ENCRYPTION_KEY`, `JWT_SECRET`, `ML_SIDECAR_HMAC_SECRET`. The last must be **identical** in `apps/api/.env` and `apps/ml/.env`.
     - For production also `INTEGRATION_CRYPTO_KEY` (64 hex chars, `openssl rand -hex 32`): the API refuses to boot without it. Locally it may stay empty.
     - Optional `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`.
     - Development fallbacks are fine locally. Production refuses them (OT-008).
   - **RLS (OT-014):**
     - Keep `RLS_ENFORCED=true`.
     - Set `DATABASE_URL_APP` (role `kpi_app`) and `DATABASE_URL_SYSTEM` (role `kpi_system`) as in the template.
     - `DATABASE_URL` is the owner role. Only migrations, setup and seed use it.
   - **Local-only relaxations** that the old machine had in `apps/api/.env`, so E2E and manual testing don't hit 429s:
     - `RATE_LIMIT_AUTH_PER_MIN=1000`
     - `RATE_LIMIT_ORG_PER_MIN=100000`
     - `RATE_LIMIT_LOGIN_PER_ACCOUNT=100`
   - **Other variables to know:**
     - `WEB_APP_URL=http://127.0.0.1:3000` builds links in reset and invite emails.
     - `TRUST_PROXY`: leave unset locally.
     - `OUTBOUND_ALLOWED_HOSTS`: the SSRF allow-list. Leave empty locally, or set it to e.g. `127.0.0.1` to test webhooks against a local receiver.
     - S3 / SMTP settings point at SeaweedFS (:9000) and MailHog (:1025, UI :8025).
4. **Bring the stack up:**
   ```bash
   pnpm install
   pnpm docker:up
   pnpm db:setup
   pnpm --filter @kpi-nexus/db exec prisma db seed
   ```
   - `db:setup` runs prisma generate and `db push`, creates the hypertables and CAGGs, creates the `kpi_app` / `kpi_system` roles, and applies `rls-policies.sql`. It is non-destructive.
   - The seed creates the `helios` demo org. Its dates are anchored to the current month (`SEED_ANCHOR`).
   - **Never run `prisma migrate dev`.** The project is provisioned with `db push`, so `migrate dev` reports false drift and offers to wipe the DB.
5. **ML venv:**
   ```bash
   uv venv apps/ml/.venv --python 3.14 --python-preference only-managed
   uv pip install --python apps/ml/.venv/Scripts/python.exe -r apps/ml/requirements.txt
   ```
   An MSYS/MinGW `python` on PATH cannot install the numpy or prophet wheels. Use the uv-managed CPython.
6. **Run:**
   - Run everything at once with `setupScripts/start.cmd`: Docker → install → infra → DB → ML window → `pnpm dev`.
   - Or run each part separately:
     - API: `pnpm --filter @kpi-nexus/api dev` (:4000)
     - Web: `pnpm --filter @kpi-nexus/web dev` (:3000)
     - Worker (optional): the API runs the queue processors by default. To split them out as production does, set `RUN_QUEUE_WORKERS=false` for the API and run `pnpm --filter @kpi-nexus/api dev:worker`.
     - ML: `apps/ml/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir apps/ml --env-file apps/ml/.env --host 127.0.0.1 --port 8000`
7. **Log in:** go to http://127.0.0.1:3000 and sign in as `admin@helios.io` / `Password123!`. Other seeded personas are listed in `packages/db/prisma/seed.ts`.
8. **Health checks:**
   - `GET :4000/health` should report db, redis and ml all up.
   - `GET :8000/health`.
   - Jaeger UI is on :16686 and MailHog on :8025.

**Production deploy and rehearsal:** [docs/deploy.md](docs/deploy.md) is the free-hosting runbook (ADR-001): one-time setup, first deploy, rollback and recovery. `infra/prod/rehearsal.override.yml` runs the production stack locally (steps at the top of the file).

**Not portable:** `setupScripts/hmm.txt` is a personal note, and `.remember/` is plugin memory. Neither matters for the code. The DB backups in `C:\work\FYP\khan\backups\` exist only on the old machine.

---

## 3. Audit — method and tools

All audit docs are in `docs/audit/`:

- `README.md`: summary, severity scale, suggested batches, **Fix log**, cleanup, artefact list.
- `backend.md` (BE-nnn), `frontend.md` (FE-nnn), `other.md` (OT-nnn): one section per finding with repro, expected vs actual, evidence and location. Fixed ones are marked `✅ FIXED (commit)`.
- JSON artefacts: `api-routes.json` (332 routes), `api-sweep.json` (610 GETs × 5 personas), `api-crud.json` (301 write / cross-tenant steps), `ml-probe.json`, `frontend-crawl.md/.json` (80 routes × 4 passes).

Re-run the tools with the stack up and `helios` seeded:

```bash
node scripts/audit/api-routes.mjs                             # static route inventory
node --env-file=.env scripts/audit/api-sweep.mjs              # live GET sweep, 5 personas
node --env-file=.env scripts/audit/api-crud.mjs [domain ...]  # write-side cycles in 2 throwaway audit-* orgs
node --env-file=apps/ml/.env scripts/audit/ml-probe.mjs       # ML sidecar edge cases + HMAC negatives
AUDIT_CRAWL=1 CRAWL_PASSES=4 pnpm --filter @kpi-nexus/web exec playwright test e2e/audit/page-crawl.spec.ts
```

**Totals:** 62 findings (3 Critical · 16 High · 18 Medium · 24 Low · 1 Info) and 59 distinct problems. Later fixing surfaced extra items: BE-029, FE-018, OT-018, the per-IP rate-limit bug, and the AI model defaults.

---

## 4. What has been done

The full table, with commit and regression test for every finding, is **`docs/audit/README.md` → Fix log**. It is the source of truth. In short:

- **Security, all fixed:**
  - Jira webhook auth (BE-014).
  - Slack signature fails closed (BE-015/029).
  - Password reset emailed, with a reset UI (BE-007/FE-018).
  - Invitations emailed (BE-008).
  - Dependency upgrades (OT-013).
  - SSRF guard on every outbound fetch (BE-016).
  - TRUST_PROXY (OT-009).
  - Rate limiting on by default: per user / API key, per IP when anonymous, per account on login, plus onboarding budgets (BE-017/BE-010).
  - Cross-tenant reference checks (BE-009/BE-021).
  - Production refuses fallback secrets (OT-008).
  - **Hardened RLS** (OT-014): roles `kpi_app`/`kpi_system`, FORCE RLS on every tenant table, and the API serves as `kpi_app`.
  - Tenant FKs (OT-016).
  - Scopes enforced: KPI SELF (BE-003); PEOPLE / ORG / ANALYTICS (BE-004).
  - Role escalation closed (FE-002).
- **Broken features, fixed:**
  - Templates (BE-001).
  - Board pack (BE-027).
  - SSE CORS / live updates (BE-028).
  - Direction-aware KPI status (FE-001).
  - AI failover and model defaults (BE-026 plus the tiered Gemini models).
  - Seed roles (BE-002/011).
  - /health on a frozen Redis (BE-018).
  - Cron validation (BE-019).
  - Auth redirects and page gating (FE-009/014).
  - Alert-rule UI (FE-006).
  - Org-unit tree (FE-010).
  - Tracing (OT-018).
  - S3 moved to SeaweedFS (OT-011).
- **Tests, CI and lint:**
  - Lint is clean (OT-001).
  - Contracts drift (OT-002), silent integration passes (OT-006), and stale E2E specs (FE-011) are fixed.
  - The CI workflow was rewritten; fresh-install gaps were subsequently fixed and verified on GitHub (OT-007, see §5).
- **UX and docs:** FE-003/004/007/008/015/016/017, BE-005/006/012/020/022/023/024, and OT-004/005/012/015.
- **"Not built" items, all built (2026-11-13 → 11-16, #94–#114):** onboarding co-pilot rail and draft offline / resume (FE-020/021); NLQ tool loop (BE-033); per-user analytics point scope and the `forecast_kpi` tool (BE-034/035); data corrections with history (BE-037), saved views (FE-022), KPI watches (BE-038), snapshots (BE-039); OpenAPI document + `packages/sdk` (BE-040); Teams Adaptive Cards (BE-041); Slack `/kpi` with account linking (BE-042); the shared UI library in `packages/ui` with Storybook (FE-023); `KPI.allowNegative` enforced (BE-043). Privacy leaks found and fixed on the way: NLQ trend (BE-032, #100), analytics points (BE-034, #102), the realtime stream (BE-036, #104), personal watch notices (#107).
- **Suite counts at the last full run (2026-11-16), with RLS enforced:**
  - API unit: 1896
  - Web unit: 150; `packages/ui`: 33
  - Web E2E: 177 in hosted CI
  - API integration: green in hosted CI
  - ML pytest: all green
  - Typecheck and lint: clean
- **Cleanup:**
  - Deleted 277 test orgs and 68 stale onboarding drafts.
  - Reseeded `helios`.
  - Backups are in `C:\work\FYP\khan\backups\` (old machine): `…pre-audit-cleanup`, `…pre-reseed`, `…helios-reseed`, `…pre-ot016`, `…pre-rls-stageB`.

---

## 5. What is left — exact current state

Only the owner's steps are left: the Windows launcher cold run (OT-017) and go-live (§6, step 0). Beyond the audit, some original phase-plan items were built only in part, never built or never measured (e.g. GDPR data export, Slack / Jira OAuth, p95 benchmarks, axe / Lighthouse gates). Each unticked box in `TODOS.md` says which (DOC-007); none is scheduled. Every code item in `TODOS.md`'s "Not built" section is done (§4). The AWS KMS item is "won't do" while hosting must stay free.


Linux startup was verified on Ubuntu 26.04 using application commit `9684888`, Node 22.23.4, pnpm 9.15.0, and Python 3.12.15. A disposable Compose project provided fresh volumes and separate ports. The API booted with RLS enabled, and the web, worker, and ML services started. The fresh database regression, two scheduled report tests, worker echo job, 49 ML tests, and eight browser tests passed. AI calls used the mock fixture.

Playwright's bundled Chromium installer rejected Ubuntu 26.04. The browser checks used installed Google Chrome through an ignored local Playwright config. Logs are in `.cache/linux-startup/` on this machine. OT-017 still needs a Windows launcher run.

### 5a. ✅ CI baseline repaired and verified on main (2026-11-05)

Main `d69c04e` passes hosted CI run [41874623263](https://github.com/MHasaan/kpi-nexus-final/actions/runs/41874623263) and Security [41874623698](https://github.com/MHasaan/kpi-nexus-final/actions/runs/41874623698).

Separate reversible prerequisite PRs:
- #26: generate Prisma client before Node matrix checks.
- #28: start pinned S3 gateway for report integration tests.
- #29: pin browser job to supported Ubuntu 24.04 (Playwright 1.60 rejects Ubuntu 26.04).
- #27: initialize global Plan catalog under explicit system context, preserving request-role read-only RLS and tenant context. A dedicated fresh-DB regression runs before normal integrations.

Hosted integrations: 133 pass / 3 intentional alerting skips; browser suite: 167 pass / 8 expected skips without ML sidecar. Separate isolated local run with ML: 174 browser tests pass / one opt-in audit-crawler skip, zero retries. Expected negative-test RLS errors in database logs are not failures and must not lead to weakening policies.

Verified code main `be6cde1` passes CI41904500906 and Security41904501094. The safe branch review integrated checkout v7 (#30), CodeQL v4 (#31), dotenv 1.2.2 (#32), and statsmodels 0.14.6 (#33) after the prerequisites. See [the integration ledger](docs/audit/branch-review-2026-11-05.md) for exact commits, checks, all branch dispositions, rollback commands, and final verification. No major migration or database-schema change was accepted.

### 5b. Open or partial findings

| ID | State | What's left |
|---|---|---|
| OT-007 | ✅ fixed | Green main CI/Security, §5a |
| OT-011 | ✅ config (not deployed) | API/worker image and production database release (#52); the Fly.io config (#53) was replaced by free hosting on an Oracle Always Free VM ([ADR-001](docs/adrs/ADR-001-free-tier-hosting.md), #55–#59). Never deployed live; see [docs/deploy.md](docs/deploy.md). |
| OT-003 | ✅ fixed | Queue processors run in a separate worker process (`dist/worker.js`, same build as the API); `RUN_QUEUE_WORKERS=false` takes them out of the API. The `apps/worker` stub is removed. |
| OT-017 | open (Info) | `setupScripts/start.ps1` has never been cold-run end to end. Doing that on the new computer is a good real test. |
| BE-004 | ✅ | The insights part was fixed earlier; the PEOPLE / ORG / ANALYTICS part followed in `05ce2f3..5da1954`. The 🟡 on the insights row is historical. |
| BE-013 | ✔ accepted | A suspended user keeps a ≤15-minute access token. The user decided to accept this. |
| OT-005 | ✅ fixed (2026-11-12) | Prophet and ARIMA forecasts are implemented and selectable (prophet 1.5.0, #62, and the forecast PR). Short, flat or undated series run naive and say so. |
| OT-013 residue | unfixable | `deepmerge-ts` (via Prisma) and `braces` (via tailwind) audit items have no upstream fix yet. Re-check with `pnpm audit --prod`. |
| OT-010 | ✅ | Git history is clean of secrets. Verified; no action needed. |
| MV-001..MV-004 | ✅ fixed (2026-11-11) | ML HMAC Host bypass (#45), BullMQ Redis URL (#46), env templates + app icon (#47); plus in-major security patches (#48). See [the closure follow-up](docs/audit/closure-2026-11-06.md#follow-up--2026-11-11-main-verification-findings-closed). |

### 5c. Dependabot

The initial review set contained 21 Dependabot PRs (#1–#24). Live dispositions and merge evidence are in [the integration ledger](docs/audit/branch-review-2026-11-05.md) and the DEP-nnn rows of the fix log.

Every major once deferred here has since landed, each in its own PR: Zod 4 (DEP-009), ESLint 10 (DEP-007), TypeScript 6 (DEP-006), Vitest 4 (DEP-008), `@types/node` 22 to match the Node 22 runtime instead of 25 (DEP-005), NumPy 2 / pandas 3 (DEP-014), Python 3.14 (DEP-015), FastAPI 0.162 / Starlette 1.10 (DEP-001), plus Prisma 7, NestJS 12 and Next 16 / React 19 (DEP-010, DEP-012, DEP-013).

The original Dependabot PRs for those (#1, #2, #4, #5, #6, #15–#20) are still open because Dependabot PRs are never closed or deleted; they are superseded, not pending work.

---

## 5d. UI completion round (started 2026-11-16) — where it stands

The owner asked for every page and every option to work end to end, from sign-up to daily use. The findings are in [ui-verification-plan-2026-11-16.md](docs/audit/ui-verification-plan-2026-11-16.md) and [qa-report-2026-11-17.md](docs/audit/qa-report-2026-11-17.md); the work is [2026-11-16-ui-completion.md](docs/superpowers/plans/2026-11-16-ui-completion.md), nine batches. The open-findings table in [docs/audit/README.md](docs/audit/README.md) is the live list.

| Batch | What | State |
|---|---|---|
| 0 | Shared pieces: confirm dialog, toasts, labels, async-data hook, approval-pending notice, e2e org helper | ✅ merged (#120–#124, #136) |
| 1 | Wrong numbers: period window, newest value, one health rule on the home page, dashboard data provider, sparklines | ✅ merged (#137–#141) |
| 2 | Per-unit and per-person KPIs, people: assignments API and tab, record form, unit KPI panel, `PATCH /users/:id`, invite lifecycle, `/users` edit and lifecycle actions, `/team` | ✅ merged (#142–#158) |
| 3 | Sign-up and onboarding: one sign-up path, dead invite links, per-person tour, `/signup`, the draft schema, organisation settings / unit KPIs / team / finish touches in `complete`, the real checklist, and the six-step wizard with quick vs full and the AI rail | ✅ merged (#159–#182) |
| 4 | Features offered that did not work: live refresh (#183), automations (#184), approvals inbox (#185), role changes under approval (#186), std-dev / rate-of-change / composite alert rules (#187) and the rule form's recipients (#188), Activity and Strategy-map widgets (#189), the public share page (#190), channel test and editing (#193), forecast says which model ran (#197), insights replace (#198) | ✅ built; #183 and #184 merged, the rest waiting their turn in the chain |
| 5 | Reachability and permissions: links (#194–#196), app frame (#201), dead ends (#202), names without the people list (#203), the whole page ↔ API permission table (#199, #205–#209, #211–#215), seeded role scopes (#216) | ✅ built, in the chain. Left: a search in the people pickers for readers without `USERS_VIEW` (Low) |
| 6 | Settings that save but change nothing; the real Integrations connect form | ✅ built, except SSO and custom domains: billing (#235–#237), audit log (#238), AI settings (#239, #240, #250), small settings (#241), password maximum age and rules (#243, #244), retention purging — off until an administrator turns it on (#246), fiscal calendar and week start (#247–#249), personal language and timezone (#251, #253), formats (#252, #257), branding (#254), notification preferences (#255), Integrations connect form (#256). Left: branded sign-in pages and emails (6.3), period labels on the board pack and reports (6.4), connector edit and run result (6.10). Waiting for the owner: 6.8 SSO (ADR-002), 6.9 custom domains (ADR-003) |
| 7 | Safety and polish, one pattern at a time: confirmations (#217, #218, #220), failures shown (#221), names not codes (#222), clearable KPI fields (#223), alerts paging (#224), mentions (#225), comments (#226), task quick-add (#227), ask for a recommendation (#228), form checks (#230), test ids on real controls (#231), busy state on submit (#233), connector KPI chooser (#234), global search keys (#245), one health rule on the KPI page (#258), the task button (#259), labels keep acronyms (#260) | 🟡 most built. Left from the per-page list (7.7): thresholds colour and labels, cascade method and weight, target types, activity filter, `/ask` follow-ups, MFA QR code, session "this device", share-link expiry, role rename and member count, org-unit and position edit, and the Low findings still listed as open in docs/audit/README.md |
| 8 | Click-through and regression net | 🟡 the crawl criterion is met (crawl 6, below). Not done: a click-through spec for every remaining control (each PR in this round added the spec for what it changed; the audit plan's "Check" lines were not walked one by one), one run of the AI pages with a real key, and `docs/design/frontend-requirements/*` |

**Found and fixed on the way (2026-11-17):** BE-047 — a public share link sent the newest value of a KPI from *any* unit or person (#191); BE-048 — a dashboard snapshot froze the same (#192). Both now read organisation-level rows only. Snapshots taken before #192 are not rewritten: one taken of a board with a per-unit or per-person KPI may still hold such a value.

**Signed off by the owner on 2026-11-17 and built:** forecast and what-if use `ANALYTICS_FORECAST` (#211, with a migration that gives the key to the roles that could forecast before); anomalies use `ANALYTICS_VIEW` (#212); scheduled reports are managed with `REPORTS_MANAGE` (#213, with a migration — asked for by the owner — that keeps the key only on roles that also hold `ORG_SETTINGS`, so nobody gains it; administrators grant it from the Roles page).

**Still waiting for the owner:** ADR-002 (SSO without WorkOS) and ADR-003 (custom domains) for plan items 6.8 and 6.9. Retention (6.7) is decided and built (#246): the owner chose, on 2026-11-18, that a period purges only after an administrator turns purging on for it — every existing policy stays off. Whether the default Manager role for *new* organisations should keep `REPORTS_MANAGE` (it lists it; existing organisations' Manager roles lost it in #213's migration).

**End-of-batch crawl (2026-11-17, 84 routes × 4 passes, on the tip of the chain):** no regression. Three rows improved (`/approvals` as a contributor; `/team` and `/users/[id]` signed out). Twenty warnings remain, all of the Batch 5 kind (a page asks the API before its gate, or needs names it may not list).

**Crawl 5 (2026-11-17, same routes, on the tip of the chain before #232):** 13 warning rows, down from 18, no failures. Eleven were pages that asked the API before their permission check finished (16 refused requests as a contributor) and two were requests made while signed out; #232 holds those requests back. 

**Crawl 6 (2026-11-18, same routes, on the tip of the chain at #260):** no failures, and no request refused for a contributor on any page. One warning row is left: signed out, `/dashboard` asks who is signed in and gets a 401 before going to the sign-in page.

Also open from the QA pass: 1.6 (one KPI health rule on the KPI page too, and the KPI form writing threshold bands) and 0.7 (developer experience).

**Decisions the owner made for this round** (do not re-ask): settings that save but do nothing are each made to work; the wizard gets real manual steps; Integrations gets a real per-provider connect form; std-dev and rate-of-change alert rules and the Activity and Strategy-map widgets are all built; only `/signup` is kept (`/register` redirects).

**How the PRs are merged.** One finding per PR; test commit, then the change, then a docs commit adding the fix-log row. Every PR adds a row at the same place in `docs/audit/README.md`, so independent branches always conflict there. Since #154 the open PRs are one **chain**: each branch is based on the one before it, all target `main`. Merge them strictly in number order (#185 … #228, then any later ones), each with `gh pr merge N --merge --match-head-commit <full sha>` once its own checks are green and `main`'s CI is green after the previous merge. Merged in order, no branch needs a rebase and its head — the one CI ran on — never changes. Merging one out of order would pull the earlier ones in with it: don't. Rollback of any one is `git revert -m 1 <its merge commit>`.

**Three things learnt while stacking (2026-11-17).** (1) Run the whole web e2e suite before pushing a change to shared UI — a new sidebar link broke an older spec's selector and nine stacked PRs went red. (2) A fix to an earlier PR in the chain changes every later commit id, so fix-log rows cite the PR number, not a commit. (3) In e2e specs use retrying assertions, never a one-shot `count()`: a permission-guarded button appears a moment after the content it sits in.

**The throwaway stack** (`.cache/uiwalk/`, compose project `kpi-uiwalk`, Postgres on 25432) is what all of this is tested on; see the memory note "Local disposable stack". Its `env.sh` mirrors CI's raised onboarding rate limits — without them the e2e suite trips the 10-per-hour sign-up limit. Unit suites must be run in a shell that has **not** sourced that `env.sh`: its mock AI keys and SMTP settings fail four environment-sensitive specs.

## 6. Next steps (in order)

Main `8ba3770` (2026-11-16) adds every "Not built" item (#94–#114, §4). Before that, main `8f9b0cc` had the audit closure (#35), the 2026-11-11 fixes (#45–#48), the separate worker (#50, #51), the deploy config (#52, #53) and free-tier hosting (#55–#60, ADR-001). Take the remaining work one item at a time, each with its own plan, an isolated trial, exact-head CI/Security, a merge commit, resulting-main checks and a recorded rollback. Test on disposable infrastructure only; never touch the development database.

0. **Go live (the owner's step; needs accounts).** Follow [docs/deploy.md](docs/deploy.md): Oracle Free Tier VM (never upgraded), DuckDNS, Brevo, Object Storage, the four GitHub secrets, first deploy (make the three GHCR packages public), Vercel, then its *Check it* list including a backup restore drill. The config is done and rehearsed ([ADR-001](docs/adrs/ADR-001-free-tier-hosting.md), #55–#60); nothing has run on a real VM yet.
1. **"Latest value" = newest period (AN-002) — done.** Every read of a KPI's latest or recent values orders by `periodStart`, entry time breaking ties (OT-005, AN-001, AN-002 parts 1–4). The NO_DATA alert stays on entry time on purpose: it measures how recently data was reported. History-window limits still filter on `recordedAt` (an access rule).
2. **FastAPI/Starlette upgrade (DEP-001) — done.** FastAPI 0.162.0 / Starlette 1.10.0 clears the Starlette advisories. JSON sent to the ML sidecar must carry `content-type: application/json` (422 otherwise); the API's ML client always sends it.
3. **FE-014 verification — done.** All 12 pages send users without access to /unauthorized without calling the api; optional sections skip lookups the user can't make (`e2e/gated-page-loads.spec.ts`).
4. **Real-provider AI check — done.** Insights, recommendations, NLQ, KPI suggestions and onboarding generate work on real Gemini; the assistant's cut-off replies are fixed (AI-001). AI-generated roles now use only the canonical permission keys (AI-002). Gemini calls now time out after 60 s and fall back (AI-003).
5. **Windows launcher (OT-017).** `start.ps1` now creates missing `.env` files from the templates (OT-017 part 1). Still needs a cold run of `setupScripts/start.cmd` on Windows; watch whether `db:setup`'s 10 s Postgres probe is long enough on a first start.

The dependency majors once deferred here have since landed (Zod 4, ESLint 10, TypeScript 6, Vitest 4, Next 16, Prisma 7, NestJS 12, OpenTelemetry, pandas 3 / NumPy 2, Python 3.14, gitleaks-action 3); `@types/node` stays on 22 to match the Node 22 runtime. Dependabot PRs are never closed or deleted. Keep the `docs/audit/README.md` fix log and this file current as items close.

---

## 7. Git state at hand-off

- `main` is the default branch on GitHub and the only trunk. `master` was deleted on 2026-11-04, locally and on GitHub, after confirming it equalled `main`.
- Every work branch (`feat/*`, `phase/p1..p9`, `fix/full-audit`) is fully merged into `main` and pushed to origin. Nothing exists only on the old machine. These branches are historical; deleting them later is safe.
- The initial 21 Dependabot PRs were retargeted from `master` to `main` before `master` was deleted. Follow the approved integration ledger for current dispositions; superseded and major-migration PRs remain unmerged (§5c).
- To start on a new machine: `git clone https://github.com/MHasaan/kpi-nexus-final.git`. That checks out `main`.
- Commit messages follow conventional commits with the finding ID, e.g. `fix(api): … (OT-007)`.

The current audit closure branch tracks the October finding dispositions and fresh verification in [the audit closure ledger](docs/audit/closure-2026-11-06.md). Email and audit tooling repairs have separate commits. The Chrome crawl covered 83 routes across four personas and led to separate frontend repairs. The draft PR tracks hosted gates for the final revision.
