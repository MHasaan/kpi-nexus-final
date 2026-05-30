# v1.0.0 Gap-Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 18 findings from the 2026-05-31 completeness audit so every planned deliverable is actually built, then reconcile `TODOS.md`/`ROADMAP.md` to reality.

**Architecture:** Additive changes that follow existing conventions. NestJS modules use `RequestContextStore.require()` for tenancy, `this.prisma`, `this.audit.log(...)`, typed `throw new XException({ code, message })`, Zod `*.dto.ts` with `.strict()`, and `@RequirePermissions(...)` on controllers. Next.js pages are App Router client components calling `lib/api-client.ts`. ML adds FastAPI routers under `apps/ml/app/routers/` registered in `main.py`. DB DDL lives in `packages/db/prisma/sql/` applied by `scripts/setup-db.mjs`.

**Tech Stack:** NestJS 11 (Fastify) · Next.js 15 (App Router) · Prisma · Postgres + TimescaleDB · BullMQ · FastAPI (statsmodels) · Vitest · Playwright · pytest.

**Reference spec:** `docs/superpowers/specs/2026-05-31-v1-gap-closure-design.md`

**Conventions to mirror (read before coding):**
- Service + unit-test pattern: `apps/api/src/kpis/kpi-data.service.ts` + a sibling `*.spec.ts` (PrismaService mocked).
- Controller + `@RequirePermissions`: `apps/api/src/kpis/kpis.controller.ts`.
- Archive endpoints to mirror: `kpis.controller.ts` `@Get('archived')` / `@Post(':id/restore')` / `@Delete(':id/purge')`.
- ML router/service/test: `apps/ml/app/routers/correlation.py` + `apps/ml/app/services/` + `apps/ml/tests/test_analytics.py`.
- Web auth client: `apps/web/src/lib/api-client.ts` (`AuthUser`, `meRequest`, `getAccessToken`, `setTokens`).
- e2e pattern (register fresh org, skip if API down): `apps/web/e2e/auth-flow.spec.ts`.

**Branch:** `chore/v1-gap-closure` (already created). Commit after every green step.

---

## Task Group A — Frontend permission-gating layer (spec §5)

> Backend enforcement already works (verified: `@RequirePermissions` + 961 tests). This adds the missing **frontend** layer: permissions plumbing, a shared `<AppShell>` with a central permission-filtered nav (today each page hand-rolls its nav inline), guard components, and gated action buttons. The 18 canonical permission keys are in `packages/contracts/src/permissions.ts`.

### Task A1: Expose the current user's permissions to the web client

**Files:**
- Verify/Modify: `apps/api/src/auth/*` — confirm `GET /auth/me` returns `permissions: string[]` (RBAC resolver). If absent, add it to the `/auth/me` response (resolve via the existing permissions service used by `PermissionsGuard`).
- Test: `apps/api/src/auth/<me>.spec.ts`

- [ ] Step 1: Write a failing unit test asserting `GET /auth/me` payload includes a non-empty `permissions` array for an admin (admin → all 18).
- [ ] Step 2: Run it; expect FAIL.
- [ ] Step 3: Wire the resolver output into the `/auth/me` response (reuse the resolver `PermissionsGuard` already calls; do not re-implement).
- [ ] Step 4: Run; expect PASS. Confirm the existing auth specs still pass.
- [ ] Step 5: Commit `feat(web-rbac): /auth/me returns resolved permissions`.

### Task A2: Permissions client utilities + hook

**Files:**
- Create: `apps/web/src/lib/permissions.ts` — `hasPermission(perms, key)`, `hasAny(perms, keys)`, and a `usePermissions()` hook reading the cached `AuthUser` (store `permissions` alongside the token after login/`meRequest`).
- Modify: `apps/web/src/lib/api-client.ts` — persist `permissions` from `meRequest()`/login so client components can read them synchronously.
- Test: `apps/web/src/lib/permissions.spec.ts`

- [ ] Step 1: Failing unit test: `hasAny(['kpi:read'], ['kpi:write','kpi:read'])===true`; `hasPermission([], 'kpi:write')===false`; admin wildcard handling matches backend (admin resolves to all keys, so the array already contains them — no client wildcard needed).
- [ ] Step 2: Run; FAIL.
- [ ] Step 3: Implement the pure utils + hook.
- [ ] Step 4: Run; PASS.
- [ ] Step 5: Commit `feat(web-rbac): permission utils + usePermissions hook`.

### Task A3: Guard components

**Files:**
- Create: `apps/web/src/components/auth/require-permission.tsx` — `<RequirePermission permission has fallback>`, `<RequireAnyPermission permissions>` (route/section guard; renders `fallback` or redirects to `/unauthorized` when lacking).
- Create: `apps/web/src/components/auth/permission-guard.tsx` — `<PermissionGuard permission>` element/button wrapper (renders `null` or disabled when lacking).
- Create: `apps/web/src/app/unauthorized/page.tsx` if missing (clean 403 view).
- Test: `apps/web/src/components/auth/permission-guard.spec.tsx` (render with/without the permission via a mocked `usePermissions`).

- [ ] Step 1: Failing component test: `<PermissionGuard permission="kpi:write">` renders children when granted, nothing when not.
- [ ] Step 2: Run; FAIL.
- [ ] Step 3: Implement components.
- [ ] Step 4: Run; PASS.
- [ ] Step 5: Commit `feat(web-rbac): RequirePermission/RequireAnyPermission/PermissionGuard`.

### Task A4: Shared `<AppShell>` with central permission-filtered nav

**Files:**
- Create: `apps/web/src/components/app-shell.tsx` — header + nav + `<GlobalSearch>` + `<AlertsBell>` + sign-out, driven by a central `NAV_ITEMS` list `{ href, label, permission? }`; nav entries hidden when the user lacks `permission`. Extract the existing inline header markup from `apps/web/src/app/dashboard/page.tsx` as the canonical version.
- Modify: authenticated pages to render inside `<AppShell>` instead of hand-rolled headers. Prioritize: dashboard, kpis*, dashboards*, users*, roles, org-units, alerts*, settings/*, okrs, tasks, approvals, workflows, integrations, connectors, activity, insights, recommendations, ask. (Profile/settings sub-shell unified too.)
- Test: `apps/web/e2e/permission-nav.spec.ts`

- [ ] Step 1: Failing e2e: register a fresh org (admin) → assert nav shows KPIs/Roles/Settings; then create a low-privilege user (Employee/Viewer) via the API, log in as them, assert restricted nav entries (e.g. Roles, Settings/admin) are absent and `/roles` redirects to `/unauthorized`.
- [ ] Step 2: Run; FAIL.
- [ ] Step 3: Build `<AppShell>` + `NAV_ITEMS`; migrate the priority pages.
- [ ] Step 4: Run; PASS. Re-run the full e2e suite to catch shell-migration regressions.
- [ ] Step 5: Commit `feat(web-rbac): AppShell with permission-filtered nav + route guards`.

### Task A5: Gate action buttons across high-value pages

**Files:**
- Modify: `kpis`, `users`, `roles`, `dashboards`, `alerts`, `org-units`, `connectors`, `settings/api-keys` pages — wrap create/edit/delete/mint actions in `<PermissionGuard permission="...">` using the matching canonical key.
- Test: extend `permission-nav.spec.ts` — Viewer does not see "New KPI"/"Delete" on `/kpis`.

- [ ] Step 1: Add the Viewer-no-create assertion (FAIL).
- [ ] Step 2: Wrap the buttons.
- [ ] Step 3: Run; PASS.
- [ ] Step 4: Commit `feat(web-rbac): gate action buttons with PermissionGuard`.

---

## Task Group B — OrgUnit reorganization (P1)

> `OrgUnitNameHistory` model exists (schema:525). `org-units` currently has **no** `*.spec.ts` — this group establishes its unit tests too. Mirror service/controller conventions from `org-units.service.ts` (tenancy + audit + typed exceptions).

### Task B1: `renameUnit` + name history

**Files:**
- Modify: `apps/api/src/org-units/org-units.service.ts` — `renameUnit(id, newName, reason?)`: update name, insert `OrgUnitNameHistory { orgUnitId, previousName, newName, changedById, reason }`, `audit.log`.
- Modify: `apps/api/src/org-units/org-units.controller.ts` — `POST /org-units/:id/rename` (`@RequirePermissions('org:manage'|matching key)`), `GET /org-units/:id/name-history`.
- Create: `apps/api/src/org-units/dto/reorganize.dto.ts` — Zod `.strict()` schemas (`RenameDto`, `MoveUsersDto`, `MergeDto`, `SplitDto`).
- Create: `apps/api/src/org-units/org-units.service.spec.ts` (mock PrismaService per the kpis spec pattern).

- [ ] Step 1: Failing spec: `renameUnit` writes history row + updates name; cross-tenant id → NotFound.
- [ ] Step 2: Run; FAIL.
- [ ] Step 3: Implement service + controller + DTO.
- [ ] Step 4: Run; PASS.
- [ ] Step 5: Commit `feat(org-units): rename + name history`.

### Task B2: `moveUsers`

**Files:** same service/controller; `POST /org-units/move-users { userIds, fromUnitId?, toUnitId }`.

- [ ] Step 1: Failing spec: members move (old membership `leftAt` set, new membership created); tenant-scoped.
- [ ] Step 2: FAIL → 3: implement (transaction) → 4: PASS → 5: Commit `feat(org-units): moveUsers`.

### Task B3: `mergeUnits` + `splitUnit`

**Files:** same; `POST /org-units/:id/merge-into { targetId }` (reparent children + move members + soft-close source), `POST /org-units/:id/split { newUnitName, memberUserIds }`.

- [ ] Step 1: Failing specs for merge (members+children reparented, source closed) and split (new unit created, members reassigned).
- [ ] Step 2: FAIL → 3: implement in transactions → 4: PASS → 5: Commit `feat(org-units): merge + split`.

### Task B4: BFS helpers `descendantsVisibleToHead` + `listMembershipsByUser`

**Files:** same; `GET /org-units/by-user/:userId/memberships`.

- [ ] Step 1: Failing specs: BFS returns descendant ids (cycle-safe); memberships-by-user returns active rows tenant-scoped.
- [ ] Step 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(org-units): visibility BFS + memberships-by-user`.

### Task B5: Reorganize UI on `/org-units`

**Files:** Modify `apps/web/src/app/org-units/page.tsx` (rename/move/merge/split actions, gated by `<PermissionGuard>`); add client methods to `api-client.ts`. Test: `apps/web/e2e/org-units-reorg.spec.ts`.

- [ ] Step 1: Failing e2e: create two units → rename one → move a member → assert via UI.
- [ ] Step 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(web): org-unit reorganize UI`.

---

## Task Group C — Session management `/me/sessions` (P1)

> Sessions = `RefreshToken` rows. Reuse `RefreshTokenService.revokeAllForUser` (`refresh-token.service.ts:98`).

### Task C1: Backend `/me/sessions`

**Files:**
- Create: `apps/api/src/users/me-sessions.controller.ts` — `GET /me/sessions` (active tokens for `ctx.userId`: id, createdAt, lastUsedAt, ip/device if stored, `current` flag by matching the presented token's jti/hash), `DELETE /me/sessions/:id` (revoke one, tenant+user scoped), `POST /me/sessions/revoke-all`.
- Add a `revokeOne(userId, tokenId)` to `refresh-token.service.ts`.
- Register controller in `users.module.ts` (or `auth.module.ts`).
- Test: `apps/api/src/users/me-sessions.controller.spec.ts`.

- [ ] Step 1: Failing spec: list returns only the caller's active tokens; revoke marks `revokedAt`; revoke of another user's token → NotFound/forbidden.
- [ ] Step 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(auth): /me/sessions list + revoke + revoke-all`.

### Task C2: Frontend `/me/sessions`

**Files:** Create `apps/web/src/app/me/sessions/page.tsx` (list + "Revoke" + "Revoke all others"); add client fns. Test: `apps/web/e2e/me-sessions.spec.ts`.

- [ ] Step 1: Failing e2e: log in → see ≥1 session → revoke-all-others succeeds.
- [ ] Step 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(web): active sessions page`.

---

## Task Group D — AI completeness (P5)

### Task D1: ML `/seasonality` endpoint

**Files:**
- Create: `apps/ml/app/routers/seasonality.py` + `apps/ml/app/services/seasonality.py` (statsmodels `seasonal_decompose`: trend/seasonal/resid + period inference; mirror `correlation.py` HMAC-protected router shape).
- Modify: `apps/ml/app/main.py` — register the router (line ~14/23 alongside anomaly/correlation/forecast/whatif).
- Test: `apps/ml/tests/test_seasonality.py`.

- [ ] Step 1: Failing pytest: POST `/seasonality` with a synthetic seasonal series returns `trend/seasonal/resid` arrays + detected period; bad auth → 401.
- [ ] Step 2: Run `python -m pytest apps/ml/tests/test_seasonality.py -q`; FAIL.
- [ ] Step 3: Implement router/service + register.
- [ ] Step 4: Run; PASS. Run full ML suite (`pytest -q`) → still green.
- [ ] Step 5: Commit `feat(ml): /seasonality (statsmodels seasonal_decompose)`.

### Task D2: API route to `/seasonality`

**Files:** Modify the analytics module that proxies ML (mirror the `/correlation` proxy) to add a `seasonality` endpoint; reuse the existing ML HMAC client. Test: add a unit spec mirroring the correlation proxy spec.

- [ ] Step 1: Failing spec (mock ML client returns decomposition) → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(api): seasonality proxy to ML`.

### Task D3: NLQ auto-reembed pipeline

**Files:**
- Create: `apps/api/src/nlq/reembed.producer.ts` + `apps/api/src/nlq/reembed.processor.ts` (BullMQ queue `nlq-reembed`, deterministic jobId, idempotent, chunked).
- Modify: `KpisService.create`/`update` — fire-and-forget `reembedKpi(kpiId)` on name/description/tags/unit change.
- Modify: AI config upsert — enqueue full reembed when the org's embedding provider changes.
- Test: `apps/api/src/nlq/reembed.spec.ts` (producer enqueues with stable jobId; processor calls embed + upserts `KpiCatalogEmbedding`).

- [ ] Step 1: Failing spec (mock queue + embed) → 2: FAIL → 3: implement producer/processor + wiring → 4: PASS → 5: Commit `feat(nlq): auto-reembed on KPI change + provider switch`.

---

## Task Group E — Roles aux + P9/P3 frontend gaps

### Task E1: Roles presets + hierarchy + apply-preset + audit

**Files:**
- Create: `apps/api/src/roles/permission-presets.ts` — `PERMISSION_PRESETS` (Admin/Manager/Employee/Viewer key sets, matching the seeded defaults).
- Modify: `roles.service.ts` — `applyPreset(roleId, presetKey)`, `resolveSubordinateRoleIds(roleId)` (BFS over inheritance, cycle-safe), `getHierarchy()`, `getAudit(roleId)`.
- Modify: `roles.controller.ts` — `GET /roles/hierarchy`, `GET /roles/presets/list`, `POST /roles/:id/apply-preset`, `GET /roles/:id/audit`.
- Test: `roles.service.spec.ts` (extend) — preset application sets exact permission set; BFS cycle-safe.

- [ ] Step 1: Failing specs → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(roles): presets + hierarchy + apply-preset + audit`.

### Task E2: Roles presets page

**Files:** Modify `apps/web/src/app/roles/page.tsx` (presets list + apply, gated). Test: extend `roles-flow.spec.ts`.

- [ ] Step 1: Failing e2e → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(web): role presets UI`.

### Task E3: Dashboards archive endpoints + page

**Files:**
- Modify: `dashboards.service.ts` — `listArchived()`, `restore(id)`, `purge(id)` (mirror KPIs).
- Modify: `dashboards.controller.ts` — `@Get('archived')`, `@Post(':id/restore')`, `@Delete(':id/purge')`.
- Create: `apps/web/src/app/dashboards/archive/page.tsx` (mirror `kpis/archive/page.tsx`).
- Test: `dashboards.service.spec.ts` (extend) + `apps/web/e2e/dashboard-archive.spec.ts`.

- [ ] Step 1: Failing specs (soft-delete → appears in archived → restore brings back) → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(dashboards): archive/restore/purge + UI`.

### Task E4: `/status` page

**Files:** Create `apps/web/src/app/status/page.tsx` reading `GET /health/details` (component dots + latency). Confirm `/health/details` exists (HealthModule); add it if missing. Test: `apps/web/e2e/status.spec.ts`.

- [ ] Step 1: Failing e2e → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(web): status page`.

### Task E5: In-app help drawer

**Files:** Create `apps/web/src/components/help-drawer.tsx` + `apps/web/src/lib/contextual-help.ts` (`CONTEXTUAL_HELP` pathname→tips registry) + floating `?` button mounted in `<AppShell>`; persist `helpDrawerSeen` (localStorage; pulse until first open). Test: `apps/web/e2e/help-drawer.spec.ts`.

- [ ] Step 1: Failing e2e (click ? → tips for current route) → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(web): contextual help drawer`.

---

## Task Group F — Performance + remaining P1 settings + housekeeping

### Task F1: TimescaleDB continuous aggregates + policies

**Files:**
- Modify: `packages/db/prisma/sql/hypertables.sql` — add `kpi_data_{hourly,daily,weekly,monthly,quarterly}` continuous aggregates over `"KPIDataPoint"`, each with `add_continuous_aggregate_policy` (30-min refresh) + a 90-day `add_compression_policy`. Idempotent (`if_not_exists`/guarded).
- Verify `scripts/setup-db.mjs` applies it (it already runs `hypertables.sql`).
- Test: extend `scripts/bench-hypertable.mjs` → CAGG-vs-raw comparison + non-zero exit on p95 budget breach (`pnpm bench:hypertable`). Add the `bench:hypertable` script to root `package.json` if absent.

- [ ] Step 1: Add the CAGG DDL; run `pnpm db:setup` against the live compose Postgres; verify the views + policies exist (`SELECT view_name FROM timescaledb_information.continuous_aggregates`).
- [ ] Step 2: Extend the bench; run it; confirm CAGG path reported + budget gate works.
- [ ] Step 3: Commit `perf(db): continuous aggregates + refresh/compression policies + CAGG bench`.

### Task F2: P1 settings pages + `/billing`

**Files:** Create thin pages over existing backend: `apps/web/src/app/settings/{branding,fiscal,password-policy,custom-domain}/page.tsx` and `apps/web/src/app/billing/page.tsx` (plan/usage/upgrade modal over BillingModule). Add nav entries (permission-gated) in `<AppShell>`. Tests: extend `settings-flow.spec.ts` + `billing.spec.ts`.

- [ ] Step 1: Failing e2e per page (loads + renders the backing data) → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(web): branding/fiscal/password-policy/custom-domain/billing pages`.

### Task F3: Onboarding draft cleanup cron

**Files:** Add `OnboardingDraftService.cleanupStale()` + a BullMQ repeatable job (deterministic jobId) that archives drafts idle > N days. Test: `onboarding` spec asserting stale drafts are archived, fresh ones untouched.

- [ ] Step 1: Failing spec → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(onboarding): scheduled stale-draft cleanup`.

### Task F4: PDF sparkline

**Files:** Modify `apps/api/src/reports/services/pdf-generator.ts` — render a small sparkline per KPI section (pdfkit vector path from recent points) instead of the text list. Test: extend the reports spec (PDF buffer non-empty + larger than text-only baseline / contains a path op).

- [ ] Step 1: Failing/updated spec → 2: FAIL → 3: implement → 4: PASS → 5: Commit `feat(reports): PDF sparkline per KPI`.

### Task F5: P4 Testcontainers integration specs

**Files:** Create `apps/api/test/integration/alerting.int-spec.ts` (via `vitest.int.config.ts`) covering the 5 flows: STATIC_THRESHOLD breach → delivery; 3-level escalation timing; retry 503 → backoff → terminal; digest 5-alerts → 1 email; outbound webhook → signature verify. Requires the compose stack.

- [ ] Step 1: Write the 5 int-specs (real assertions) → 2: Run `pnpm --filter @kpi-nexus/api test:int` with compose up; iterate to green → 3: Commit `test(alerting): Testcontainers integration coverage for 5 flows`.

---

## Task Group G — Docs reconciliation

### Task G1: Reconcile trackers

**Files:** Modify `TODOS.md` (tick everything now built across P0–P9; mark deferred items with `(deferred — see specs/2026-05-31-v1-gap-closure-design.md)`), `ROADMAP.md` (status accurate), the P5 plan (record NLQ 8/8 reframe), the P4 plan (adapter-file consolidation note).

- [ ] Step 1: Update `TODOS.md` checkboxes to match the audited reality + this plan's completions.
- [ ] Step 2: Annotate the confirmed-deferred items + the 2 accepted deviations.
- [ ] Step 3: Commit `docs: reconcile TODOS/ROADMAP with audited reality + deferrals`.

### Task G2: Final verification sweep

- [ ] Step 1: Run all suites: API unit (`pnpm --filter @kpi-nexus/api test`), packages (ai/contracts/formula), web unit, ML pytest — all green (≥1,052 + new).
- [ ] Step 2: Live re-verify the new surfaces in the browser (permission-filtered nav as a Viewer; org-unit reorg; `/me/sessions`; `/status`; dashboards archive; help drawer) + re-confirm the scope-invariant 422.
- [ ] Step 3: Update `memory/` + `.remember/` handoff; tag `v1.0.1` if desired.
- [ ] Step 4: Commit `chore: v1.0.0 gap-closure complete — full sweep green`.

---

## Self-review notes

- **Spec coverage:** every workstream A–G and all 18 findings map to a task (A→frontend gating; B→org-unit reorg; C→/me/sessions; D→/seasonality + auto-reembed; E→roles aux + dashboards archive + /status + help drawer; F→CAGGs + P1 settings + draft cron + PDF sparkline + int-specs; G→docs + accepted deviations). Confirmed-deferred items (admin impersonation, live SSO, SDK gen, plugin sandbox, ACM, Postgres/MySQL connectors, Stripe, Claude-design, mobile/collab) are explicitly excluded per the design doc.
- **Accepted deviations** (documented, not coded): NLQ golden set 8/8 ≥80%; notification adapters single-file.
- **Type consistency:** method names are stable across tasks (`renameUnit`, `moveUsers`, `mergeUnits`, `splitUnit`, `descendantsVisibleToHead`, `listMembershipsByUser`, `applyPreset`, `resolveSubordinateRoleIds`, `revokeOne`, `reembedKpi`).
- **Permission keys:** use the canonical enum in `packages/contracts/src/permissions.ts` — confirm exact keys when wiring guards.
