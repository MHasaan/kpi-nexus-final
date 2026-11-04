# Session handoff — resume here (written 2026-11-04)

This file lets a new Claude Code session, on any computer, carry on exactly where the last one stopped. Read it top to bottom once. Then work from **§6 Next steps**.

> **Branch:** `main` is the only branch you need and GitHub's default. `master` was deleted on 2026-11-04 after everything was merged into `main`. Work on `main`.

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
| `apps/web` | Next.js 15.5.27 (App Router) |
| `apps/api` | NestJS 11 on Fastify 5, Prisma 6 |
| `apps/worker` | BullMQ. It is a stub; the processors really run inside the api (OT-003). |
| `apps/ml` | FastAPI on Python 3.12, venv via `uv` |
| packages | `ai`, `contracts`, `db` (Prisma schema, seed, SQL), `formula` (empty stub), `ui`, `config` |
| Infra (`infra/docker/docker-compose.yml`) | Postgres 16 + TimescaleDB (`timescaledb-ha`), Redis 7, MailHog, Jaeger, SeaweedFS (S3 on :9000; replaced MinIO) |

Locked architecture decisions are in `CLAUDE.md` and spec Appendix A. Don't change them without an ADR and the user's sign-off.

---

## 2. Setting up on a new computer

Secrets and the database are **not** in git. A fresh clone needs the steps below.

1. **Prerequisites:** Docker Desktop, Node 22, pnpm 9.15 (`corepack enable`), `uv` (https://docs.astral.sh/uv/), git, gh.
2. **Clone:** `git clone https://github.com/MHasaan/kpi-nexus-final.git`, then `git checkout main`.
3. **Env files:** create each one from its template.
   - `.env` ← `.env.example`
   - `apps/api/.env` ← `apps/api/.env.example`
   - `apps/web/.env` ← `apps/web/.env.example`
   - `apps/worker/.env` ← `apps/worker/.env.example`
   - `apps/ml/.env` ← `apps/ml/.env.example`
   - `packages/db/.env` has no template. A copy of `DATABASE_URL` from `.env` is enough.

   Then check these values:
   - **Use `127.0.0.1`, never `localhost`.** Docker Desktop publishes container ports on IPv4 only, and Prisma resolves `localhost` to `::1` without falling back. The result is `P1001: Can't reach database server`.
   - **Real secrets the user must bring over by hand:**
     - `GEMINI_API_KEYS`: comma-separated free-tier keys.
     - `BYO_ENCRYPTION_KEY`, `JWT_SECRET`, `ML_SIDECAR_HMAC_SECRET`. The last must be **identical** in `apps/api/.env` and `apps/ml/.env`.
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
   uv venv apps/ml/.venv --python 3.12 --python-preference only-managed
   uv pip install --python apps/ml/.venv/Scripts/python.exe -r apps/ml/requirements.txt
   ```
   An MSYS/MinGW `python` on PATH cannot install the numpy or prophet wheels. Use the uv-managed CPython.
6. **Run:**
   - Run everything at once with `setupScripts/start.cmd`: Docker → install → infra → DB → ML window → `pnpm dev`.
   - Or run each part separately:
     - API: `pnpm --filter @kpi-nexus/api dev` (:4000)
     - Web: `pnpm --filter @kpi-nexus/web dev` (:3000)
     - Worker: `pnpm --filter @kpi-nexus/worker dev`
     - ML: `apps/ml/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir apps/ml --env-file apps/ml/.env --host 127.0.0.1 --port 8000`
7. **Log in:** go to http://127.0.0.1:3000 and sign in as `admin@helios.io` / `Password123!`. Other seeded personas are listed in `packages/db/prisma/seed.ts`.
8. **Health checks:**
   - `GET :4000/health` should report db, redis and ml all up.
   - `GET :8000/health`.
   - Jaeger UI is on :16686 and MailHog on :8025.

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
  - The CI workflow was rewritten (OT-007; still failing on GitHub, see §5).
- **UX and docs:** FE-003/004/007/008/015/016/017, BE-005/006/012/020/022/023/024, and OT-004/005/012/015.
- **Local suite counts at the last full run, with RLS enforced:**
  - API unit: 1634
  - API integration: 133
  - Web E2E: 167
  - ML pytest: all green
  - Typecheck and lint: clean
- **Cleanup:**
  - Deleted 277 test orgs and 68 stale onboarding drafts.
  - Reseeded `helios`.
  - Backups are in `C:\work\FYP\khan\backups\` (old machine): `…pre-audit-cleanup`, `…pre-reseed`, `…helios-reseed`, `…pre-ot016`, `…pre-rls-stageB`.

---

## 5. What is left — exact current state

### 5a. 🔴 CI fails on GitHub (top priority — OT-007 is not actually closed)

The first GitHub run after the merge failed: run `41755807565` on `master`, 2026-11-04. `lint` and `ml-pytest` pass. `test`, `build` and `web-e2e` fail. Locally everything passes, because the local machine has a generated Prisma client and an already-populated `Plan` table. CI starts from nothing. There are two root causes:

1. **`test` and `build` jobs: Prisma client never generated.** `packages/db/src/index.ts` fails with `TS2305: Module "@prisma/client" has no exported member 'ScheduledReport' / 'AlertRule' / …`. Those matrix jobs (`.github/workflows/ci.yml`, the `node` job running `pnpm turbo ${{ matrix.task }}`) run `pnpm install` then turbo, with no `prisma generate`. There is no `postinstall` hook either.
   - **Fix options:**
     - Add a `- run: pnpm db:generate` step after install in the `node` job.
     - Or make turbo `test`/`build`/`typecheck` depend on `@kpi-nexus/db#db:generate` (there's a `db:generate` task in `turbo.json`).
     - Or add `"postinstall": "prisma generate"` to `packages/db`.
2. **`web-e2e` job → API integration tests: 21 failures, all from `POST /kpis` returning 500.** The Postgres log shows `new row violates row-level security policy for table "Plan"`.
   - **Cause:** `BillingService.seedIfEmpty()` (`apps/api/src/billing/billing.service.ts:42`) lazily inserts the global plan catalog on first use. It runs inside a request as `kpi_app`, but `rls-policies.sql:219-221` only grants `plan_read FOR SELECT`. On a fresh DB the table is empty, so the insert is denied. Locally the catalog was seeded before RLS was enforced.
   - **Fix options:**
     - Run the plan seed under the system / bypass context (`kpi_system`; see how OT-014 handled other global writes in commit `47cc0e8`).
     - Or seed `Plan` in `scripts/setup-db.mjs` / `seed.ts` as the owner and drop the lazy insert.
   - **Regression test:** an integration test against an empty `Plan` table. To reproduce locally: `TRUNCATE "Plan"`, restart the API, then `POST /kpis`.
   - **Also in the same CI log, check after fixing:**
     - `new row violates row-level security policy` for `"User"`, `"KPIDataPoint"`, `"KPITemplate"`
     - `permission denied for view kpi_data_daily`

     These may be negative tests that expect a denial, or more fresh-DB-only gaps in `kpi_app` grants and policies on CAGG views. Compare against a local run on a **fresh** DB (`docker compose down -v` on a scratch copy, or a second database) before deciding.
   - **How to verify:** push to `main`, then `gh run list --limit 3` and `gh run view <id> --log-failed`. Only mark OT-007 ✅ when a GitHub run is green.

Also failing, separately: the weekly **Security** workflow on `master` has failed every week since September. It has not been investigated yet. Run `gh run view <id> --log-failed` on the latest `Security` run.

### 5b. Open or partial findings

| ID | State | What's left |
|---|---|---|
| OT-007 | ❌ reopened | §5a |
| OT-011 | 🟡 partial | Images pinned, data volume fixed, SeaweedFS in place. **No deploy config:** `infra/fly/` and `infra/github/` are empty, but the README promises Fly.io / Vercel. Either write it or fix the README. |
| OT-003 | open (Medium) | `apps/worker` is a stub; all 10 BullMQ processors run inside the api. Either move them, or document that the api is the worker. This is a product / architecture choice, so ask the user. |
| OT-017 | open (Info) | `setupScripts/start.ps1` has never been cold-run end to end. Doing that on the new computer is a good real test. |
| BE-004 | ✅ | The insights part was fixed earlier; the PEOPLE / ORG / ANALYTICS part followed in `05ce2f3..5da1954`. The 🟡 on the insights row is historical. |
| BE-013 | ✔ accepted | A suspended user keeps a ≤15-minute access token. The user decided to accept this. |
| OT-005 | labelled | Prophet / ARIMA show as "coming soon"; only naive forecasting exists. Implementing them is a product choice. |
| OT-013 residue | unfixable | `deepmerge-ts` (via Prisma) and `braces` (via tailwind) audit items have no upstream fix yet. Re-check with `pnpm audit --prod`. |
| OT-010 | ✅ | Git history is clean of secrets. Verified; no action needed. |

### 5c. Dependabot

There are 21 open Dependabot PRs (#1–#24). **None are merged on purpose.** Several are majors that need real migration work:

- zod 3→4
- eslint 9→10
- TypeScript 5→6
- vitest coverage 1→4
- @types/node 20→25
- numpy 1→2, pandas 2→3
- python 3.12→3.14 (the ML venv is pinned `<3.13`)

GitHub Actions bumps (checkout / setup-node / upload-artifact / codeql / pnpm-action) are mostly safe. The CI file already uses checkout@v7 / setup-node@v7 / pnpm action-setup@v6, so several of these PRs may be obsolete; close them. Do this **after** CI is green, so each bump gets a real CI signal.

---

## 6. Next steps (in order)

1. Fix CI §5a.1: Prisma generate in the `node` job. Push, then confirm `test` and `build` go green.
2. Fix CI §5a.2: Plan catalog seeding under RLS. Test first; reproduce on a fresh DB. Then triage the other fresh-DB RLS / grant errors from the same log. Push, confirm `web-e2e` is green, and mark OT-007 ✅ in the fix log with the green run id.
3. Investigate the failing weekly `Security` workflow.
4. Triage the Dependabot PRs: close the obsolete ones, merge the safe ones one at a time behind green CI, and plan the majors.
5. Cold-run `setupScripts/start.cmd` on the new computer (OT-017). Fix whatever breaks.
6. Decisions to ask the user about: OT-011 deploy target (Fly.io? Vercel?), OT-003 worker split, OT-005 Prophet / ARIMA.
7. Keep `docs/audit/README.md` fix log and this file up to date as items close.

---

## 7. Git state at hand-off

- `main` is the default branch on GitHub and the only trunk. `master` was deleted on 2026-11-04, locally and on GitHub, after confirming it equalled `main`.
- Every work branch (`feat/*`, `phase/p1..p9`, `fix/full-audit`) is fully merged into `main` and pushed to origin. Nothing exists only on the old machine. These branches are historical; deleting them later is safe.
- The 21 open Dependabot PRs were retargeted from `master` to `main` before `master` was deleted. They are still unmerged on purpose (§5c).
- To start on a new machine: `git clone https://github.com/MHasaan/kpi-nexus-final.git`. That checks out `main`.
- Commit messages follow conventional commits with the finding ID, e.g. `fix(api): … (OT-007)`.
