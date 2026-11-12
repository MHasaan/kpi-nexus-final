# Session handoff — resume here (updated 2026-11-11)

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
| `apps/web` | Next.js 15.5.27 (App Router) |
| `apps/api` | NestJS 11 on Fastify 5, Prisma 6 |
| Queue worker | Built from `apps/api` as `dist/worker.js`: the 10 BullMQ processors, no HTTP. The API runs them itself unless `RUN_QUEUE_WORKERS=false`; production runs the worker as its own process (OT-003). |
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
   uv venv apps/ml/.venv --python 3.12 --python-preference only-managed
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

The initial review set contains 21 Dependabot PRs (#1–#24). Live dispositions and merge evidence belong in the integration ledger. Several are majors that need separate migration work:

- zod 3→4
- eslint 9→10
- TypeScript 5→6
- vitest coverage 1→4
- @types/node 20→25
- numpy 1→2, pandas 2→3
- python 3.12→3.14 (the ML venv is pinned `<3.13`)

The review integrated original #3/#10/#7 and handled checkout #5 with replacement #30. Superseded and deferred PRs remain open. FastAPI #11 was trialled but deferred: fresh resolution selects Starlette 1.10, and a previously accepted signed JSON request without Content-Type changes from 200 to 422. All 49 ML tests passed, and the normal API client supplies Content-Type, so this is a conservative framework/contract scope decision rather than a proven outage. A constrained compatibility alternative still needs a separate review.

---

## 6. Next steps (in order)

Main `8f9b0cc` has the audit closure (#35), the 2026-11-11 fixes (#45–#48), the separate worker (#50, #51), the deploy config (#52, #53) and free-tier hosting (#55–#60, ADR-001). Take the remaining work one item at a time, each with its own plan, an isolated trial, exact-head CI/Security, a merge commit, resulting-main checks and a recorded rollback. Test on disposable infrastructure only; never touch the development database.

0. **Go live (the owner's step; needs accounts).** Follow [docs/deploy.md](docs/deploy.md): Oracle Free Tier VM (never upgraded), DuckDNS, Brevo, Object Storage, the four GitHub secrets, first deploy (make the three GHCR packages public), Vercel, then its *Check it* list including a backup restore drill. The config is done and rehearsed ([ADR-001](docs/adrs/ADR-001-free-tier-hosting.md), #55–#60); nothing has run on a real VM yet.
1. **"Latest value" = newest period (AN-002) — done.** Every read of a KPI's latest or recent values orders by `periodStart`, entry time breaking ties (OT-005, AN-001, AN-002 parts 1–4). The NO_DATA alert stays on entry time on purpose: it measures how recently data was reported. History-window limits still filter on `recordedAt` (an access rule).
2. **FastAPI/Starlette upgrade (DEP-001) — done.** FastAPI 0.162.0 / Starlette 1.10.0 clears the Starlette advisories. JSON sent to the ML sidecar must carry `content-type: application/json` (422 otherwise); the API's ML client always sends it.
3. **FE-014 verification — done.** All 12 pages send users without access to /unauthorized without calling the api; optional sections skip lookups the user can't make (`e2e/gated-page-loads.spec.ts`).
4. **Real-provider AI check — done.** Insights, recommendations, NLQ, KPI suggestions and onboarding generate work on real Gemini; the assistant's cut-off replies are fixed (AI-001). AI-generated roles now use only the canonical permission keys (AI-002). Gemini calls now time out after 60 s and fall back (AI-003).
5. **Windows launcher (OT-017).** `start.ps1` now creates missing `.env` files from the templates (OT-017 part 1). Still needs a cold run of `setupScripts/start.cmd` on Windows; watch whether `db:setup`'s 10 s Postgres probe is long enough on a first start.

Deferred dependency majors (Zod 4, ESLint 10, TypeScript 6, Vitest 4, Node types, Next 16, Prisma 7, NestJS 12, OpenTelemetry, pandas 3/NumPy 2, Python 3.14, gitleaks-action 3) stay open until their own migration rounds. Keep the `docs/audit/README.md` fix log and this file current as items close.

---

## 7. Git state at hand-off

- `main` is the default branch on GitHub and the only trunk. `master` was deleted on 2026-11-04, locally and on GitHub, after confirming it equalled `main`.
- Every work branch (`feat/*`, `phase/p1..p9`, `fix/full-audit`) is fully merged into `main` and pushed to origin. Nothing exists only on the old machine. These branches are historical; deleting them later is safe.
- The initial 21 Dependabot PRs were retargeted from `master` to `main` before `master` was deleted. Follow the approved integration ledger for current dispositions; superseded and major-migration PRs remain unmerged (§5c).
- To start on a new machine: `git clone https://github.com/MHasaan/kpi-nexus-final.git`. That checks out `main`.
- Commit messages follow conventional commits with the finding ID, e.g. `fix(api): … (OT-007)`.

The current audit closure branch tracks the October finding dispositions and fresh verification in [the audit closure ledger](docs/audit/closure-2026-11-06.md). Email and audit tooling repairs have separate commits. The Chrome crawl covered 83 routes across four personas and led to separate frontend repairs. The draft PR tracks hosted gates for the final revision.
