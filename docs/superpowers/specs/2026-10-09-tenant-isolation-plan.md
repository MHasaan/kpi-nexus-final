# Tenant data isolation — plan for OT-014 stages B/C

**Status:** option A chosen by the user and **implemented** (2026-10-09), stages B and C, enforcement on by default. Time-series choice: (b) — compression off on `KPIDataPoint` + a normal policy. Details, commits and test evidence: [audit OT-014](../../audit/other.md). The "Where things stand" section below describes the situation before the work.

## Goal

Every organisation's data must be private to that organisation, even if application code has a bug. Today isolation rests on one layer: every query in the API adds `where organizationId = <my org>`. The audit found three places where that layer failed (BE-009, BE-014, BE-021). The design spec (locked decision #3) calls for three layers: request context, query filters, and **Postgres row-level security (RLS)** as the database-level safety net.

## Where things stand

- **Stage A is done (no behaviour change):** RLS policies exist on all 73 tenant tables; every code path that ran without a tenant context now sets one explicitly.
- **Not in effect:** the API connects as `kpi_nexus`, a Postgres superuser, which ignores RLS. RLS is enabled on 17 tables (from the original migrations) and forced on none.
- **The time-series table `KPIDataPoint` and its five rollup views (`kpi_data_*`) cannot use RLS:** TimescaleDB refuses compression on a table with row security, and materialized views cannot carry policies.

## Threat model — what each layer stops

| Threat | Query filters (today) | RLS (shared tables) | Separate schema / database per org |
|---|---|---|---|
| A query that forgets `where organizationId` (the audit's bugs) | ✗ leaks | ✓ blocked | ✓ blocked |
| A bug that passes the wrong org id | ✗ leaks | ✗ leaks (if context is wrong) | partial (wrong connection) |
| SQL injection running arbitrary SQL as the app user | ✗ | partial — see "Residual risk" | ✓ stronger (credentials per tenant) |
| A stolen DB credential for the app role | ✗ | ✗ all tenants (shared role) | ✓ one tenant (DB-per-tenant only) |
| App running as superuser (today) | — | ✓ fixed by the role change below | ✓ |

Injection risk today is low: the API uses Prisma's parameterised queries everywhere; the only two raw-SQL sites (`nlq/kpi-catalog-embedding.service.ts`) are parameterised with column names from a fixed list.

## Problem found in the planned stage B

The stage-A policies let any session bypass RLS by setting a session variable: `app.bypass_rls = 'true'`. **The application's own database user can set that variable.** So any code bug that sets it in the wrong place — or any injected SQL — gets every tenant's data. A bypass switch the tenant-facing user can flip is not a real boundary.

**Fix:** bypass must be a property of *who is connected*, not of a variable: a separate, privileged database role used only by system code, and no bypass policy at all for the request role.

## Options

### A. Shared tables + hardened RLS (recommended)
All orgs share tables; the database enforces `organizationId = current org` on every row.

1. **Three database roles.**
   - `kpi_owner` — owns the schema, runs migrations only. Not used by the running app.
   - `kpi_app` — every user request. Not owner, `NOBYPASSRLS`, and **no bypass policy exists**, so it can only ever see the org set for its transaction.
   - `kpi_system` — background jobs and pre-login lookups (login by email, invitation / API-key / share-link / SCIM / webhook tokens) that legitimately work across orgs. A second Prisma client used only by those ~32 call sites (today's `runWithBypass`), each reviewed.
2. **Org context per transaction.** A Prisma extension wraps every query: `set_config('app.current_org', <org>, true)` then the query, in one transaction. `true` = local to the transaction, so a pooled connection can never carry one org's context into another request. The 13 interactive transactions set it once at their start.
3. **Fail closed.** No context ⇒ the policy compares against NULL ⇒ zero rows, and writes fail the `WITH CHECK`. The extension also refuses to run a tenant query with no request context.
4. **`FORCE ROW LEVEL SECURITY`** on every tenant table, so even the owner is subject to policies (superusers still bypass — the production owner must not be a superuser).
5. **Time-series data.** Two possible ways — to be decided by a short spike:
   - (a) revoke `kpi_app`'s direct access to `KPIDataPoint` and the `kpi_data_*` views and route it through security-barrier views filtered on `app.current_org` (keeps compression), or
   - (b) turn compression off for `KPIDataPoint` and put a normal RLS policy on it (simplest, uses more disk; fine at this project's data volume).
6. **Rollout.** Behind a flag that starts OFF → the whole test suite, including the cross-tenant fuzz test, runs with it ON in CI → flip the default → add FORCE.
7. **New tests:** `kpi_app` with no context sees zero rows; `kpi_app` cannot read another org even when a query omits the filter; setting `app.bypass_rls` has no effect; the role attributes (`NOBYPASSRLS`, not owner, not superuser) are asserted.

**Pros:** matches the locked design; fits Prisma; one schema and one migration path; scales to thousands of self-signup orgs; cross-org platform features (SCIM, platform admin) still work through `kpi_system`.
**Cons:** isolation still depends on the org id set for the transaction being right (it comes from the verified login token); all orgs share one credential.
**Effort:** about 3–5 focused days (extension + 13 transactions + 32 system call sites + time-series spike + CI flag).
**Performance:** one extra small statement per query inside the same transaction — sub-millisecond on the same host.

### B. Schema per organisation
Each org gets its own Postgres schema (`org_abc.kpi`, …) with identical tables.
**Pros:** a forgotten filter cannot cross orgs; per-org backup/restore is easy.
**Cons:** Prisma has no first-class support (one client per schema → connection explosion, or rewriting `search_path` per request — itself a leak risk with pooling); every migration runs N times; TimescaleDB hypertables and rollups per schema; platform features that look across orgs (SCIM token lookup, platform admin, onboarding) need special handling; self-signup creates schemas on demand. Replaces locked decision #3 → needs an ADR.
**Effort:** weeks; large rewrite of data access.

### C. Database per organisation
Each org gets its own database and credentials.
**Pros:** strongest isolation — a stolen credential exposes one org; per-org data residency, backups, deletion.
**Cons:** heavy operations (provision a database on every signup, N migrations, N connection pools, N TimescaleDB instances); cost on Fly.io; cross-org features become distributed. Usually reserved for a small number of large enterprise customers.
**Effort:** weeks plus ongoing ops cost.

### D. Hybrid (later, if needed)
Option A for everyone now; a dedicated database ("silo") offered later to an enterprise customer that contractually requires it. The data-access layer from A (an org → connection resolver) is the hook for that.

## Recommendation

**Option A, with the hardening above.** It is the standard design for multi-tenant SaaS with many small organisations, it is what the locked spec chose, and with role-based bypass, transaction-local context, fail-closed policies and FORCE it closes the class of bug the audit actually found. Schema- or database-per-org buy protection mainly against a stolen database credential, at a large cost, and can be added later for specific customers (D).

### Residual risk with A
If an attacker could run arbitrary SQL as `kpi_app`, they could set `app.current_org` to another org's id. RLS does not stop that; it is mitigated by having no string-built SQL (verified) and by query-level filters staying in place. If that risk must be closed too, the next step is per-tenant database credentials (option C) — or signing the org context and verifying it in a security-definer function, which is unusual and complex.
