# Audit — frontend (apps/web, 80 pages)

_Part 2 of the audit. Report-only: nothing here has been fixed yet._

## Coverage

| Step | What | Result |
|---|---|---|
| 2a | Existing Playwright E2E suite (170 tests / 71 files, 2 workers, 2 retries) | **131 passed · 7 flaky · 32 failed** (24 min). Every failure triaged below. |
| 2b | Audit page crawl — `apps/web/e2e/audit/page-crawl.spec.ts` → [`frontend-crawl.md`](./frontend-crawl.md) / [`.json`](./frontend-crawl.json) | 80 routes × 4 passes (admin · contributor · logged-out · admin at 375 px) = 320 visits. Admin: 79/80 clean (board-pack crashes). Contributor: 14 pages correctly gated, 12 render with 403s. Logged-out: 44 pages show "no access" instead of login. Mobile: 1 page overflows. No 5xx on any page. |
| 2c | Hands-on walkthrough (browser pane) | Signup + template gallery, alerts (create rule), KPI create validation, KPI detail tabs, OKR list/detail, roles page, org units (with a cycle), My KPIs record — findings below. |

The crawl doesn't assert; re-run it with `AUDIT_CRAWL=1 pnpm --filter @kpi-nexus/web exec playwright test e2e/audit/page-crawl.spec.ts --workers=1 --retries=0` (≈ 30 min). Add `CRAWL_PASSES=contrib,admin@375px` to re-run selected passes.

### E2E failures — triage (32)

| Cause | Tests | Verdict |
|---|---|---|
| AI provider failing (BE-026) | `ai-recommendations` ×2, `ai-suggest-kpis`, `onboarding-ai`, `onboarding-wizard:80`, `ai-frontend:60`, `ai-nlq:32` | **real bug** |
| `/org-templates` 500 (BE-001 / FE-005) | `org-templates` ×2, `onboarding-wizard:35` | **real bug** |
| Terminology not in nav (FE-007) | `settings-flow:58` | **real bug** |
| Password label includes toggle (FE-008) | `auth-flow:116`, `permission-nav:233` | **real a11y bug** (+ test selector) |
| What-if rounding (FE-016) | `ai-analytics-ui:97` | **real bug** (cosmetic) |
| Position track not shown (FE-011) | `positions-flow:68` | **real bug** (minor) |
| UI redesigned, test not updated | `smoke`, `auth-flow:42` (landing H1), `permission-nav:97,138` (Profile moved to account menu), `roles-flow` ×4 (roles page restructured), `kpi-detail:13` (`v1 · CURRENCY`), `user-kpi-views:13` ("Current 12 PRs" format), `alerts-extras:88` (bell markup) | stale tests |
| Behaviour correctly changed | `invitation-flow:49` (Employee now gets 403 on `/roles` — the test expected the old open page) | stale test |
| Date-dependent test data | `dashboard-flow:67` records data for Jan 2026, now outside the dashboard's 90-day window → "No data" | stale test |
| Slow first compile in `next dev` | `uc-alerts:69` (rule created, redirect slow), `kpis-flow:153` (validation works when re-checked), `tasks-okrs-ui:72` (KR meter present when re-checked) | timing; not reproducible manually |
| Not reproducible | `kpi-templates:32` (a new org sees only global templates now; likely cross-test interference) | — |

**Flaky (passed on retry):** `ai-frontend:82,103` (AI), `audit-flow:156` (FE-009), `dashboard-builder:81`, `kpis-flow:135`, `me-sessions:41`, `share-link:76`.

### Status by section (one row per route in [`frontend-crawl.md`](./frontend-crawl.md))

✅ works as expected · ⚠️ works, with findings · ❌ broken

| Section | Routes | Status |
|---|---|---|
| Public / auth | `/`, `/login`, `/register`, `/signup`, `/signup/wizard`, `/accept-invitation`, `/unauthorized`, `/share/[token]`, `/embed/kpi/[token]` | ❌ template gallery empty (FE-005) · ⚠️ FE-008, FE-009 |
| Dashboard | `/dashboard` | ⚠️ FE-001 (status ignores direction), FE-013 |
| KPIs | `/kpis`, `/kpis/new`, `/kpis/[id]` (+ edit / anomalies / forecast / whatif / embed), `/kpis/archive`, `/kpis/categories`, `/kpis/import`, `/kpis/scorecard`, `/kpis/templates`, `/kpis/tree`, `/my-kpis` | ⚠️ FE-015, FE-016 |
| Dashboards | `/dashboards`, `/dashboards/new`, `/dashboards/archive`, `/dashboards/[id]` (+ share / snapshots / widgets/[wid]) | ⚠️ FE-013 (no live updates), FE-017 |
| Reports | `/reports`, `/reports/new`, `/reports/[id]`, `/reports/board-pack` | ❌ board pack crashes (FE-012) |
| Alerts | `/alerts`, `/alerts/new`, `/alerts/[id]`, `/alerts/channels` | ⚠️ FE-006 (rules not manageable), FE-014 |
| Intelligence | `/insights`, `/recommendations`, `/ask` | ⚠️ intermittent AI failures (BE-026) |
| Execute | `/okrs`, `/okrs/[id]`, `/tasks`, `/approvals`, `/workflows` | ⚠️ FE-003, FE-014 (`/workflows`) |
| Organize | `/users`, `/users/[id]`, `/team`, `/roles`, `/positions`, `/org-units`, `/activity` | ⚠️ FE-002, FE-010, FE-011 |
| Integrations | `/integrations`, `/connectors`, `/connectors/[id]`, `/plugins` | ⚠️ FE-014 |
| Settings | `/settings` + 14 sub-pages, `/billing` | ⚠️ FE-007, FE-014 |
| Account | `/profile`, `/me/mentions`, `/me/sessions`, `/status` | ✅ |

Net: about a third of the E2E failures are real product bugs (all listed below); the rest are a suite that hasn't been maintained alongside UI changes. CI never runs it successfully either (OT-007).

## Findings

### FE-001 · High · Dashboard marks over-target "lower is better" KPIs as On track — ✅ FIXED
- **Fix (server-computed, as suggested):**
  - New `apps/api/src/kpis/kpi-health.ts` is one status rule: threshold bands, then explicit thresholds, then a direction-aware target (the same grading as KPI assignments). It also computes a direction-aware attainment (lower-is-better = target / value).
  - `/kpis/dashboard-summary` now returns `direction`, `status` and `attainmentPct` per KPI. This is additive. The board pack uses the same field.
  - The dashboard page and the List widget display the server status and attainment instead of `latest / target`. The List widget had the same bug.
  - Verified in the browser: Gross Logo Churn 3.5% (≤2.5% target) now shows **At risk**, matching its alert. The health tiles match the API (27 on track / 10 at risk), and Avg attainment is no longer inflated by >100% lower-is-better ratios.
- **Repro:** sign in as `admin@helios.io` → `/dashboard`.
- **Actual:** Gross Logo Churn 3.5 % (target ≤ 2.5 %) shows **On track**, next to an open HIGH alert saying it breached. Same for CAC / MTTR. Their >100 % ratios also inflate "Avg attainment".
- **Cause:** `deriveStatus()` / `attainmentPct()` in `apps/web/src/app/dashboard/page.tsx:149-162` use `latest / target ≥ 0.95` and ignore KPI direction and threshold bands.
- **Expected:** direction-aware status (ideally server-computed so web and API agree).

### FE-018 · High · No forgot-password / reset-password flow in the web app — ✅ FIXED
- **Found while fixing BE-007:** there was no "Forgot password?" link, no request page, no reset page and no API-client calls, so users who forgot their password had no self-service path. The API's reset email (once sent) would have linked to a non-existent page.
- **Fix:** `app/(auth)/forgot-password` and `app/(auth)/reset-password` pages, `requestPasswordReset` / `confirmPasswordReset` client calls, and a link on `/login`. Covered by `e2e/password-reset.spec.ts` (full flow via Mailhog).

### FE-014 · Medium · 12 pages open for users who can't load their data (gating gaps) — ✅ FIXED
- **Fix:**
  - Pages are gated on the permission their API enforces (ORG_SETTINGS / INTEGRATIONS_MANAGE).
  - Sections load only with permission: `/alerts/new` channels, `/alerts/[id]` deliveries, `/roles` presets. The `/alerts/new` channels 403 used to blank the whole form.
  - Browser: tom → `/connectors` and `/settings/sso` → `/unauthorized`; `/alerts/new` loads its KPIs.
  - Verification: 9 page loaders still fired a 403 before the redirect; they now wait for the gate's permission (`e2e/gated-page-loads.spec.ts`).
- **Repro (crawl, contributor `tom.becker@helios.io`):** these pages render, but their API calls return **403**, leaving broken or empty screens instead of the unauthorized page or hidden actions:

| Page | Failing call(s) |
|---|---|
| `/alerts/channels` | `GET /notification-channels` |
| `/alerts/new` (channel picker) | `GET /notification-channels` |
| `/alerts/[id]` (delivery history) | `GET /notification-deliveries` |
| `/connectors`, `/connectors/[id]` | `GET /connectors`, `/connectors/:id`, `/runs` |
| `/plugins` | `GET /plugins` |
| `/workflows` | `GET /workflows` |
| `/roles` (presets) | `GET /roles/presets/list` |
| `/settings/notifications/dlq` | `GET /notification-deliveries?status=FAILED` |
| `/settings/retention` | `GET /retention-policies`, `/tiers/list` |
| `/settings/scim` | `GET /scim/tokens` |
| `/settings/sso` | `GET /sso/config` |

- **Contrast:** 14 other admin pages are correctly gated (`/approvals`, `/billing`, `/integrations`, `/settings`, `/settings/{access,ai,api-keys,audit,branding,custom-domain,organization,password-policy,webhooks}`).
- **Expected:** gate these pages (or the affected sections) on the same permission the API enforces (`ORG_SETTINGS` / `INTEGRATIONS_MANAGE` / …).

### FE-015 · Low · My KPIs: developer text in the UI, and Record offered without permission — ✅ FIXED
- **Fix (`70bdaa7`):** developer text replaced with user-facing copy; the Record form is behind `PermissionGuard KPI_DATA_ENTRY`.
- `/my-kpis` shows "Entries post to /user-kpis/my-kpis/:id/data · optimistic." to end users.
- For a user whose `KPI_DATA_ENTRY` is revoked (`tom.becker@`), the Record input and button are shown. Submitting gets `403` → "Insufficient permissions". The server correctly enforces; the UI should hide or disable the action.

### FE-016 · Low · What-if shows unrounded percentages — ✅ FIXED
- **Fix (`0716970`):** `Delta` takes `decimals`; what-if passes 1 (`delta.spec.ts`).
- **Repro (E2E `ai-analytics-ui.spec.ts:97`):** `/kpis/[id]/whatif` → simulate +10% → lift renders as **"▲10.000000000000016%"** (expected "10.0%").

### FE-017 · Low · Widget detail page overflows on phones — ✅ FIXED
- **Fix (`7ca23ed`) — root cause was app-wide:** below `md` the 256 px sidebar stayed open on every page (≈ 60 px left for content). It is now an off-canvas drawer (menu button, backdrop, closes on navigation / Escape); md+ is unchanged.
- Also on phones: PageHeader actions wrap, icon-only search, 16 px page padding. Measured at 375 px: widget page scrollWidth 468 → 375; `/kpis` content 63 → 341 px.
- **Repro (crawl, 375 px):** `/dashboards/[id]/widgets/[wid]` is 93 px wider than the viewport (horizontal scroll). All other 79 pages fit.

### FE-005 · High · Signup "Template gallery" shows "No templates available." (BE-001 surfaced to users) — ✅ FIXED (via BE-001)
- Verified in the browser: the gallery lists all 5 templates.
- **Repro (walkthrough):** `/signup` → email + org name → **Template gallery** → "Templates — No templates available."
- **Cause:** the page's `GET /org-templates` returns 500 (BE-001), and `listTemplates()` (`apps/web/src/lib/onboarding-client.ts:50`) / the signup page treat the failure as an empty list — no error shown.
- **Impact:** one of the three onboarding paths is unusable for every new organization, silently. (Also fails E2E `onboarding-wizard.spec.ts:35` and `org-templates.spec.ts:26,47`.)

### FE-006 · Medium · Alert rules can't be viewed, edited, disabled or deleted in the UI — ✅ FIXED
- **Fix:** new `/alerts/rules` lists rules (KPI, type, severity, status). Editors can pause/resume, edit name/severity/description, and delete with a confirm. There is a "Rules" link in the alerts header, and creating a rule lands on the list. `uc-alerts` e2e now passes end to end. Browser: pause → Paused, resume → Active.
- **Repro:** `/alerts/new` → create a rule → `POST /alert-rules 201` → redirected to `/alerts`, which lists only triggered alerts. The new rule appears nowhere.
- **Evidence:** `listAlertRules` / `deleteAlertRule` exist in `apps/web/src/lib/api-client.ts:1569,1592` but no page calls them. A rule is only reachable through the detail page of an alert it has already raised (`app/alerts/[id]/page.tsx:162`).
- **Impact:** a misconfigured or noisy rule can't be found or switched off from the UI.

### FE-007 · Medium · Custom terminology never reaches the navigation — ✅ FIXED
- **Fix (`39759ab`):** one app-wide `TerminologyProvider` (refetches when the token changes); the sidebar maps labels through `navLabelFor()` — only customised terms rename entries (`nav-terminology.spec.ts`).
- **Repro (E2E `settings-flow.spec.ts:58`):** set Organization settings → role label "Permission Tier" → sidebar still says "Roles" (`nav-roles`).
- **Evidence:** `apps/web/src/components/app-shell.tsx` has no terminology lookup; terminology is applied only inside individual pages (`app/roles`, `app/positions`, `app/kpis`, `app/org-units`, dashboards…).

### FE-008 · Low · Password field's accessible name includes its toggle ("Password Show password") — ✅ FIXED
- **Fix (`0fb188f`):** login toggle moved outside the `<label>`; register helper text moved out and linked via `aria-describedby`. Specs use `getByLabel('Password', { exact: true })`.
- **Evidence:** on `/login` (and register) the show/hide button sits inside the `<label>`, so the input's accessible name is "Password Show password" and `getByLabel('Password')` matches both the input and the button. Screen readers announce it oddly, and it breaks 3 E2E specs (`auth-flow.spec.ts:116`, `permission-nav.spec.ts:233`, …).
- **Expected:** move the button outside the label or give the input an explicit `aria-labelledby`.

### FE-012 · High · `/reports/board-pack` crashes ("Application error") — ✅ FIXED (via BE-027)
- **Fix:** the API now matches the page's contract. The page's status chips now understand the board statuses (`OFF_TRACK`/`AT_RISK` were rendering green) and show readable labels; no-data / no-target chips are neutral. Verified in the browser.
- **Repro (crawl and walkthrough):** open `/reports/board-pack` as admin or contributor → "Application error: a client-side exception has occurred", `TypeError: Cannot read properties of undefined (reading 'length')`.
- **Cause:** contract drift with the API (BE-027): the page reads `quadrant.kpis.length` (`app/reports/board-pack/page.tsx:228`) but the API sends `topKpis`. With no error boundary (FE-004) the whole page dies.

### FE-013 · High · Live dashboard updates don't work (SSE blocked by CORS) — ✅ FIXED (via BE-028)
- Verified in the browser on a dashboard: preflight 204 and stream 200, with no CORS errors in the console.
- **Repro (crawl):** open any `/dashboards/[id]` page → console: "Access to fetch at 'http://localhost:4000/realtime/stream?dashboardId=…' from origin 'http://localhost:3000' has been blocked by CORS policy".
- **Cause:** BE-028. Dashboards never receive push updates, so new data shows only after a manual reload.

### FE-009 · Medium · Signed-out users are told "You don't have access" instead of being sent to sign in — ✅ FIXED
- **Fix:** `usePermissions` reports `authenticated`. The route guards send signed-out users to `/login?next=<page>`; all 108 bare login redirects now carry `next`; login returns there through `safeNextPath` (same-origin only, no open redirect). Browser: signed out `/alerts` → `/login?next=%2Falerts` → sign in → back on `/alerts`.
- **Repro (crawl, logged-out pass):** of the protected pages, **44 end on `/unauthorized`** ("You don't have access to this page … contact your administrator") and only 28 redirect to `/login`. Affected pages include `/alerts`, `/approvals`, `/ask`, `/dashboards`, `/dashboards/[id]`, `/kpis/*`, `/settings/*`, `/reports/*`, `/roles`, `/users`. E2E `audit-flow.spec.ts:156` hits the same thing (flaky there because of timing).
- **Cause (likely):** the app shell's page-access gate (`components/app-shell.tsx:424-431`, `router.replace('/unauthorized')`) evaluates with no permissions loaded and wins the race against the no-token redirect to `/login` (`:396`).
- **Impact:** a user whose session expired (or who follows a deep link) gets an access-denied page with no sign-in path, and after signing in isn't returned to the page they wanted.

### FE-010 · Low · Org units: flat list only — cycles and cross-tenant parents render as contradictions — ✅ FIXED
- **Fix (`6f323e2`):** units render depth-first under their parents (`treeOrder()`, cycle-safe); with BE-009 new cycles are rejected. A drag-and-drop org chart remains a possible enhancement.
- `/org-units` ("Teams") is a flat list with "Parent: X" text. No tree / org chart, though the spec and the previous app had one. With BE-009's cycle it shows "Audit Child — Parent: Audit Parent" and "Audit Parent — Parent: Audit Child". No crash.

### FE-011 · Low · Positions table doesn't show the track (IC / Management / Executive) — ✅ FIXED
- **Fix (`39759ab`, `182acc2`):** the page already groups rows under a track heading; the spec was stale. Each group now has `data-testid="positions-group-<track>"` and the spec asserts the row sits in the IC group.
- **Repro (E2E `positions-flow.spec.ts:68`):** create a position with track IC → the row shows `name | L5 | P5 | Delete`; the track the form collects isn't displayed.

### FE-002 · Medium · Role permissions can't be edited after creation; matrix is read-only and missing 7 permissions — ✅ FIXED
- **Fix (`e465594`, `4d51f7a`):** the matrix is editable (draft → Save / Reset) and lists all 25 permissions from a shared `PERMISSION_GROUPS` asserted equal to `ALL_PERMISSIONS`. Admin roles are locked; a 202 `APPROVAL_REQUIRED` shows "submitted for approval" (permissions and presets).
- **Found while fixing — escalation:** a non-admin `ROLES_MANAGE` holder could create/edit/preset a role with any permission or `isAdmin`. Only added permissions are now checked against the caller's own (removals allowed), `isAdmin` changes are admin-only, the check runs before the approval gate, and `applyPreset` now honours an active approval workflow (it bypassed it). Live: add-lacked 403, remove 200, isAdmin 403, ADMIN preset 403; admin 200.
- Still open from this finding: multi-parent inheritance editor / hierarchy view (spec), and the BE-004 scope-editor question.
- **Repro (walkthrough):** `/roles` → select any role → "Permission matrix" shows each capability as text ("granted" / "not granted") with no toggles. The only edits are presets, delete, and "Save access config" (scope/limits/pages).
- **Evidence:** `apps/web/src/app/roles/page.tsx` calls only `createRole`, `deleteRole`, `applyRolePreset` and `updateRole(role.id, buildPayload())`. `buildPayload()` (line 632) never sends `permissions`.
- **Also:** the header says "18 canonical permissions" and the matrix lists 18, but the contract now has 25 (Administrator shows 25). `KPI_IMPORT`, `REPORTS_MANAGE`, `ANALYTICS_FORECAST`, `EXPORTS`, `AUDIT_VIEW`, `INTEGRATIONS_MANAGE`, `BILLING_MANAGE` are invisible and ungrantable in the UI.
- **Also:** the scope editor offers Analytics / Insights / People / Org scopes that the API never enforces (BE-004).
- **Impact:** to change a role's capabilities an admin must apply a preset or delete and recreate the role (re-assigning users). The spec's "role matrix UI, multi-parent inheritance editor, role hierarchy SVG" isn't implemented. (The invalid seeded keys in BE-011 don't break the UI only because it never re-sends permissions.)

### FE-003 · Medium · Objectives in a parent cycle silently disappear from the OKR alignment tree — ✅ FIXED
- **Fix (`d50aefd`):** `buildAlignmentTree()` promotes objectives unreachable from a root (self-parented / A↔B cycle) to roots and drops the closing edge, so each renders once and the walk terminates. With BE-020 new cycles can't be created; this covers legacy data.
- **Evidence:** `apps/web/src/app/okrs/page.tsx:162-178` — roots are objectives without a visible parent, and `renderTree` (line 483) walks down from roots. An objective that is its own parent (allowed by the API — BE-020), or any A↔B cycle, is never a root and never reached, so it vanishes from the tree with no error. No infinite loop.

### FE-004 · Low · No error boundaries or 404 page — ✅ FIXED
- **Fix (`470c5fd`):** `not-found.tsx`, `error.tsx` (Try again + digest) and `global-error.tsx`; smoke e2e covers the 404.
- **Evidence:** `apps/web/src/app` has no `error.tsx`, `global-error.tsx` or `not-found.tsx`. A render crash on any page falls through to Next's generic "Application error: a client-side exception has occurred" screen, and unknown URLs get the default 404.

### Verified OK (static)
- No HTML-injection sinks: no `dangerouslySetInnerHTML` / `innerHTML` writes; the Ask page renders LLM markdown without HTML by design (`app/ask/page.tsx:37`).
- User-controlled URLs aren't rendered as links (plugin `entryUrl`, task `externalRef`); `href`s come from internal routes or server-generated download URLs.
- Org-unit ancestry walk is cycle-safe (`app/org-units/page.tsx:205`, `seen` set).
