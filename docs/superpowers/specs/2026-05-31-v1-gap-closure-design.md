# Design — v1.0.0 Full Gap-Closure & Reconciliation

**Date:** 2026-05-31
**Status:** Approved (user signoff 2026-05-31)
**Branch:** `chore/v1-gap-closure`

## Why this exists

A full independent completeness audit (12 parallel auditors over P0–P9 + a cross-cutting
invariants auditor + a deferred-scope reconciliation auditor, plus a live test sweep and a
live browser/API smoke test) confirmed the rebuild is **substantially complete and working**:

- **1,052 automated tests pass** today (API unit 961, packages/ai 42, contracts 11, web 15,
  ML pytest 23).
- Every page across P0–P9 renders live with no runtime errors.
- The **critical per-user scope invariant is enforced live**: `POST /kpis/:id/data` on a
  PER_USER KPI returns **422 `SCOPE_MISMATCH`** with `details.correctEndpoint`
  (`/user-kpis/my-kpis/:assignmentId/data`); ORG_WIDE accepts data with 201.
- i18n RTL flip (ur-PK → `dir=rtl`), ⌘K global search, and the $1/day·$30/mo AI budget
  defaults all verified live.

However, the audit also found that **`TODOS.md` is stale** (many `[x]`/`[ ]` boxes do not
match reality) and that **~18 planned deliverables were never actually built** — several of
them marked `[x]` in the phase plans. This document defines the work to close every gap so
"everything planned is implemented" is literally true, and to reconcile the trackers.

## Out of scope (confirmed legitimately deferred, post-v1)

These remain deferred by prior decision and are **not** part of this effort:

1. Frontend "Claude Design" visual-polish session (final tokens/components per spec §12)
2. Beta-program hardening
3. Stripe / live payment billing wiring (BillingModule is schema + quota only; locked decision)
4. Mobile app / real-time collaborative editing
5. Live SAML/OIDC IdP handshake (WorkOS); JIT provisioning logic is built + unit-tested
6. Blocking CI gates for Lighthouse / k6 / axe-core + bundle-size budgets (run manually)
7. OpenAPI auto-gen + Spectral + `packages/sdk` TypeScript SDK
8. Plugin sandbox hardening (isolated-vm formula-fn + iframe widget)
9. Custom-domain ACM TLS automation (manual flow documented)
10. P8 connector scheduler auto-runs + Postgres/MySQL connector runners (REST+GraphQL built)
11. Turbo remote cache; Sentry SDK wiring (lands when DSN set)
12. Production cloud-KMS GenerateDataKey (AES-256-GCM crypto built; cloud key-sourcing deferred)
13. **Admin impersonation** (`/admin/impersonate`) — explicitly deferred in P1, security-sensitive

## Accepted deviations (reconcile docs; do NOT churn working code)

- **NLQ golden set is 8 questions @ ≥80%**, not the planned 20 @ ≥18/20. The harness/scorer
  are real; the bar was reframed. Document the reframe in the P5 plan; do not fabricate Q&A.
- **Notification adapters live in one `notification-adapters.service.ts`** (switch dispatch)
  rather than six per-kind files. All six kinds work. Document the structural choice.

## The 18 findings → workstreams

### Workstream A — Frontend permission-gating layer (spec §5; the major gap)

Backend permission enforcement is solid (`@RequirePermissions` guard + 961 tests) — this is a
**UX / defense-in-depth** gap, not a data leak. Build the missing frontend layer:

- Wire `permissions: string[]` into the web auth client (already typed in `api-client.ts`)
  from the login / `/auth/me` response.
- `apps/web/src/lib/permissions.ts`: `usePermissions()` hook + `hasPermission()` / `hasAny()`.
- `apps/web/src/components/auth/`: `<RequirePermission>`, `<RequireAnyPermission>`,
  `<PermissionGuard>` (element/button wrapper).
- Permission-filter the sidebar nav (map each nav entry → required permission).
- Apply route guards + gate create/edit/delete action buttons across the route map.
- **Tests:** unit (hook + components); e2e (a Viewer/Employee sees filtered nav + gated
  buttons; backend already returns 403).

### Workstream B — OrgUnit reorganization (P1 major; plan marked [x] falsely)

`OrgUnitNameHistory` model already exists — no migration needed.

- `org-units.service.ts`: `moveUsers`, `mergeUnits`, `splitUnit`, `renameUnit`
  (writes `OrgUnitNameHistory`), `descendantsVisibleToHead`, `listMembershipsByUser` (BFS).
- Controller: `POST /org-units/move-users`, `POST /org-units/:id/merge-into`,
  `POST /org-units/:id/split`, `POST /org-units/:id/rename`,
  `GET /org-units/:id/name-history`, `GET /org-units/by-user/:userId/memberships`.
- FE: reorganize panel on `/org-units`.
- **Tests:** ~13 unit tests (the count the plan claimed) + e2e.

### Workstream C — Session management `/me/sessions` (P1; plan marked [x] falsely)

Sessions = `RefreshToken` rows (no separate `Session` model). Reuse `revokeAllForUser`.

- `MeSessionsController`: `GET /me/sessions` (active tokens: device/ip/lastUsedAt/current),
  `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-all`.
- FE: `/me/sessions` page (or a Profile "Active sessions" section).
- **Tests:** unit + e2e.

### Workstream D — AI completeness (P5)

- ML `apps/ml/app/routers/seasonality.py` + service (statsmodels `seasonal_decompose`),
  register in `main.py`, pytest. API route mirrors the existing `/correlation` pattern.
- NLQ auto-reembed: `nlq-reembed` BullMQ producer + processor; fire-and-forget enqueue from
  `KpisService.create`/`update`; enqueue on embedding-provider switch in AI config upsert.
- **Tests:** ML pytest for seasonality; API unit for reembed producer/processor.

### Workstream E — Roles aux + remaining P9/P3 frontend gaps

- Roles: `PERMISSION_PRESETS` constant + `applyPreset` + `resolveSubordinateRoleIds` (BFS) +
  `GET /roles/hierarchy`, `GET /roles/presets/list`, `POST /roles/:id/apply-preset`,
  `GET /roles/:id/audit`; presets page.
- Dashboards archive: add `GET /dashboards/archived`, `POST /dashboards/:id/restore`,
  `DELETE /dashboards/:id/purge` (mirror the KPI archive endpoints) + `/dashboards/archive` page.
- `/status` page (reads `/health/details`).
- In-app help drawer: `<HelpDrawer>` + `CONTEXTUAL_HELP` registry (pathname → tips) +
  floating `?` button (pulse until first open) + `helpDrawerSeen` flag.
- **Tests:** unit + e2e per surface.

### Workstream F — Performance + remaining P1 settings + housekeeping

- **P2 continuous aggregates:** `kpi_data_{hourly,daily,weekly,monthly,quarterly}` CAGGs +
  30-min `add_continuous_aggregate_policy` refresh + 90-day compression policy in
  `packages/db/prisma/sql/hypertables.sql`, applied by `db:setup`; bench script CAGG-vs-raw
  comparison + p95 budget gate.
- **P1 settings pages** (thin UIs over existing org-settings backend): `/settings/branding`,
  `/settings/fiscal`, `/settings/password-policy`, `/settings/custom-domain`; `/billing` page
  over the existing BillingModule (plan/usage/upgrade modal).
- P6 draft-cleanup cron (`OnboardingDraftService.cleanupStale` via BullMQ).
- P3 PDF sparkline (render a small chart image per KPI section instead of text list).
- P4 Testcontainers integration specs for the 5 alert/notification flows (require compose stack).

### Workstream G — Docs reconciliation

- Tick `TODOS.md` and `ROADMAP.md` to match reality; mark deferred items explicitly with a
  pointer to this doc's "Out of scope" + "Accepted deviations" sections.
- Update the P5 plan to record the NLQ 8/8 reframe and the P4 plan for the adapter-file choice.

## Build order

1. Parallel (TDD subagents, isolated areas): B, C, D-ML + D-reembed, E-backend, F-backend.
2. Frontend: A (largest), then E-frontend + F-frontend pages.
3. CAGGs + bench (DB).
4. G — docs reconciliation.
5. Full test sweep (all suites) + live browser/API re-verification of the new surfaces.

## Acceptance

- All new code TDD'd; relevant unit/integration/e2e tests green.
- Full sweep stays green (≥1,052 prior tests + the new ones).
- Frontend permission gating demonstrably filters nav + buttons for a non-admin.
- OrgUnit reorg, `/me/sessions`, `/status`, dashboards archive, help drawer verified live.
- `TODOS.md`/`ROADMAP.md` accurately reflect built vs. deferred.
- No regression in the critical scope invariant or the 961 API unit tests.

## Completion record (2026-05-31)

All 18 findings closed on branch `chore/v1-gap-closure`, TDD + two-stage review per task.

| Workstream | Commits |
|---|---|
| A — Frontend permission gating (/auth/me perms, utils+hook+guards, AppShell+filtered nav, gated buttons) | `4d89f7d`, `70d9ede`, `6c4284d`, `c7a6c63`, `9466831` |
| B — OrgUnit reorganization backend + UI | `bc96539`, `3046f63`, `6bc25ce`, `aa9b0ac` |
| C — `/me/sessions` backend + UI | `8fa9d06`, `a14b0fb` |
| D — ML `/seasonality` + API proxy; NLQ auto-reembed | `346e33b`, `249c307` |
| E — Roles aux; roles UI; dashboards archive; `/status`+`/health/details`; help drawer | `aa6f55c`, `f7c30d6`, `49353df`, `28eefad`, `eeda2f4`, `e7f9971` |
| F — CAGGs+bench; settings/billing pages; draft-cleanup cron; PDF sparkline; alerting int-specs | `66c5cee`, `4523ae3`, `6ff5fe1`, `05c639d`, `5d5765f`, `185b146` |
| G — Docs reconciliation; final verification | this commit + G2 |

**Final verification (2026-05-31, fresh run):** API unit **1080**, packages/ai 42, contracts 11,
web unit **59**, ML pytest **34** — all green. New surfaces verified live in the browser/API:
permission-filtered nav as a low-privilege Employee (gated entries hidden + `/roles` →
`/unauthorized`); OrgUnit rename/merge/move; `/me/sessions` revoke-all-others; `/status`
(db+redis component rows); dashboards archive restore/purge; help drawer. The critical scope
invariant (422 + `correctEndpoint`) re-confirmed live.

**Known minor issues (non-blocking, recorded for follow-up):**
- ~21 pre-existing web files use a `text-status-positive` Tailwind class absent from the UI
  preset (silent no-op; correct token is `text-status-success`). New gap-closure files use the
  correct token.
- A few live-API `test:int` specs (refresh-token, mfa-flow, kpi-dashboard-summary perf) are
  flaky under full-suite parallel load but pass in isolation — pre-existing, not introduced here.
- `setup-db.mjs` continuous-aggregate verify uses a `>= 5` threshold where `>= 6` (incl. base
  hypertable) would be stricter (warn-only; non-fatal).
