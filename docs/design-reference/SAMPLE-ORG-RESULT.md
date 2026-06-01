# Sample Organization — Northwind Software (seed result)

**Status: ✅ Authored, typecheck-clean, run LIVE, idempotency + login verified (2026-06-01).**

The seed lives at `packages/db/prisma/seed.ts`. It is idempotent (guards on org slug
`northwind`) and non-destructive (never wipes other orgs, never resets).

## How to run

```bash
# 1. Postgres up (docker compose) on localhost:5432/kpi_nexus — already running.
# 2. Migrations applied (npx prisma migrate deploy from packages/db) — already are.
# 3. Seed:
pnpm --filter @kpi-nexus/db prisma:seed
#   or: cd packages/db && npx tsx prisma/seed.ts
```

A second run prints `Org "northwind" already exists … Idempotent no-op.` and changes nothing.

## How to log in

- Web app (`apps/web`, http://localhost:3000) → `/login`. API on :4000.
- **admin@northwind.io / Password123!** (Administrator) — verified live: `POST /auth/login` → **HTTP 200** + JWT.
- **sara.chen@northwind.io / Password123!** (CEO / Administrator).
- **Every** seeded user uses **Password123!**. Org slug: **northwind**.
- Hash is bcrypt `$2b$`, cost 12 — same algorithm+cost as the API
  (`apps/api/src/auth/auth.service.ts`), so login's `bcrypt.compare` succeeds.

## What was created (LIVE counts, verified via Prisma)

| Entity | Count |
|---|---|
| Organization | 1 — Northwind Software (B2B SaaS, MEDIUM, USD, America/New_York, week starts Mon) |
| Roles | 7 — Administrator, Executive, Department Manager, Senior Contributor, Analyst, Contributor, Viewer |
| Positions | 20 — CEO/COO/CFO, VPs, managers, ICs (track IC/MANAGEMENT/EXECUTIVE) |
| Org-unit dimension + type | 1 "Department" dimension + 1 "Department" type |
| Org units | 8 — Executive, Engineering, Sales, Customer Success, Marketing, Finance, People & Culture, Operations (each has a head + members) |
| Org-unit members | 30 (the 30 named staff; the admin alias is not a unit member) |
| Users | 31 — 30 named staff (manager→report chain) + 1 `admin@northwind.io` alias; all ACTIVE |
| KPI categories | 6 — Financial, Sales & Growth, Customer Success, Product & Engineering, People & Culture, Operations |
| KPIs | 24 — **8 ORG_WIDE**, **12 PER_UNIT**, **4 PER_USER** |
| KPI targets | 24 (one STATIC KPITarget per KPI) |
| Org-unit KPI assignments | 12 (one per PER_UNIT KPI, with currentValue) |
| Per-user KPI assignments | 17 (Quota×5 AEs, Renewal×3 CSMs, PRs×6 engineers, Onboarding×3 CSMs) |
| KPI data points | **444** — 12 monthly points (2025-06 … 2026-05) per series. Scope-routed: **ORG_WIDE 96, PER_UNIT 144, PER_USER 204** |
| Threshold bands | 12 (Off Track / At Risk / On Track on MRR, NRR, Gross Logo Churn, CAC) |
| Alert rules | 2 (STATIC_THRESHOLD on Gross Logo Churn >3.0% HIGH, CAC >$1,000 MEDIUM) |
| Dashboards | 1 — "Company Overview" (shared + default) with 5 widgets (4 kpi_card + 1 line) |

### KPIs by scope
- **ORG_WIDE** (8): Monthly Recurring Revenue, Annual Recurring Revenue, Net Revenue Retention,
  Gross Logo Churn, Customer Acquisition Cost, Net Promoter Score, Monthly Burn Rate, Cash Runway.
- **PER_UNIT** (12): Sales Win Rate, Sales Cycle Length, New Logos/Month, Pipeline Coverage (Sales);
  CSAT, Avg. Ticket Resolution (Customer Success); Deployment Frequency, Change Lead Time,
  Production Incidents, Uptime (Engineering); Marketing Qualified Leads, Website Conversion Rate (Marketing).
- **PER_USER** (4): Quota Attainment (5 AEs), Renewal Rate (3 CSMs), Pull Requests Merged
  (6 engineers), Onboarding Completion (3 CSMs) — each assignee has their OWN isolated data points
  (carrying `userId`), honouring the per-user isolation invariant.

Trends/targets are tuned so headline KPIs land on a believable mix of on-track / at-risk /
off-track vs target (MRR on-track 210k→285k toward 300k; Gross Logo Churn off-track 2.9→3.8 vs 3.0;
CAC off-track 980→1240 vs 1000; Win Rate at-risk 22→26 vs 28; etc.). Series are deterministic
(fixed dates, index-based sinusoidal wobble; no `Date.now`/`Math.random`).

## Deviations from the original spec
- **Users = 31, not 30**: 30 named staff + 1 dedicated `admin@northwind.io` login alias (so the
  documented admin login works alongside the realistic CEO account `sara.chen@northwind.io`).
- Two staff added beyond the first draft to reach 30 and enrich per-user data: Maria Santos
  (Account Executive) and Kevin Wu (Senior Software Engineer).
- `planKey` set to `ENTERPRISE` (the schema's default; `Plan` rows aren't seeded — billing reads a default).
- `OrgUnit` has no `sortOrder` column (it lives on `OrgUnitType`); units are declared in display order.
- Password is a single pre-computed bcrypt hash constant (the `packages/db` workspace has no bcrypt
  dependency; the API owns it). Regenerate via the comment in `seed.ts` if the password changes.

## Verification performed (2026-06-01, live)
- `pnpm --filter @kpi-nexus/db typecheck` → exit 0.
- `npx tsx prisma/seed.ts` → ran clean, printed the counts above.
- Re-ran → idempotent no-op (exit 0).
- Prisma counts confirmed exactly as tabulated; data-point scope split 96/144/204 = 444.
- **Live API login**: `POST http://localhost:4000/auth/login` with `admin@northwind.io` / `Password123!`
  → **HTTP 200** with a valid admin JWT (`adm:true`). bcrypt.compare succeeds.

## Files
- Seed: `packages/db/prisma/seed.ts`
- Spec: `docs/design-reference/SAMPLE-ORG-SPEC.md`
- This result: `docs/design-reference/SAMPLE-ORG-RESULT.md`
