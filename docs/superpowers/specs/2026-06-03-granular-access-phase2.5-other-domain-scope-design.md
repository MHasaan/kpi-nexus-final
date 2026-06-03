# Granular Access — Phase 2.5: Other-Domain Scope (design)

**Status:** Approved design (brainstorm 2026-06-03). Feeds `superpowers:writing-plans`.
**Branch:** `feat/frontend-design` (continues the granular-access line).
**Predecessors:** Phase 2 (per-role configurable+enforced KPI scope), Phases 3/4/5 (category allowlist, data limits, per-user overrides). Spec lineage: `docs/superpowers/specs/2026-06-01-granular-access-control-design.md`.
**Siblings (separate specs, not this one):** Phase 3.5 (ResourcePermission wiring), Phase 6b (admin config UI).

---

## 1. Goal & boundaries

The per-domain scope ladder — `SELF ⊂ DIRECT_REPORTS ⊂ UNITS ⊂ ORG` — is already **resolved** for all ten
`Domain` values into `AccessProfile.scopeByDomain`, but it is only **enforced** for KPIs (via
`buildKpiVisibilityWhere`). Phase 2.5 makes it enforce on the five entity-bearing domains that currently leak or
ignore it: **Dashboards, Tasks, OKRs, Reports, Alerts/AlertRules**.

**In scope**
- Enforce `scopeByDomain.{DASHBOARDS,TASKS,OKRS,REPORTS,ALERTS}` on the list, single-resource (`getById`), and
  mutating paths of those domains.
- One additive table, `DashboardAssignmentOrgUnit`, enabling "publish a dashboard to a unit" (the hybrid bit).
- A small write API to populate that table (the rich UI is Phase 6b).
- An always-on KPI-visibility **floor** for Alerts/AlertRules (closes an existing visibility leak).

**Out of scope (explicit)**
- `PEOPLE`, `ORG`, `ANALYTICS`, `INSIGHTS` domains — capability-gated or KPI-derived; unchanged here.
- Layer-4 **data limits** (`maxListRows` etc.) on these domains' lists — scope only in 2.5.
- **ResourcePermission** per-resource grants and `@RequireResourceAccess` — Phase 3.5.
- **Any front-end** (role scope editor, dashboard-assignment UI) — Phase 6b.
- **Contracts change** — none. `DomainSchema` and `ScopeConfigSchema` already cover every domain and scope; we
  are wiring enforcement, not adding knobs.

**Non-goals / invariants preserved**
- **Parity by default.** A role with no `scopeConfig` entry for a domain behaves exactly as it does today (§4).
- **Admins bypass** every scope check (resolve to `ORG`), as in all prior phases.
- **Application-layer enforcement** only (no RLS — consistent with the project's current posture; noted as
  pre-existing risk).

---

## 2. Architecture — one shared primitive, parity-preserving

### 2.1 New visibility module
`apps/api/src/rbac/visibility/domain-visibility.ts` — composable Prisma-`where` builders, one per domain, all
pure functions of `(profile, scopedUserIds)`. This sits beside the existing `kpi-visibility.ts` and is the only
place per-domain scope logic lives.

### 2.2 The scope→user-set primitive
The derived domains (Tasks/OKRs/Reports) decide visibility by an **owner/creator/assignee** column. The shared
primitive turns a scope level into the set of user-ids whose rows are visible:

```
resolveScopedUserIds(profile, scope):
  ORG            → null            // null == "no user filter" (all rows in tenant)
  SELF           → { me }
  DIRECT_REPORTS → { me } ∪ profile.context.directReportIds
  UNITS          → { me } ∪ directReportIds ∪ unitMemberUserIds(me)
```

- `me` = current `userId`; `directReportIds` already lives on `AccessProfile.context` (recursive, cycle-safe,
  depth-capped — built in Phase 1).
- `unitMemberUserIds(me)` = distinct `OrgUnitMember.userId` for `orgUnitId ∈ (managedOrgUnitIds ∪
  memberOrgUnitIds)`. New method on `AccessContextService`, memoised alongside the 5-minute profile cache so a
  request pays at most one query.
- Admins never reach this (they resolve `ORG` → `null`).

### 2.3 The KPI floor for alert domains
Alerts and AlertRules reference a KPI. Their always-on floor reuses the existing KPI visibility as a **relation
filter**, so no logic is duplicated:

```
where: { kpi: buildKpiVisibilityWhere(kpiContextFromProfile(profile)) , ...scopeClause }
```

This is the deliberate, approved tightening: a user can no longer see an alert (or rule) about a KPI they cannot
see. It applies at **every** alert scope level, including the `ORG` default.

---

## 3. Per-domain semantics

`me` = current user. "my-units' members" = `unitMemberUserIds(me)`. "reports'" = `directReportIds`.
Admin = `ORG` everywhere. Soft-deleted rows (`deletedAt`) stay filtered as they are today.

| Domain | Always-on floor | SELF | DIRECT_REPORTS | UNITS | ORG | Default (non-admin) → effect |
|---|---|---|---|---|---|---|
| **Dashboards** | `isShared = true` always visible | own private | + reports' | + (owner ∈ my units) **or** (`DashboardAssignmentOrgUnit.orgUnitId` ∈ my units) | all | **SELF** → `own ∪ isShared` (= today) |
| **Tasks** | — | `createdById=me` **or** `assigneeUserId=me` | + reports' | + creator/assignee ∈ my-units' members | all | **SELF** → today's "creator or assignee" |
| **OKRs** | — | `ownerUserId=me` | + reports' | + owner ∈ my-units' members | all | **ORG** → all (= today) |
| **Reports** | — | `createdById=me` | + reports' | + creator ∈ my-units' members | all | **ORG** → all (= today) |
| **Alerts** | alert's KPI visible | `targetUserId=me` | `targetUserId ∈ {me}∪reports` | `targetUserId ∈ scopedUserIds` **or** `targetUserId IS NULL` | all | **ORG** → all alerts **for visible KPIs** |
| **AlertRules** | rule's KPI visible | `createdById=me` | + reports' | `createdById ∈ scopedUserIds` | all | **ORG** → all rules **for visible KPIs** |

### Notes on the table
- **Dashboards** keeps `isShared` as a floor *and* sets the domain's non-admin default to `SELF` so the resolved
  visibility is `own ∪ isShared` — **byte-for-byte today's behaviour**. (Today's `dashboards.service` does
  `seeShared = scope !== 'SELF'`; we replace that boolean branch with a real 4-level match while holding the
  default constant.) Widening to `UNITS`/`ORG` is now an explicit per-role choice in 6b.
- **Alerts** `UNITS` includes `targetUserId IS NULL` because org-wide-KPI alerts have no target user; within the
  KPI floor they should remain visible to anyone scoped to the unit. At `ORG` the scope clause is empty and only
  the KPI floor applies.
- **Tasks** default `SELF` reproduces the current hardcode (`tasks.service` lines ~38–65) — but now it flows
  through `scopeByDomain.TASKS`, so a manager role can be widened.

---

## 4. Parity contract (what "unset" means)

`AccessContextService` keeps the global non-admin default of `UNITS` for resolution, but **the visibility
builders interpret the default per domain** so behaviour is unchanged on day one:

- KPIs: `UNITS` (unchanged).
- Dashboards: effective default `SELF` (private set) + `isShared` floor.
- Tasks: effective default `SELF`.
- OKRs / Reports / Alerts / AlertRules: effective default `ORG` (+ KPI floor for the alert pair).

Concretely: the per-domain builder is called with `scopeByDomain[domain] ?? DOMAIN_DEFAULT[domain]`, where
`DOMAIN_DEFAULT` encodes the table above. A role that **does** set a domain's scope overrides the default. This
keeps "ship with ~zero behaviour change; admin opts in" true, with the single exception of the alert KPI floor.

---

## 5. Schema (one additive table)

```prisma
model DashboardAssignmentOrgUnit {
  id             String   @id @default(cuid())
  organizationId String
  dashboardId    String
  orgUnitId      String
  createdAt      DateTime @default(now())
  createdById    String?

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  dashboard    Dashboard    @relation(fields: [dashboardId], references: [id], onDelete: Cascade)
  orgUnit      OrgUnit      @relation(fields: [orgUnitId], references: [id], onDelete: Cascade)

  @@unique([dashboardId, orgUnitId])
  @@index([organizationId])
  @@index([orgUnitId])
}
```
- Back-relations added to `Organization`, `Dashboard`, `OrgUnit`.
- **Hand-written additive migration** (TimescaleDB-drift convention): `CREATE TABLE` + unique index + two
  secondary indexes + three FKs, wrapped in the project's idempotent `DO $$ … EXCEPTION WHEN duplicate_* $$`
  pattern; applied via `prisma db execute` + `migrate resolve --applied`, then `prisma generate` (kill the API
  first — Windows query-engine DLL lock).
- No column added to Task/Objective/ScheduledReport/Alert/AlertRule — each already carries the field its builder
  needs (`assigneeUserId`/`createdById`, `ownerUserId`, `createdById`, `targetUserId`+`kpiId`, `createdById`+`kpiId`).

---

## 6. Enforcement points

For each domain, scope gates three surfaces (mirroring KPIs' `isVisibleToUser`):

1. **List** — `service.list()` ANDs the domain `where`-builder into its query.
2. **Single-resource read** — `getById()` (and any by-token/embed/sub-resource read that resolves the entity)
   re-checks visibility → 404 when out of scope. For Dashboards this cascades to widget/snapshot/share reads,
   which already resolve through the dashboard.
3. **Mutations** — update/delete first assert the entity is visible to the caller (in addition to the existing
   capability guard). Owners/creators are inside their own `SELF` scope, so they can always act on their own rows.

### Excluded — system computations (the Phase-4 principle: clamp *user* reads, not engine reads)
- **OKR rollup** (parent→child progress) reads children unscoped.
- **Alert evaluation engine** / rule firing sees all rules + data.
- **Scheduled-report generation** already runs as the creator (Phase 3/4) and stays unscoped for assembly;
  `board-pack` likewise.
- These paths must **not** route through the new builders. Each is annotated in the plan.

---

## 7. Minimal write API for the new table

So enforcement is testable and usable before 6b's UI exists:

- `POST /dashboards/:id/unit-assignments` body `{ orgUnitId }` → upsert (idempotent on the unique key), `DASHBOARD_MANAGE`.
- `DELETE /dashboards/:id/unit-assignments/:orgUnitId` → `DASHBOARD_MANAGE`.
- `GET /dashboards/:id/unit-assignments` → list (for 6b later), `DASHBOARD_VIEW` + dashboard visible.
- Tenant-validates `orgUnitId` belongs to the org; audits the change.

---

## 8. Caching & invalidation
- Reuses the existing per-`org:user` 5-minute `AccessProfile` cache; role `scopeConfig` writes already call
  `invalidateAll()` (RolesService) so widened/narrowed scope takes effect.
- `unitMemberUserIds(me)` is memoised with the profile (same TTL). Org-unit membership changes already flow
  through the existing invalidation seams used by org-structure mutations; no new path.
- `DashboardAssignmentOrgUnit` rows are queried **live** in the dashboard `where` (not stored on the profile), so
  adding/removing an assignment needs no cache invalidation.

---

## 9. Testing

**Unit (Vitest, per domain):**
- 4 scope levels × visible/hidden fixtures for each of Dashboards, Tasks, OKRs, Reports, Alerts, AlertRules.
- **Parity test per domain:** with no `scopeConfig`, the new builder returns the same rows the legacy path did
  (Dashboards `own ∪ isShared`; Tasks creator/assignee; OKRs/Reports/Alerts all).
- **Alert-leak-closure test:** a user who cannot see KPI X sees **no** alert/rule for KPI X, at every alert scope.
- `resolveScopedUserIds` table test (SELF/DIRECT_REPORTS/UNITS/ORG → correct id sets, admin → null).
- `DashboardAssignmentOrgUnit` round-trip: assign a dashboard to a unit → a unit member at `UNITS` scope now
  sees it; unassign → hidden again.

**Cross-user isolation:** extend the existing pattern — user A in unit 1 vs user B in unit 2 cannot see each
other's scoped dashboards/tasks/OKRs/reports/alerts.

**Integration / live smoke:** narrow a demo manager's role to `DASHBOARDS=SELF`, `TASKS=SELF`, `ALERTS=SELF`,
confirm list counts drop and out-of-scope `getById` → 404; revert restores. Reuse the Phase-2/4 live-smoke
harness (login `devon.reyes@northwind.io`).

**Exit criteria:** all new unit tests green; full API suite stays green (currently 1255); parity tests prove zero
behaviour change for unset roles; alert-leak test passes; live smoke verified; admin unaffected.

---

## 10. Risks & decisions on record
- **Perf:** `unitMemberUserIds` and the `IN (userIds)` filters add a subquery/`IN` per scoped list. Bounded by
  org size; acceptable at FYP scale. If a tenant grows large, the id-set can move to a join. Logged, not solved.
- **Dashboards default = SELF (not UNITS):** chosen to hold exact parity (`own ∪ isShared`); widening is an
  explicit 6b action. Approved in brainstorm.
- **Alert floor is one of two intentional behaviour changes.** Everything else is opt-in. Approved.
- **Admin dashboard widening (second intentional change):** today the dashboard list returns only `own ∪
  isShared` *even for admins* (the current `seeShared` branch never returns others' private dashboards). Under
  the scope ladder, admin → `ORG` → **all** dashboards. This corrects a pre-existing over-narrowness so admins
  see everything (consistent with admin-bypass elsewhere). Non-admin parity is unaffected (their default `SELF` +
  `isShared` floor still resolves to `own ∪ isShared`). Flagged for sign-off; revert to `own ∪ isShared`-for-all
  is trivial if undesired.
- **Mutations are visibility-gated.** You can only edit what you can see (plus the capability); owners always can
  act on their own rows. Approved.
- **No RLS** — application-layer only, consistent with the codebase's existing posture; pre-existing risk, not
  introduced here.

---

## 11. Deliverable checklist (for writing-plans)
1. `DashboardAssignmentOrgUnit` model + relations + hand-written migration + `prisma generate`.
2. `AccessContextService.unitMemberUserIds()` (cached) + `resolveScopedUserIds(profile, scope)`.
3. `rbac/visibility/domain-visibility.ts` — builders for Dashboards, Tasks, OKRs, Reports, Alerts, AlertRules +
   `DOMAIN_DEFAULT` map.
4. Wire each domain's `list` / `getById` / mutations to its builder; leave engine/rollup/report-gen paths untouched.
5. Dashboard unit-assignment endpoints (`POST`/`DELETE`/`GET`) + DTO + audit.
6. Tests per §9.
7. Live smoke + memory update.
