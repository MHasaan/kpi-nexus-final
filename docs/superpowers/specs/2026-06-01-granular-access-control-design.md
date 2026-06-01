# Granular Access Control — Design Spec

> Status: **approved direction, spec under review** · Date: 2026-06-01 · Branch: `feat/frontend-design`
> Supersedes nothing; **extends** the locked RBAC model (spec §5) without replacing it.

## 1. Why

Today access is governed by 18 coarse permission keys + a KPI-only data-scope model, with
several capabilities **built but never wired** (`ResourcePermission`) and **no admin UI** for
fine-grained grants. The goal: let an admin assign, **per role and per individual user**, control
over **every aspect** of access:

- **what pages** a user can open,
- **whose data** they can see (own / reports / unit / org),
- **what type** of data (which KPI categories, units, dashboards, reports),
- **how much** data (row/export caps),
- **what age** of data (recency / history window).

This is the prerequisite for the per-user-tailored dashboard (and every page).

## 2. Goals / Non-goals

**Goals**
- A single resolved **Access Profile** per request that captures all five dimensions.
- Configurable on **roles** (default) with **per-user overrides** on top.
- Generalize the existing KPI scope model into a **reusable visibility layer** for dashboards,
  reports, alerts, OKRs.
- Wire the dormant `ResourcePermission`; add data-type allowlists; add data limits.
- Expose the Access Profile to the frontend so pages can **tailor what they render**.
- A new admin **Access Center** UI, including a **"what can this user see?"** preview.
- Backward compatible: existing roles/users keep working; new dimensions default to "no extra
  restriction."

**Non-goals (for now)**
- A full ABAC/policy-rule engine (rejected: large rewrite, contradicts locked RBAC + 3-layer tenancy).
- Replacing the 18-key model (we **extend** it; see ADR-001).
- Field-level (column) masking beyond the redaction the audit layer already does.

## 3. The model — "Access Profile" (5 layers)

A user's effective access resolves to an `AccessProfile`:

```
AccessProfile {
  isAdmin: boolean                       // admin bypass (unchanged)
  capabilities: Set<CapabilityKey>       // Layer 1 — verbs × domains (the enum, refined per ADR-001)
  scopeByDomain: Record<Domain, Scope>   // Layer 2 — whose data: SELF|DIRECT_REPORTS|UNITS|ORG
  dataTypeFilters: {                     // Layer 3 — what type
    kpiCategoryIds?: string[] | null     //   null = all; [] = none; [ids] = only these
    orgUnitIds?: string[] | null
    dashboardIds?: string[] | null
    resourceGrants: ResourcePermission[] //   wired per-entity grants (additive)
  }
  dataLimits: {                          // Layer 4 — how much / how old
    historyWindowDays?: number | null    //   null = unlimited; clamps data-point `from`
    maxListRows?: number | null
    maxExportRows?: number | null
  }
  pageAccess: {                          // Layer 5 — which routes (sub-route granularity)
    allow?: string[] | null              //   null = derive from capabilities; else explicit allow
    deny?: string[]                      //   subtract these routes even if capability present
  }
  // provenance (for the "why can X see Y" preview + audit)
  source: { fromRole: ..., fromUserOverride: ..., fromDelegations: ... }
}
```

**Domains** (for scope + page mapping): `KPIS, DASHBOARDS, ALERTS, REPORTS, ANALYTICS, INSIGHTS,
OKRS, TASKS, PEOPLE, ORG`.

**Scope** levels (generalized from KPI scope): `ORG` ⊃ `UNITS` ⊃ `DIRECT_REPORTS` ⊃ `SELF`. Admin
implies `ORG` everywhere. Each domain maps scope to a Prisma `where` via a shared visibility builder.

### Resolution order (extends spec §5.4)
1. `isAdmin` → full access, all scopes `ORG`, no limits. (unchanged short-circuit)
2. Base from **role**: capabilities (role.permissions[] ∪ inherited via `RoleInheritance`), plus the
   role's scope/data-type/limits/page config.
3. **Per-user override** (`UserAccessOverride`): union/override on top of the role (grant + revoke
   capabilities; tighten or widen scope; set data-type/limits/page).
4. **Delegations** (`PermissionDelegation`, existing): time-boxed capability grants folded in.
5. **Owner-override** (existing `@OwnerOverride`): a user may always act on a resource they own.
6. **ResourcePermission** (now wired): additive per-entity grants consulted by the visibility builders
   and by `@RequireResourceAccess` on entity routes.

The most-restrictive wins for scope/limits; capabilities are additive then minus user-revokes.

## 4. Assignment model

- **Role** (`RoleDefinition`, extended): the default carrier of all 5 layers.
- **Per-user override** (`UserAccessOverride`, NEW): one row per user; partial — only set what differs
  from the role. This is the "assign permissions per user for every aspect" mechanism.
- **Delegation** (`PermissionDelegation`, existing): keep for *temporary* capability grants (expiry).
- **Resource grant** (`ResourcePermission`, existing → wired): per-entity exceptions.

## 5. ADR-001 — Capability refinement (the locked-enum change, **approved**)

The 18 keys stay; we **add** a measured set of finer capabilities so "what pages / what actions" can
be controlled at the capability layer (the rest is handled by Layer 5 page-access). New keys:

| New key | Splits/adds from | Why |
|---|---|---|
| `KPI_IMPORT` | was `KPI_CREATE`/`KPI_VIEW` | bulk import is a powerful, separable action |
| `REPORTS_MANAGE` | was `REPORTS_VIEW` | scheduling/creating reports ≠ viewing them |
| `ANALYTICS_FORECAST` | subset of `ANALYTICS_VIEW` | forecast/what-if are heavier than read-only analytics |
| `EXPORTS` | new | gate any data export/download independent of view |
| `AUDIT_VIEW` | carved out of `ORG_SETTINGS` | give compliance read of the audit log without full settings |
| `INTEGRATIONS_MANAGE` | carved out of `ORG_SETTINGS` | manage connectors/webhooks without full settings |
| `BILLING_MANAGE` | carved out of `ORG_SETTINGS` | finance can manage billing without full settings |

**Back-compat:** existing roles that hold the parent key are auto-granted the carved-out child keys at
migration time (so no one loses access). Admin (`isAdmin`) implies all. The presets
(ADMIN/MANAGER/EMPLOYEE/VIEWER) are updated to include sensible defaults of the new keys.
This is the ADR; the change is intentional and signed off by the user (2026-06-01).

> Page-level granularity *below* a capability (e.g. allow `/kpis` but deny `/kpis/import`) is handled
> by Layer 5 page-access lists, not by exploding the enum further.

## 6. Data-model changes (Prisma)

- `RoleDefinition`: add `scopeConfig Json?` (Domain→Scope), `dataTypeConfig Json?`
  (categoryIds/unitIds/dashboardIds), `dataLimits Json?`, `pageAccess Json?`. (JSON keeps the
  migration additive; typed via Zod in contracts.)
- **NEW `UserAccessOverride`**: `id, organizationId, userId @unique, grantCapabilities String[],
  revokeCapabilities String[], scopeConfig Json?, dataTypeConfig Json?, dataLimits Json?,
  pageAccess Json?, updatedById, updatedAt`. RLS + org index.
- `ResourcePermission`: add a canonical `action` enum in contracts (`view|edit|delete|data_entry|
  manage`) validated at the API; no schema change (already a string).
- All new columns nullable/defaulted → safe additive migration (hand-written, TimescaleDB-safe).

## 7. Resolution + caching

- A new `AccessContextService.resolve(ctx)` returns the full `AccessProfile`, computing:
  isAdmin, capability set, **managedUnitIds / memberUnitIds / directReportIds (recursive)**, scope per
  domain, data-type filters, data limits, page access — once per request, cached (`org:user`, 5-min
  TTL, invalidated on role/override/membership change).
- A shared `buildVisibilityWhere(domain, profile)` returns the Prisma `where` for each domain (KPI
  builder generalized; new builders for dashboards/reports/alerts/OKRs).

## 8. Enforcement

**Backend**
- Guard: `@RequirePermissions` unchanged for capabilities; add `@RequireResourceAccess(resourceType,
  paramKey)` for per-entity routes (consults ResourcePermission + ownership).
- Every list/read service uses `buildVisibilityWhere(domain, profile)` (replaces ad-hoc filters).
- Data endpoints clamp `from` to `now - historyWindowDays` and cap row/export counts from `dataLimits`.
- Page access: relevant endpoints check `profile.pageAccess` where a route maps to data not already
  capability-gated.

**Frontend**
- `/auth/me` returns the resolved `AccessProfile` (not just capability strings).
- New `useAccess()` hook + `<RequireAccess>` (capability + optional domain/scope) + nav filtered by
  pageAccess; `<PermissionGuard>` stays for simple capability gates.
- Pages **tailor rendering** to the profile (e.g., the dashboard only shows widgets/data the profile
  permits; "whose data" toggles reflect scope).

## 9. Admin "Access Center" UI (new settings area)

- **Roles** → expanded editor: capability matrix (grouped by domain) + scope-per-domain + data-type
  allowlists (category/unit/dashboard pickers) + data limits + page allow/deny.
- **Per-user overrides** → grant/revoke capabilities + override scope/limits/type/page for one user.
- **Resource grants** + **delegations** management (the currently-missing UIs).
- **Role hierarchy** editor (the missing `RoleInheritance` edge UI).
- **"What can this user see?"** preview: pick a user → render their resolved AccessProfile + a
  plain-language summary ("Sees KPIs for their unit; can't export; data limited to 90 days").

## 10. Phased decomposition + build order

Each phase is independently shippable, verified (typecheck/tests/build + browser) before the next.

- **Phase 0 — ADR + capability refinement.** Add the 7 new capability keys to contracts; map to
  endpoints/nav; migrate existing roles/presets to retain access. (Pairs with Phase 1.)
- **Phase 1 — Access foundation (START HERE).** `AccessContextService` (units/reports/scope, recursive
  reports, cached); expose `AccessProfile` on `/auth/me`; FE `useAccess()`; generalize the KPI
  visibility builder into the shared `buildVisibilityWhere`. No behavior change yet — parity with today.
- **Phase 2 — Generalized scope.** Apply `buildVisibilityWhere` to dashboards/reports/alerts/OKRs;
  role `scopeConfig`.
- **Phase 3 — Data-type filters.** Wire `ResourcePermission`; canonical action enum; category/unit
  allowlists in list builders; `@RequireResourceAccess`.
- **Phase 4 — Data limits.** history-window + row/export caps enforced at data endpoints.
- **Phase 5 — Per-user overrides.** `UserAccessOverride` model + resolver integration.
- **Phase 6 — Access Center UI.** the admin config surface + "what can this user see?" preview + the
  missing resource/delegation/hierarchy UIs.
- **Phase 7 — Page-access lists.** sub-route allow/deny + FE/BE enforcement.

## 11. Back-compat & migration

- All new columns nullable/JSON → existing rows unaffected.
- Migration grants carved-out child capabilities to roles holding the parent (no access regression).
- `AccessProfile` defaults: scope = whatever the role's capabilities implied before (KPI scope keeps
  its current behavior); data-type/limits/page = unrestricted (null). So Phase 1 ships at **behavioral
  parity** and later phases only *add* the ability to restrict.
- The 12-case KPI visibility test + cross-tenant fuzz must stay green through every phase.

## 12. Testing & invariants

- Generalize the KPI 12-case visibility test into a parameterized suite per domain.
- New tests: per-user override union/revoke; data-limit clamps; resource-grant additive access;
  capability carve-out back-compat; the resolver precedence (most-restrictive scope, additive caps).
- Cross-tenant fuzz must cover the new endpoints.
- Frontend: `useAccess` SSR-safety (no hydration mismatch — mirror the `usePermissions` fix);
  RequireAccess redirect tests.

## 13. Risks & open questions

- **Performance:** the access context adds membership/reports queries per request → mitigated by the
  5-min cache + a single batched resolve. Recursive direct-reports could be deep → cap depth + memoize.
- **RLS gap (pre-existing):** P2+ tables lack tenant-isolation RLS policies (only P1 covered). Not
  introduced here, but the generalized visibility layer is app-level; we should note/track closing the
  RLS gap separately.
- **Complexity for admins:** the Access Center must stay legible → lead with roles + the "what can this
  user see?" preview; overrides are the exception, not the norm.
- **Scope of UI:** Phase 6 is large; may itself decompose.

## 14. First build (after this spec is approved)

Proceed to `writing-plans` for **Phase 0 + Phase 1** together (ADR capability keys + the access
foundation), since Phase 1 needs the refined capability set. Ship at behavioral parity, then iterate
phases 2→7.
