# Sample Organization — "Northwind Software" (seed design spec)

A realistic **medium-sized B2B SaaS company** (~30 users, Series B) to populate the app with
believable structure + KPI data for demos, screenshots, and manual exploration. The seed author
must make this match the ACTUAL Prisma schema at `packages/db/prisma/schema.prisma` (read it fully;
field names/enums/required columns below are the design intent, NOT verbatim Prisma — reconcile).

Industry chosen: **B2B SaaS** (best fit for the KPI scope model + mirrors the design prototype's
"Northwind Inc." sample). If the schema requires an `industry`/`type`/`sizeTier`, use
"Software / SaaS", "B2B", size tier MEDIUM.

## Hard requirements (seed author)
- Home: `packages/db/prisma/seed.ts` (currently empty; run via `pnpm --filter @kpi-nexus/db prisma:seed`
  or `tsx prisma/seed.ts`). **Idempotent + non-destructive**: guard on org slug `northwind`; if it
  already exists, no-op (or upsert) — do NOT wipe other data, do NOT call migrate reset.
- Passwords: hash with the SAME algorithm the API uses (check `apps/api/src/auth/**` —
  bcrypt vs argon2 + cost). Every user logs in with demo password **`Password123!`**. The admin
  (CEO) email **`admin@northwind.io`** must work for login. Print a credentials summary at the end.
- Respect multi-tenancy: every tenant-scoped row gets `organizationId`. Respect required FKs,
  unique constraints (slug, email, etc.), and enum values that actually exist in the schema.
- KPI scope invariants: ORG_WIDE data points have no unit/user owner; PER_UNIT points carry
  `orgUnitId`; PER_USER points carry `userId` — match how `kpis.service` / `org-unit-kpis` /
  `user-kpis` services write data points + assignments (read those services to learn the shapes:
  `OrgUnitKPIAssignment`, `UserKPIAssignment`, `KPIDataPoint.orgUnitId/userId`).
- Data points: write directly via Prisma `createMany` (no quota/approval path). Use FIXED dates
  (no `Date.now()`), 12 monthly periods ending **2026-05** (i.e. 2025-06 … 2026-05), period
  start = `${m}-01`, end = `${m}-28`, recordedAt = end.
- TypeScript strict, no `any` without comment. Must `pnpm --filter @kpi-nexus/db typecheck` clean.

## 1. Organization
- name: **Northwind Software**, slug: `northwind`, currency USD, locale en-US, timezone
  America/New_York, weekStartsOn Monday, planKey: a real PlanKey enum value (PRO/BUSINESS if it
  exists, else FREE). Keep default terminology labels.

## 2. Roles (RBAC) — map to the 18 canonical permissions in packages/contracts/src/permissions.ts
Create with realistic permission sets + a `level` (lower = more senior) + a `color`:
| Role | isAdmin | level | Permissions |
|---|---|---|---|
| Administrator | true | 1 | (all 18 — admin bypass) |
| Executive | false | 2 | KPI_VIEW, DASHBOARD_VIEW, DASHBOARD_MANAGE, USERS_VIEW, GROUPS_VIEW, ALERTS_VIEW, REPORTS_VIEW, ANALYTICS_VIEW, INSIGHTS_VIEW |
| Department Manager | false | 3 | KPI_VIEW, KPI_CREATE, KPI_EDIT, KPI_DATA_ENTRY, DASHBOARD_VIEW, DASHBOARD_MANAGE, USERS_VIEW, GROUPS_VIEW, ALERTS_VIEW, REPORTS_VIEW, ANALYTICS_VIEW, INSIGHTS_VIEW |
| Senior Contributor | false | 4 | KPI_VIEW, KPI_CREATE, KPI_EDIT, KPI_DATA_ENTRY, DASHBOARD_VIEW, ALERTS_VIEW, REPORTS_VIEW, ANALYTICS_VIEW, INSIGHTS_VIEW |
| Analyst | false | 4 | KPI_VIEW, KPI_DATA_ENTRY, DASHBOARD_VIEW, REPORTS_VIEW, ANALYTICS_VIEW, INSIGHTS_VIEW |
| Contributor | false | 5 | KPI_VIEW, KPI_DATA_ENTRY, DASHBOARD_VIEW, ALERTS_VIEW |
| Viewer | false | 6 | KPI_VIEW, DASHBOARD_VIEW |

## 3. Org structure — dimension "Department" + an OrgUnitType (e.g. "Department"/"Team")
8 org units (one per department). If schema needs an OrgUnitType + OrgUnitDimension, create a
"Department" dimension and a "Department" type and attach. Set each unit's `headUserId` to its
manager (below). Units (code):
1. Executive (EXEC)
2. Engineering (ENG)
3. Sales (SALES)
4. Customer Success (CS)
5. Marketing (MKT)
6. Finance (FIN)
7. People & Culture (PPL)
8. Operations (OPS)

## 4. Positions (~14 job titles) — level + track (IC/MANAGEMENT/EXECUTIVE if enum exists)
CEO, COO, CFO (EXECUTIVE); VP Engineering, VP Sales (MANAGEMENT, exec-ish); Engineering Manager,
Sales Manager, Customer Success Lead, Marketing Manager, People Operations Manager, Operations
Manager (MANAGEMENT); Senior Software Engineer, Software Engineer, Account Executive, Customer
Success Manager, Finance Analyst, Operations Analyst, Recruiter, Content Marketer, Growth Marketer (IC).

## 5. Users — 30 total. password `Password123!`, status ACTIVE, emails @northwind.io
Each: fullName, email (first.last@northwind.io), role, position, orgUnit membership, managerId
(direct-report chain). Distribution (manager in **bold**):
- Executive: **Sara Chen** (CEO, Administrator), **Marcus Lee** (COO, Administrator), Diane Foster (CFO, Executive)
- Engineering (head: Priya Nair): **Priya Nair** (VP Engineering, Executive→reports to Sara), Devon Reyes (Engineering Manager, Department Manager→Priya), Aisha Khan, Tom Becker, Lin Zhao, Omar Farouk, Hannah Webb (engineers; Senior Software Engineer/Software Engineer; Senior Contributor/Contributor; →Devon)
- Sales (head: Greg Sullivan): **Greg Sullivan** (VP Sales, Executive→Marcus), Bianca Rossi (Sales Manager, Department Manager→Greg), Carlos Mendez, Nina Patel, Jake Turner, Sofia Alvarez (Account Executives, Contributor→Bianca)
- Customer Success (head: Maya Gupta): **Maya Gupta** (Customer Success Lead, Department Manager→Marcus), Leah Kim, Ryan O'Neil, Grace Park (CSMs, Contributor→Maya)
- Marketing (head: Felix Braun): **Felix Braun** (Marketing Manager, Department Manager→Marcus), Zoe Adler (Growth Marketer, Senior Contributor→Felix), Ivan Petrov (Content Marketer, Contributor→Felix)
- Finance (head: Diane Foster): Noah Bennett (Finance Analyst, Analyst→Diane), (Diane heads it)
- People & Culture (head: Rachel Green): **Rachel Green** (People Operations Manager, Department Manager→Marcus), Daniel Cruz (Recruiter, Contributor→Rachel)
- Operations (head: Victor Sng): **Victor Sng** (Operations Manager, Department Manager→Marcus), Emma Lewis (Operations Analyst, Analyst→Victor)
(Count: 3+7+6+4+3+1(Noah; Diane already counted)+2+2 = 30. Adjust to land EXACTLY 30 active users;
add/trim a CSM or engineer if the count is off. Use varied, realistic full names.)

## 6. KPI Categories (6)
Financial, Sales & Growth, Customer Success, Product & Engineering, People & Culture, Operations.
Give each a color + icon if the schema supports it + sortOrder.

## 7. KPIs (~22) — each: category, type, unit, direction, frequency MONTHLY (or as noted),
aggregationMethod (LAST for levels, SUM for counts, AVG for rates), status ACTIVE, owner (a sensible
user), targetValue, and 12 monthly data points with a believable trend. Also add 2–3 KPITarget rows
and threshold bands on the 3–4 headline KPIs if quick. Mark each KPI's intended health so the
generated latest value vs target lands on-track/at-risk/off-track as noted.

### ORG_WIDE (Financial + company-level) — owner exec; org-wide data points
| KPI | type | unit | dir | start→end (12mo trend) | target | health |
|---|---|---|---|---|---|---|
| Monthly Recurring Revenue | CURRENCY | USD | HIGHER | 210k → 285k (steady climb) | 300k | on-track |
| Annual Recurring Revenue | CURRENCY | USD | HIGHER | 2.52M → 3.42M | 3.6M | on-track |
| Net Revenue Retention | PERCENTAGE | % | HIGHER | 104 → 111 | 110 | on-track |
| Gross Logo Churn | PERCENTAGE | % | LOWER | 2.9 → 3.8 (creeping up) | 3.0 | off-track |
| Customer Acquisition Cost | CURRENCY | USD | LOWER | 980 → 1240 (rising) | 1000 | off-track |
| Net Promoter Score | NUMBER | pts | HIGHER | 44 → 52 | 50 | on-track |
| Monthly Burn Rate | CURRENCY | USD | LOWER | 420k → 380k (improving) | 400k | on-track |
| Cash Runway | NUMBER | months | HIGHER | 14 → 18 | 18 | on-track |

### PER_UNIT (assign KPI to the named org unit; data points carry orgUnitId)
| KPI | unit-of-org | type | unit | dir | trend | target | health |
|---|---|---|---|---|---|---|---|
| Sales Win Rate | Sales | PERCENTAGE | % | HIGHER | 22 → 26 | 28 | at-risk |
| Sales Cycle Length | Sales | NUMBER | days | LOWER | 30 → 34 (slowing) | 30 | at-risk |
| New Logos per Month | Sales | COUNT | logos | HIGHER | 18 → 24 | 25 | on-track |
| Pipeline Coverage | Sales | NUMBER | x | HIGHER | 2.8 → 3.4 | 3.0 | on-track |
| Customer Satisfaction (CSAT) | Customer Success | PERCENTAGE | % | HIGHER | 90 → 93 | 92 | on-track |
| Avg. Ticket Resolution | Customer Success | DURATION | hours | LOWER | 5.2 → 4.6 | 4.0 | at-risk |
| Deployment Frequency | Engineering | COUNT | deploys/wk | HIGHER | 8 → 14 | 12 | on-track |
| Change Lead Time | Engineering | DURATION | hours | LOWER | 30 → 22 | 24 | on-track |
| Production Incidents | Engineering | COUNT | incidents | LOWER | 6 → 3 | 4 | on-track |
| Uptime | Engineering | PERCENTAGE | % | HIGHER | 99.5 → 99.95 | 99.9 | on-track |
| Marketing Qualified Leads | Marketing | COUNT | MQLs | HIGHER | 320 → 410 | 400 | on-track |
| Website Conversion Rate | Marketing | PERCENTAGE | % | HIGHER | 2.1 → 2.6 | 3.0 | at-risk |

### PER_USER (assign to specific users; data points carry userId; respect isolation)
| KPI | scope-of | assignees | type | unit | dir | trend | target |
|---|---|---|---|---|---|---|---|
| Quota Attainment | the 4 Account Executives | PERCENTAGE | % | HIGHER | varies per AE (e.g. 85→104, 70→92, 95→112, 60→78) | 100 |
| Renewal Rate | the 3 CSMs | PERCENTAGE | % | HIGHER | varies (88→95, 91→97, 84→90) | 95 |
| Pull Requests Merged | the 5 engineers | COUNT | PRs | HIGHER | varies (8→14 etc., monthly) | 12 |
| Onboarding Completion | the 3 CSMs | PERCENTAGE | % | HIGHER | varies | 90 |

## 8. Optional extras if quick (don't block on these)
- A shared org Dashboard "Company Overview" (isShared, isDefault) with a few widgets
  (kpi_card for MRR/NRR/Churn, a line for MRR trend) referencing seeded KPIs.
- 2–3 alert rules on Gross Logo Churn / CAC (STATIC_THRESHOLD) — only if the AlertRule shape is simple.
- A couple of KPITemplate-instantiated or KPICategory colors for visual polish.

## 9. Output
After seeding, print to stdout: org id/slug, counts (roles, positions, units, users, categories,
KPIs, assignments, data points), and the login line: `admin@northwind.io / Password123!`. Write a
summary to `docs/design-reference/SAMPLE-ORG-RESULT.md` (what was created + counts + how to run +
how to log in + any schema deviations).
