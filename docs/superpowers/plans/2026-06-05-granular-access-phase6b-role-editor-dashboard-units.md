# Granular Access — Phase 6b: Per-Role Config Editor + Dashboard-Unit-Assignment UI

> Execute with superpowers:subagent-driven-development. **Pure frontend** — the backend already
> supports everything (PATCH /roles with scope/type/limits; PublicRole returns them; Phase-2.5
> dashboard unit-assignment endpoints). Reuse the Phase 6a `UserAccessPanel`
> (`apps/web/src/app/settings/access/page.tsx`) as the editor template.

**Goal:**
1. On `/roles`, let an admin edit the selected role's **scope-per-domain / data-limits / KPI-category**
   config (the same three blocks the per-user override editor has), Save → `PATCH /roles/:id`.
2. On a dashboard's detail/settings, let an admin **publish/unpublish the dashboard to org units**
   (Phase-2.5 endpoints), so unit members see it under UNITS scope.

**Verified backend:** `PublicRole` already includes `scopeConfig|dataTypeConfig|dataLimits`;
`UpdateRoleDto` accepts them; `PATCH /roles/:id` persists + invalidates caches. Dashboard endpoints:
`GET/POST /dashboards/:id/unit-assignments`, `DELETE /dashboards/:id/unit-assignments/:orgUnitId`.
Existing clients: `listOrgUnits()`, `listKpiCategories()` already in api-client.

---

## Task A — api-client + per-role config editor on /roles

**Files:** `apps/web/src/lib/api-client.ts`; `apps/web/src/app/roles/page.tsx` (+ optional extracted component).

- [ ] **api-client**: extend `RoleSummary` to include `scopeConfig: ScopeConfig | null`,
  `dataTypeConfig: DataTypeConfig | null`, `dataLimits: DataLimitsConfig | null` (match backend
  `PublicRole`). Add:
  ```ts
  export async function updateRole(id: string, patch: { scopeConfig?: ScopeConfig; dataTypeConfig?: DataTypeConfig; dataLimits?: DataLimitsConfig }): Promise<RoleSummary> {
    return api(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }
  ```
  (A `getRole` is optional — `listRoles()` already returns the config; the editor can read from the
  selected `RoleSummary`.) Re-export `ScopeConfig/DataTypeConfig/DataLimitsConfig` (already exported).
- [ ] **Editor on /roles**: in the selected-role detail panel (below the permission matrix / presets),
  add a `RoleAccessConfig` section that MIRRORS the Phase-6a editor's three blocks:
  - **Scope per domain** — a `<Select>` per `DOMAIN` (`SELF/DIRECT_REPORTS/UNITS/ORG` + a "Default" option
    = unset). Pre-populate from `role.scopeConfig`.
  - **Data limits** — three number `<Input>`s (history days / max list rows / max export rows), blank = unset.
    Reuse the strict `toPos` integer parser from 6a (reject `90abc`/`100.5`).
  - **KPI categories** — a "Restrict to specific categories" checkbox + category checkbox list (load via
    `listKpiCategories()`), pre-populated from `role.dataTypeConfig?.kpiCategoryIds`. Show the
    "saving with none selected hides all categorised KPIs" warning (copy from 6a).
  - **Save** button → `updateRole(role.id, buildRolePayload())` → update the local role list + a success
    note. Build payload exactly like 6a's `buildPayload` but WITHOUT capabilities (roles edit caps via
    the existing matrix/presets) — only `scopeConfig` (omit empty), `dataTypeConfig` (only when restrict
    on), `dataLimits` (omit empty). Sending `{}` for a block should clear it — decide: to CLEAR a role's
    scopeConfig, send `scopeConfig: {}`; to leave unset, omit. Keep it simple: always send the three
    blocks reflecting the editor state (`{}` / `{kpiCategoryIds:[...]}` / limits), so Save is the full
    desired state.
  - Gate the whole page by `ROLES_MANAGE` (the roles page already requires it). For the **admin role**
    (`role.isAdmin`), show an immunity note (admins bypass scope/limits) like 6a does, but still allow
    saving (stored, inert).
  - Reuse `Select, Input, Label, Button, Card, Badge` from `components/ui` and the `kn-eyebrow` section
    headers. Match the 6a layout/spacing. Preserve all existing roles-page test-ids; add stable ones
    (`role-access-config`, `save-role-config`, `role-config-success`).
- [ ] Verify: `pnpm --filter @kpi-nexus/web typecheck` + `pnpm --filter @kpi-nexus/web lint` clean;
  `pnpm --filter @kpi-nexus/web build` (next build) compiles. If a web unit test harness covers roles,
  keep it green.
- [ ] Commit `feat(web): per-role scope/limits/category config editor on /roles (Phase 6b)`.

## Task B — dashboard-unit-assignment UI

**Files:** `apps/web/src/lib/api-client.ts`; the dashboard detail/settings UI
(`apps/web/src/app/dashboards/[id]/page.tsx` + its settings form component).

- [ ] **api-client**: add
  ```ts
  export interface DashboardUnitAssignment { orgUnitId: string; createdAt: string; }
  export async function listDashboardUnitAssignments(dashboardId: string): Promise<DashboardUnitAssignment[]> { return api(`/dashboards/${dashboardId}/unit-assignments`); }
  export async function assignDashboardToUnit(dashboardId: string, orgUnitId: string): Promise<void> { await api(`/dashboards/${dashboardId}/unit-assignments`, { method: 'POST', body: JSON.stringify({ orgUnitId }) }); }
  export async function unassignDashboardFromUnit(dashboardId: string, orgUnitId: string): Promise<void> { await api(`/dashboards/${dashboardId}/unit-assignments/${orgUnitId}`, { method: 'DELETE' }); }
  ```
  (`POST`/`DELETE` return 204 — `api()` should tolerate an empty body; if it currently JSON-parses
  unconditionally, mirror how other void endpoints are called — check an existing 204 client like
  `deleteAccessOverride`/`unassign`-style and follow it.)
- [ ] **UI**: in the dashboard detail page's settings area (gate by `DASHBOARD_MANAGE`), add a
  "Published to units" section: load `listDashboardUnitAssignments(id)` + `listOrgUnits()`, render the
  assigned units as removable chips/rows (resolve `orgUnitId`→unit name), and an "Add unit" `<Select>`
  (org units not yet assigned) + Add button → `assignDashboardToUnit` then reload; Remove →
  `unassignDashboardFromUnit` then reload. Empty state when none. Match the design system + existing
  dashboard-settings styling. Add test-ids (`dashboard-unit-assignments`, `assign-unit`, `unit-row-<id>`).
- [ ] Verify typecheck + lint + build (as Task A).
- [ ] Commit `feat(web): dashboard unit-assignment UI on dashboard detail (Phase 6b)`.

## Task C — verify (live browser) + memory

- [ ] Rebuild web (`next build`) + run it (or dev); rebuild/restart API if needed (docker pg+redis up).
- [ ] LIVE browser smoke (admin sara): `/roles` → select a non-admin role → set DASHBOARDS scope=UNITS +
  a data limit + a category restriction → Save → reload shows persisted values; `/dashboards/:id` →
  publish to a unit → appears in the assigned list → remove → gone. 0 console errors. (Optionally confirm
  the effect: a manager in that role/unit now sees the published dashboard.)
- [ ] Update memory; commit `test(web): Phase 6b live verification + memory`.

## Out of scope
- Per-role **capability** matrix editing (stays preset/matrix-based as today) and page-access editing
  (Phase 7 adds the page-access block to BOTH the role and user editors).
- Resource-grant / delegation / role-hierarchy admin UIs (separate slice).
