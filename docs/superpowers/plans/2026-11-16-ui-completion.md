# KPI Nexus — UI completion plan (make every page work end to end)

## Context

The 2026-11-16 walkthrough ran the app on a throwaway stack, crawled all 84 pages as four personas and inventoried every control. Every page loads; the defects are controls that do the wrong thing, do nothing, or are missing. Findings and evidence are in `docs/audit/ui-verification-plan-2026-11-16.md` (IDs `UI-001…016`, `X-01…10`). This plan turns those findings into ordered, test-first work so a user can go from signup to daily use without hitting anything broken.

**Owner decisions already taken**
1. Settings that save but do nothing → make each one work.
2. Setup wizard → build real manual steps.
3. Integrations "Connect" → real per-provider form.
4. Two unbuilt alert rule types and two placeholder widgets → build all four.
5. Sign-up → keep `/signup` only; `/register` redirects.

**Sign-offs this plan still needs** (each is called out where it lands)
- **ADR-002 — SSO without WorkOS.** The spec says "SSO via WorkOS"; paid SSO connections conflict with ADR-001 (nothing may charge). Plan: direct OIDC, then SAML, with open-source libraries.
- **ADR-003 — custom domains on free hosting.** How a tenant's hostname reaches the Vercel web app.
- **Permission sides** in §5.2 where the page and the API disagree.
- **Left out on purpose:** executing plugins (needs a sandbox), SMS (paid provider), card payments, Postgres/MySQL/S3 connector runners, fiscal-aware Timescale rollups.

## Ground rules for every item

- One finding (or sub-finding) per PR, on its own branch (`fix/…`, `feat/…`). Failing test first → fix commit → docs commit adding the fix-log row in `docs/audit/README.md`.
- Merge with `gh pr merge N --merge --match-head-commit <sha>` only after CI and Security pass on that exact head; confirm both on the resulting `main`; record `git revert -m 1 <merge>`.
- **Approving this plan is the approval to merge each listed PR once green.** Anything not listed is asked first.
- Test only on the throwaway stack (`kpi-uiwalk`, `.cache/uiwalk/`); never the dev database; never `prisma migrate dev`.
- Schema change = edit `packages/db/prisma/schema.prisma` + new folder in `packages/db/prisma/migrations/` + `pnpm db:check-migrations`; new tenant table = `organizationId` + index + policy in `packages/db/prisma/sql/rls-policies.sql`. Migrations are append-only.
- Route change = extend `apps/api/test/integration/cross-tenant.fuzz.spec.ts`, then `pnpm openapi:export && pnpm openapi:lint && pnpm sdk:regenerate` (CI checks the committed `apps/api/openapi.json`).
- API conventions: `@RequirePermissions`, `RequestContextStore.require()`, typed exceptions, long work through BullMQ. No new permission keys (25 is locked).
- Web conventions: keep every existing `data-testid`; new exported `packages/ui` component needs a story; gate with `<RequirePermission>` / `<PermissionGuard>`.
- Commit identity: `-c user.name='Muhammad Hasaan' -c user.email='131281292+MHasaan@users.noreply.github.com'`.

## Batch 0 — groundwork (shared pieces later batches use)

| # | Item | Change | Test |
|---|---|---|---|
| 0.1 | DOC-008 | Commit the audit plan, the three `uiwalk-*` entries in `.claude/launch.json`, a copy of this plan as `docs/superpowers/plans/2026-11-16-ui-completion.md`; add `UI-*` / `X-*` rows (open) to the fix log. | — |
| 0.2 | Confirm dialog + toast | `packages/ui/src/components/confirm-dialog.tsx` (`role="alertdialog"`, focus trap, Esc, danger tone, busy state, optional type-to-confirm) and `toast.tsx`; `apps/web/src/lib/use-confirm.tsx`, `use-toast.tsx`; mount in `apps/web/src/app/providers.tsx`. Stories for both. | `stories.spec.tsx`, component unit tests |
| 0.3 | Label map | `apps/web/src/lib/labels.ts`: scope, direction, frequency, KPI type, quadrant, health status (`ON_TRACK…`), band status, widget type, audit action + entity. `ScopeBadge` (`packages/ui/src/components/scope-badge.tsx`) shows its label, not the enum. | unit |
| 0.4 | `useAsyncData` | `apps/web/src/lib/use-async-data.ts` → `{data, error, loading, reload}`; replaces the error-swallowing `useAsync` in `apps/web/src/app/kpis/[id]/page.tsx:195-202`. | unit |
| 0.5 | Approval-pending helper | `api()` in `apps/web/src/lib/api-client.ts:118-131` returns a tagged `{approvalPending: true, requestId}` for HTTP 202 `APPROVAL_REQUIRED`; `isApprovalPending()` guard. | `api-client.spec.ts` |
| 0.6 | E2E register helper | `apps/web/e2e/helpers/org.ts`: `registerOrgViaApi(page)` (POST `/auth/register`, set tokens in localStorage). Move every spec that fills the `/register` form to it. No product change. | suite stays green |

## Batch 1 — wrong numbers (UI-001, UI-002, X-08)

**1.1 Date window keeps overlapping periods (API).**
- `apps/api/src/kpis/kpi-data.service.ts:434-436` (`listForKpi`) and `:379-380` (`dashboardSummary`): the caller's window becomes "period overlaps window": `periodEnd >= from` and `periodStart <= to`. The Layer-4 history clamp (`clampHistoryFrom`) stays exactly as it is.
- `apps/api/src/kpis/kpi-data.controller.ts:89-102`: a date-only `to` means the end of that day (UTC).
- Check the other `listForKpi` callers keep their meaning: `nlq/nlq.tools.ts:188,197,227`, `nlq/nlq.service.ts:275`, `reports/reports.service.ts:112`, `data-snapshots/data-snapshots.service.ts:46`.
- Tests: `kpi-data.service.spec.ts` (monthly point straddling a 30-day window is returned; current unfinished period is returned; clamp unchanged) and `test/integration/kpi-dashboard-summary.spec.ts`.

**1.2 Widgets use the newest point and plot oldest → newest (web).**
- New `apps/web/src/components/widgets/series.ts`: `latestPoint(points)`, `previousPoint(points)`, `toSeries(points)` (ascending by `periodStart`, then `recordedAt`), `periodLabel(point)`.
- Use it in `KpiCard.tsx:32,36`, `GaugeWidget.tsx:38`, `NumberWidget.tsx:19,23,26`, `PieChartWidget.tsx:24,35`, `TrendWidget.tsx:19`, `LineChartWidget.tsx:23`, `BarChartWidget.tsx:23`, `components/dashboard-grid/drill-down-chart.tsx`. Axis labels use the period, not `recordedAt`.
- Tests: `series.spec.ts`; new `e2e/dashboard-widgets.spec.ts` — three monthly points via the API, default 30d shows the newest value on the card, 1y shows the same value, line chart's last label is the newest period.

**1.3 One data load per dashboard, direction-aware colour.**
- New `components/dashboard-grid/dashboard-data.tsx` provider: one `getDashboardSummary(dateRange)` for the grid; widgets read `latestValue`, `status`, `attainmentPct`, target and unit from their row. Removes `listKpis()` per widget (`widget-renderer.tsx:65-67`).
- `KpiCard.tsx:18-28` colour comes from the server `status` (already direction-aware: `apps/api/src/kpis/kpi-health.ts:24`).

**1.4 Direction elsewhere.** `apps/web/src/app/kpis/scorecard/page.tsx:26-28` uses the row's `status`. `apps/api/src/reports/services/board-pack.service.ts` adds `direction` to movers; `apps/web/src/app/reports/board-pack/page.tsx:175-179` colours by it.

**1.5 Home sparkline is real.** `dashboardSummary` rows gain `spark: number[]` (last ≤ 12 values, ascending); `apps/web/src/app/dashboard/page.tsx:253-258` draws it.

## Batch 2 — per-unit and per-user KPIs, people (UI-003, UI-004, UI-010, UI-016)

**API**
- **2.1 `GET /kpis/:id/assignments`** (KPI_VIEW) → `{units:[{assignmentId, orgUnitId, unitName, inherited, targetValue, currentValue, status}], users:[{assignmentId, userId, fullName, targetValue, currentValue, status}]}`, filtered with `accessContext.kpiPointScopeWhere` so a caller sees only assignments in their scope. Lives in `apps/api/src/kpis/` beside `kpiSelect` (`kpis.service.ts:55-60`).
- **2.2 Who may record a per-unit value.** `recordForOrgUnitAssignment` (`kpi-data.service.ts:185-238`) today lets any KPI_DATA_ENTRY holder write for any unit. Add: admin / ORG scope, or the unit is in the caller's managed ∪ member units (`KpiVisibilityContext`); otherwise 403 `UNIT_NOT_IN_SCOPE`. Tests in `test/integration/kpi-data-scope.spec.ts`.
- **2.3 Create runs inheritance.** `kpis.service.ts:195-212` calls `recomputeInheritance` after `createMany` for PER_UNIT, as `OrgUnitKpisService.assign` does.
- **2.4 `PATCH /users/:id`** (USERS_MANAGE) in `apps/api/src/users/`: `{fullName?, roleId?, managerId?: string|null, positionId?: string|null}`. Guards: same tenant (`tenancy/assert-same-tenant.ts`), not own manager, no cycle in the manager chain, cannot change own role, cannot remove the last admin. Audit `User`/UPDATE.
- **2.5 Invite lifecycle.** `InviteUserDtoSchema` gains `managerId?`. New `POST /users/:id/resend-invite`, `POST /users/:id/cancel-invite` (INVITED only), `POST /users/:id/restore` (ARCHIVED → ACTIVE).

**Web**
- **2.6 Client functions** in `api-client.ts` (none exist today): `listKpiAssignments`, `listUnitKpis`, `assignKpiToUnit`, `overrideUnitKpiTarget`, `unassignKpiFromUnit`, `recordUnitKpiData`, `assignKpiToUser`, `unassignUserKpi`, `updateUser`, `resendInvite`, `cancelInvite`, `restoreUser`. Add `emailSent` to `InviteResult` (`:410`).
- **2.7 `<RecordValueForm>`** (`apps/web/src/components/kpis/record-value-form.tsx`): value, period picker (defaults to the current period for the KPI's frequency; fiscal-aware after 6.4), note, busy state, shows `details.correctEndpoint` on `SCOPE_MISMATCH`. Used by `/kpis` row, KPI detail Data tab, `/my-kpis`, the unit KPI panel.
- **2.8 KPI detail** (`apps/web/src/app/kpis/[id]/page.tsx`):
  - Data tab (`:263-338`): ORG_WIDE records directly; PER_UNIT picks one of the units the caller may record for; PER_USER shows the caller's own assignment or a link to My KPIs. Table gains a Unit / Person column.
  - New **Assignments** tab for PER_UNIT / PER_USER: list with value, target, status; add (unit picker / user search) and remove with confirm. Guards match the API (KPI_CREATE + GROUPS_MANAGE, KPI_CREATE + USERS_MANAGE).
  - Remove "assign later" copy from `components/kpis/kpi-form.tsx:555,583` or point it to the tab.
- **2.9 `/org-units`**: per-unit "KPIs" panel — list, assign, override target, unassign, record.
- **2.10 `/users/[id]`**: assign / unassign per-user KPIs; load the user with `GET /users/:id`; "not found" state; split the single `Promise.all` (`:91-95`).
- **2.11 `/users`**: edit drawer (role, manager, position); invite form adds position and manager; success toast from `emailSent`; resend / cancel invite; restore; Archive dialog with "transfer KPIs to" and "reassign reports to" (the offboard DTO already takes both); suspended users only under Active.
- **2.12 `/team`** works once managers exist; remove `team-list` from the empty state (`:90`).

**Tests:** integration for 2.1–2.5; e2e `per-unit-kpi.spec.ts` (create → assign unit → record as unit member → value on detail and unit panel; non-member gets no form), `user-management.spec.ts` (edit manager → `/team` lists the report; resend; restore), extend `user-kpi-views.spec.ts`.

## Batch 3 — sign-up and onboarding (UI-005)

**API**
- **3.1 Draft schema.** `packages/contracts/src/onboarding.ts`: `OnboardingDraftSchema` with real enums for every section (today only a TS interface, `apps/api/src/org-templates/template-payload.ts:11-61`). `PUT /onboarding/:id` validates each section it is sent. New `GET /onboarding/:id/validate` → `{problems:[{section, index?, field?, message}]}` (wraps `validateTemplatePayload` + schema errors). `complete` returns the same list in `details`.
- **3.2 More in the draft, applied by `complete()`** (`apps/api/src/onboarding/onboarding.service.ts:124-267`), one PR each:
  - a. Organisation: timezone, currency, locale, fiscal start month, week start; `sizeTier` enum aligned (the rich template's `SCALEUP` is dropped today).
  - b. KPIs: `units: string[]` for PER_UNIT → `KPIAssignmentOrgUnit` + `recomputeInheritance`; optional `targetValue`; owner = admin. (Today onboarding creates PER_UNIT KPIs with no assignment, which `POST /kpis` would reject.) Confirm whether `DRAFT` KPIs accept values; create `ACTIVE` if not.
  - c. Team: `team[]: {email, fullName, role, position?, unit?, manager?}` → INVITED users, unit membership, invitation emails after commit.
  - d. Admin password checked with `checkPasswordPolicy` (`apps/api/src/password/password-policy.ts:38`); welcome email; audit rows so "Recent activity" is not empty.
- **3.3 Checklist.** `apps/api/src/setup-checklist/setup-checklist.defaults.ts:19-34`: sensible order, plain labels (drop "(post-P7)"), an `href` per task. `SetupChecklistService` computes `done` from real state (channel exists, admin MFA on, connector exists, report scheduled, invite sent, objective exists, escalation level exists, domain verified, SSO active …) and merges it with the manual status.
- **3.4 Tour completion per user.** `PATCH /auth/me` accepts `tourCompleted` → sets the existing `User.onboardingCompletedAt`; `GET /auth/me` returns it.

**Web**
- **3.5 Wizard shell** in `apps/web/src/app/signup/wizard/page.tsx` + `apps/web/src/components/onboarding/wizard/*`: step rail | step content | AI rail; step in `?step=`; Back / Save & continue; keeps `useDraftSync` (`components/onboarding/draft-sync-ui.tsx`) and every current test id (`sync-status`, `wizard-org-name`, `count-*`, `admin-*`, `org-slug`, `wizard-complete`, `copilot-*`).
- **3.6 Steps** (each a list with add / edit / remove, saving its whole section through `edit({section})`):
  1. Organisation — name, industry, size, timezone, currency, locale, fiscal year start.
  2. Structure — unit types, units as a tree (parent picker).
  3. Roles & positions — permission matrix reused from `components/roles/role-permission-matrix.tsx`; at least one admin role enforced.
  4. KPIs — categories, KPIs (scope, type, direction, frequency, unit, quadrant, target, units for per-unit).
  5. Team — rows or pasted CSV.
  6. Review & finish — full lists, problems from `/validate` linking back to the step, admin account with labels, password rules, confirm field.
- **3.7 Quick vs Full.** Quick start shows steps 1 and 6 with the rest marked optional; Full shows all.
- **3.8 AI rail** (`components/onboarding/ai-copilot-rail.tsx`): proposal lists item names per section (expandable) with human labels; Apply buttons disable while busy (`:216,247`); the "organization" section is unticked when the user has already typed a name; a no-change suggestion says so (`:154`).
- **3.9 `/signup`** (`apps/web/src/app/signup/page.tsx`): email validation and field errors; "Sign in" link; template preview (`GET /org-templates/:slug`); gallery load error shown (`:65-67`); email kept in `CachedDraft` and prefilled as admin email (fixes the no-op at `wizard/page.tsx:72`).
- **3.10 One sign-up path.** `/register` redirects to `/signup`; `/login:141` links to `/signup`; `/accept-invitation` gains a sign-in link, correct path text (`:96`), and shows an expired invite at once (`:55-58`).
- **3.11 Checklist card** (`components/setup-checklist-card.tsx`): each row links to its page; errors shown (`:331-346`); finished state. **Tour** (`components/onboarding-tour.tsx`): Back, Esc, per-user completion.

**Tests:** `onboarding.spec.ts` / `onboarding-ai.spec.ts` (API) extended; `onboarding-wizard.spec.ts` gains a manual path that builds 2 roles, 2 units, 1 per-unit KPI and 1 invite without AI, then checks them on `/roles`, `/org-units`, `/kpis`, `/users`; P6 exit check (10 / 14 / 11 / 20 / 5 via template + edits).

## Batch 4 — features that are offered but do not work

**4.1 Live dashboard refresh (UI-006).**
- API: with `?dashboardId=`, `apps/api/src/realtime/realtime.controller.ts:33` loads that dashboard's widget KPI ids (through `DashboardsService`, so visibility applies) and passes them to `eventMatchesFilter` (`realtime.service.ts:22-57`), which matches data events on `kpiId ∈ set`. Update `realtime.service.spec.ts:94`.
- Web: `components/dashboard-grid/realtime-refresh.tsx` bumps a `refreshKey` that the 1.3 provider and `WidgetRenderer` (`:85`) depend on; small "Live" indicator.
- Test: `e2e/uc05-realtime.spec.ts` asserts the card's shown value changes with no reload (remove the reload fallback at `:145-171`).

**4.2 Automations (UI-007).**
- API: `apps/api/src/workflows/dto/workflow.dto.ts` — `rule` and `action` become discriminated unions matching `rule-evaluator.ts` and `action-dispatcher.service.ts:10-28` (untyped records today).
- Web `apps/web/src/app/workflows/page.tsx:79-87`: send `triggers:['kpi_changed']`, `rule:{kind:'kpi_value', kpiId, operator:'>'…, value}`, `action:{kind:'create_task', title}`; KPI picker instead of a typed id; enable / disable, edit, "Run now", delete with confirm (`updateWorkflow`, `triggerWorkflow` added to `lib/collab-client.ts:217-244`).
- Test: UI version of `p7-collaboration.spec.ts:203-230` (create → record value → task appears).

**4.3 Approvals (UI-008).**
- API `GET /approvals/requests` adds `canDecide`, `requesterName`, `entityLabel` (`approval-request.service.ts:10-23`).
- Web `apps/web/src/app/approvals/page.tsx`: inbox for everyone; workflow setup inside `PermissionGuard ORG_SETTINGS` (not the page-wide `RequirePermission` at `:224`) and loaded only when permitted (`:125-134`); all three entity types always listed (the PUT is an upsert) with a multi-role picker; Approve / Reject only when `canDecide`; proposed vs current shown; busy states.
- Test: new `e2e/approvals.spec.ts` (admin enables KPI_DEFINITION → editor edits → approver approves → change applied; requester sees no buttons).

**4.4 Edits under approval (UI-011).** `components/kpis/kpi-form.tsx:340-341`, the Targets tab and `/roles` use `isApprovalPending()` (0.5) → "Sent for approval" with a link to `/approvals`.

**4.5 Alert rule types (UI-009).** New in `apps/api/src/alert-engine/evaluators/`:
- `dynamic-stddev.ts` — last `windowSize` values (newest by `periodStart`, excluding the new one) through `detectOutlier` (`apps/api/src/kpis/outlier-detector.ts:31`); fires when `|z| ≥ sigmas`; needs ≥ 2 values.
- `rate-of-change.ts` — percent change against the latest value recorded at or before `now − windowMinutes`; fires when the change reaches `pctChange` in its direction.
- `composite.ts` — AND / OR over sub-rules.
- `alert-engine.service.ts:54-60` loads history once per KPI and calls them. Unit tests per evaluator; `test/integration/alerting.spec.ts` fires each type.
- Web `/alerts/new`: recipients by role and user (the API already has `notifyRoleIds` / `notifyUserIds`), cooldown, description, "who will be notified" preview; a level with people but no channel is valid.

**4.6 Widgets.** `ActivityWidget.tsx` reads `GET /activity?limit=N`; `StrategyMapWidget.tsx` groups summary rows by quadrant with status counts and links to `/kpis/scorecard`. `/share/[token]` renders line, trend, list, gauge and pie properly and honours the grid (`:74-101`).

**4.7 Channel test.** `notification-channels.controller.ts:83-89` returns a clear failure (`{sent:false, error}`) instead of a 500; an email channel with no recipients is rejected on save. Web `alerts/channels/page.tsx:128-140,286-293`: banner tone follows the outcome; edit a channel; delete with confirm. SMS is removed from the create form (paid provider).

## Batch 5 — reachability and permissions (UI-012, UI-013, X-05, X-09)

**5.1 Links.**
- Sidebar `NAV_GROUPS` (`components/app-shell.tsx:108-160`) + `lib/page-routes.ts`: My KPIs, Team, Automations, Connectors, Plugins, Billing; mentions bell gets an unread badge (`mentionUnreadCount`).
- KPI detail header: Edit, Delete, Analytics menu (Forecast, Anomalies, What-if, Embed); tab in `?tab=` so `/kpis/tree:89` lands on Cascade.
- Widget title opens the drill-down; `/reports` links to the board pack; `/settings` links to Integrations, Alert channels, Automations.

**5.2 Page ↔ API permission table** — one PR per group, each adding its rows to `e2e/gated-page-loads.spec.ts` and a new `e2e/permission-buttons.spec.ts` (contributor sees no button the API will refuse).

| Group | Change (recommended side) |
|---|---|
| Forecast / what-if | API → `ANALYTICS_FORECAST`; page matches. **Sign-off: permission change in the API; check role presets.** |
| Anomalies | API → `ANALYTICS_VIEW`; Confirm button behind KPI_EDIT. **Sign-off as above.** |
| `/ask` | Page and nav → `INSIGHTS_VIEW` (API unchanged). |
| KPI pages | Import page → KPI_CREATE; category add → KPI_CREATE, delete → KPI_DELETE; archive restore / purge, detail-tab forms and deletes, "Use template" hidden without the API's permission. |
| Dashboards | Edit / Settings / Add widget / Snapshot / capture / delete behind DASHBOARD_MANAGE; `/dashboards/archive` gated DASHBOARD_VIEW. |
| Reports | New / Pause / Delete behind ORG_SETTINGS (or move the API to REPORTS_MANAGE — **sign-off**; recommended, the key exists for this). |
| Alerts / AI | `/alerts/new` gated KPI_EDIT; recommendation buttons behind KPI_EDIT. |
| OKRs | Edit → KPI_EDIT; Sync behind KPI_EDIT. |
| Admin pages | `/integrations` and `/connectors` forms → INTEGRATIONS_MANAGE or ORG_SETTINGS; `/settings/audit` → AUDIT_VIEW or ORG_SETTINGS; `/positions` gated POSITIONS_MANAGE. |

**5.3 Names without USERS_VIEW (X-05).** New `POST /users/names {ids}` (any member; returns `{id, fullName}` for the given ids only — no listing). Pickers use the existing `GET /search?types=user` (already scoped by `visiblePeopleIds`). Used by `/okrs`, `/okrs/[id]`, `/tasks`, comments, `/org-units`.

**5.4 Dead ends.** `/unauthorized`, not-found and the error page offer Sign out and the first page the user may open (fixes the `/dashboard` loop). A non-401 failure of `/auth/me` shows a retry, not "no permissions" (`lib/use-permissions.ts:199-205`).

**5.5 Shell.** `/plugins`, `/settings/retention`, `/settings/scim`, `/settings/sso`, `/status` render inside `AppShell`.

## Batch 6 — settings that take effect (UI-014, UI-015)

**6.1 Organisation formats.**
- Web: `apps/web/src/lib/org-settings-context.tsx` (same pattern as `lib/terminology-context.tsx`) + `apps/web/src/lib/format.ts` (`formatDate`, `formatDateTime`, `formatNumber`, `formatCurrency`, `formatKpiValue`) driven by org timezone, locale, currency, date and number format. Replace the 69 inline `toLocale*` calls (KPI detail, alert detail, board pack, report detail, snapshots, tasks, widgets, …) in four PRs by area.
- `/settings/organization`: pickers for timezone (`Intl.supportedValuesOf('timeZone')`), currency, locale; API validates them (`organizations/dto/update-organization.dto.ts:11-68`).
- API: report files and emails format with the org's settings; scheduled reports run on the org's timezone (BullMQ repeat `tz`).

**6.2 Personal language and timezone.** `UpdateProfileDtoSchema` (`auth/auth.controller.ts:39-43`) accepts `language`, `timezone`; `GET /auth/me` returns them; `i18n/locale-provider.tsx` starts from the user's language, then the org locale; the profile Preferences tab saves to the server. Delete dead `components/locale-picker.tsx`.

**6.3 Branding.**
- API: public `GET /public/branding?slug=` (later also by host, 6.9) → name, logo, favicon, colours.
- Web: `BrandingProvider` sets `--accent-primary` / `--ring` (hex → HSL triplet; colours failing 3:1 contrast are refused on save; dark value derived); sidebar brand block (`app-shell.tsx:498-523`) shows the org's logo and name; favicon link; `(auth)/layout.tsx` branded when the org is known. Invitation and alert emails carry the logo and colour.

**6.4 Fiscal calendar and week start.**
- `packages/contracts/src/fiscal.ts`: `fiscalYearRange`, `fiscalQuarterRange`, `weekRange`, `currentPeriod(frequency, date, cfg)`; typed `fiscalCalendar` (`{startMonth 1–12}`).
- Used by: `RecordValueForm` default period (2.7); `okrs/page.tsx:55-65` current quarter; `nlq/nlq.tools.ts:95-103` week buckets; dashboard range presets ("This quarter", "This fiscal year"); board pack and report period labels. `/settings/fiscal`: fields can be cleared (`:78-79`).

**6.5 Password policy.**
- `User.passwordChangedAt` (migration), set at every password write (`account.service.ts:134`, `password-reset.service.ts:125`, `auth.service.ts:311-317`, register, onboarding).
- `auth.service.ts` login (after the MFA step): expired → 401 `PASSWORD_EXPIRED`; `(auth)/login/page.tsx:35-41` offers "Email me a reset link". Register and onboarding enforce the policy. Reset and accept pages list the rules. Blank minimum length rejected.

**6.6 Personal notification preferences.**
- People named on an escalation level (`escalation.processor.ts:75-85`) get their own deliveries: `NotificationDelivery` gains `kind` (nullable; migration) so a row can be a personal email.
- `NotificationDispatcherService.dispatch` (`notification-dispatcher.service.ts:38`) reads each recipient's `notificationSettings`: muted kinds are skipped; inside the mute window delivery waits until it ends; `digestMode` DAILY / WEEKLY collects into one email sent by a new repeatable job (pattern: `onboarding/onboarding-cleanup.producer.ts`).
- `/settings/notifications`: loading state before the form is editable; mute window can be cleared (`:82-83`); "Delivery log" link only for admins.

**6.7 Retention.**
- New `retention-purge` queue (producer + processor copied from `onboarding-cleanup.*`), daily. For each active `RetentionPolicy` it deletes rows older than `days` in batches under `runWithBypass`, per org, for the five entity types in `retention/retention-tiers.ts`; sets `lastRunAt` and a new `lastRunDeleted`; writes an audit row.
- API: `PUT /retention-policies/:entityType {days, isActive}`, `POST /retention-policies/run {dryRun}` (counts first).
- Web `/settings/retention`: per-type days, last run and rows removed, "Preview" then confirm.

**6.8 SSO — needs ADR-002.**
- OIDC first (`openid-client`): `SsoConfig` gains issuer, client id, encrypted client secret (migration; reuse `integrations/integration-crypto.ts`). Public routes `GET /sso/discover?org=`, `GET /sso/login?org=` (PKCE, state and nonce in Redis), `GET /sso/oidc/callback` → `SsoService.handleVerifiedLogin` (`sso.service.ts:27-73`, exists, no caller today) → one-time code → web `/sso/callback` exchanges it (`POST /sso/exchange`) and calls `setTokens`. Issuer fetches go through the existing SSRF guard.
- Login page: "Sign in with SSO" (asks the org, or uses the custom host). `/settings/sso`: all fields, default role, the redirect address to paste at the IdP, "Test connection".
- SAML second (`@node-saml/node-saml`): `POST /sso/saml/callback`, certificate field, metadata address.
- Tests: integration against a Keycloak container added to the throwaway compose.

**6.9 Custom domains — needs ADR-003.**
- API: `GET /public/org-by-host?host=`; CORS origin callback in `main.ts:56-67` allows verified domains (cached); email links use the org's primary domain; `CustomDomain` gains `status` and `isPrimary`.
- Hosting step behind a `DomainProvisioner`: `manual` (default — shows the CNAME and the one step the owner does in Vercel) and `vercel` (when a token is configured; adding a domain is free on Hobby).
- Web: host-aware login and branding; Verify busy state; delete with confirm. Verified in the local rehearsal with `*.localhost` names; real DNS only after go-live.

**6.10 Integrations (UI-015).**
- `packages/contracts/src/integration-providers.ts`: what each provider needs — Slack: workspace (team) id + signing secret; Teams: webhook address (creates the Teams alert channel); Jira: generated webhook secret and the address to paste into Jira.
- API: validate per provider on create; `PATCH /integrations/:id` (uses the unused `rotateTokens`); `POST /integrations/:id/test`; status PENDING until the test passes; Slack signature checked with the connection's own secret (`slack.service.ts:49`), env secret as fallback.
- Web `apps/web/src/app/integrations/page.tsx:26-69`: a form per provider with copyable addresses and a Test button; Webhooks / API keys / Email-in cards become links; disconnect with confirm.
- `/connectors`: KPI picker; edit (`PATCH` exists); run result shown (`ConnectorRunResult`); rows and error per run.

**6.11 Billing.** Plan can be changed by BILLING_MANAGE (`POST /billing/plan` exists) — clearly "no payment in this deployment"; remove the dead Upgrade button. Enforce the dashboards quota (`assertWithinQuota` is only called for KPIs) and plan features (`hasFeature` has no caller) with 402 `FEATURE_NOT_IN_PLAN`.

**6.12 AI settings.** `/settings/ai:298-318`: blank cap rejected; monthly cap, what happens at the cap (`circuitBreaker`), fallback provider and model, per-feature cap; masked key field. `ai-router.service.ts` enforces `perFeatureCapUsd` (stored, never read).

**6.13 Audit.** `GET /audit` gains `from` / `to` and a next cursor; `GET /audit/export` (CSV; AUDIT_VIEW + EXPORTS). Page: date and person filters, Load more, Export.

**6.14 Small settings.** API keys: copy feedback, revoke confirm, last used. Webhooks: confirm on delete and rotate. SCIM: copy and dismiss the token, show the base address. Plugins: stays a catalogue, labelled as such.

## Batch 7 — safety and polish, one pattern at a time

| # | Pattern | Where |
|---|---|---|
| 7.1 | Confirm dialog (0.2) replaces missing confirms and all `window.confirm` | KPIs (list, category, target, band, benchmark, cascade); dashboards (widget, dashboard, share, snapshot); people (role, position, unit, member, merge); tasks card "×" (also visible without hover); reports; channels, webhooks, API keys, SCIM, domains; connectors, plugins, integrations; access override clear |
| 7.2 | Errors shown, never swallowed | KPI detail tabs (0.4) and their deletes (`:502,605,701,838,862`); alerts bell; global search; saved views; dashboard range; widget delete / move (`grid.tsx:93-117`); clipboard copy; report form pickers; AI settings load |
| 7.3 | Labels and names instead of enums and ids (0.3) | KPI list / detail / dashboard badges; alert detail KPI + rule; insights KPI; lineage; activity rows; profile role (`components/profile/account-tab.tsx:148`); untitled widget header (`grid.tsx:163`) |
| 7.4 | Forms | Busy state on every submit; blank ≠ 0 (KR value `okrs/[id]:285`, workflow value); clearable fields — update DTOs accept `null` for target, thresholds, owner, category, unit (`kpis/dto/create-kpi.dto.ts:87`) and the form sends it (`kpi-form.tsx:318-331`); validation for cron, horizon, threshold, delta |
| 7.5 | Paging | Alerts (cursor); alert delivery trail filtered by alert on the server (`api-client.ts:1847`) |
| 7.6 | Test leftovers | Hidden duplicate buttons on `/dashboards/[id]:433-455,524-530` and `/alerts:192-213`; list test ids inside empty states; dead `series-chart.tsx`; update the specs that used them |
| 7.7 | Per-page remainder | Thresholds colour input + labels; cascade method and weight; target types; mentions rows (API joins comment text, author, entity link); comments edit / delete, real count, markdown or drop the hint; activity filter (case-insensitive entity match in `activity.service.ts:41`); `/ask` follow-ups carry the previous turn; recommendations Generate; tasks quick-add keeps text on failure; MFA QR code; session "this device"; share-link expiry; report download link refreshed on click; dashboard-create retry does not duplicate; KPI picker cache cleared on sign-out; global search keys; org-unit edit parent / description; position edit; role rename, member count, hierarchy; import file upload |

## Batch 8 — click-through and regression net

- A Playwright spec for every control no test clicks today (the "Check" lines in the audit plan): global search, mobile drawer, theme, dashboard tabs and range; KPI filters and saved views; Formula / Cascade / Thresholds / Benchmarks / Lineage tabs; all widget types; dashboard settings, unit assignments, snapshots, custom range, print; alert resolve, rule pause / edit / delete, all rule types; insights generate / dismiss; OKR edit / delete / sync; task drag, dialog, filters; access centre; profile password, MFA, session revoke; report pause / delete; webhook rotate; password-protected share link; embed page.
- Rerun the 4-persona crawl (`AUDIT_CRAWL=1 AUDIT_OUTPUT_DIR=…`, `-c .cache/startup.config.ts`): 0 errors, and no contributor 403s before a redirect.
- One run of the AI pages with a real key.
- Docs: fix log closed out; `HANDOFF.md`, `README.md`, `TODOS.md`, `docs/design/frontend-requirements/*` (new test ids) updated; ADR-002 and ADR-003 added.

## Every page → the work that touches it

| Page | Items |
|---|---|
| `/` · `/login` · `/register` · `/forgot-password` · `/reset-password` · `/accept-invitation` | 3.10, 6.3, 6.5, 6.8 |
| `/signup` · `/signup/wizard` | 3.1–3.9 |
| App shell · search · bell · tour · checklist | 3.3, 3.4, 3.11, 5.1, 6.3, 7.2, 7.7 |
| `/dashboard` | 1.1, 1.5, 3.3, 7.2 |
| `/unauthorized` · not-found · error · `/status` | 5.4, 5.5 |
| `/kpis` · `/kpis/new` · `/kpis/[id]/edit` | 2.7, 2.8, 4.4, 7.1, 7.3, 7.4 |
| `/kpis/[id]` | 2.7, 2.8, 5.1, 5.2, 7.1–7.4, 7.7 |
| `/kpis/categories` · `/import` · `/tree` · `/scorecard` · `/templates` · `/archive` | 1.4, 5.1, 5.2, 7.1, 7.7 |
| `/kpis/[id]/forecast` · `/anomalies` · `/whatif` · `/embed` | 5.1, 5.2, 7.1, 7.4 |
| `/dashboards` · `/new` · `/archive` | 5.2, 7.1, 7.7 |
| `/dashboards/[id]` · `/share` · `/snapshots` · `/widgets/[wid]` | 1.1–1.3, 4.1, 4.6, 5.1, 5.2, 7.1, 7.2, 7.6 |
| `/alerts` · `/new` · `/[id]` · `/rules` · `/channels` | 4.5, 4.7, 5.2, 7.1, 7.3, 7.5 |
| `/insights` · `/recommendations` · `/ask` | 5.2, 7.3, 7.7 |
| `/okrs` · `/okrs/[id]` · `/tasks` | 5.2, 5.3, 6.4, 7.1, 7.4, 7.7 |
| `/approvals` · `/workflows` | 4.2, 4.3, 5.1 |
| `/me/mentions` · `/activity` · comments | 5.1, 5.3, 7.7 |
| `/users` · `/users/[id]` · `/team` · `/my-kpis` | 2.4–2.12 |
| `/roles` · `/settings/access` · `/positions` · `/org-units` | 2.9, 5.2, 5.3, 7.1, 7.7 |
| `/profile` · `/me/sessions` | 6.2, 7.3, 7.7 |
| `/reports` · `/new` · `/[id]` · `/board-pack` | 1.4, 5.1, 5.2, 6.1, 6.4, 7.1, 7.7 |
| `/integrations` · `/slack/link` · `/connectors` · `/connectors/[id]` · `/plugins` | 5.2, 5.5, 6.10, 6.14, 7.1 |
| `/settings` · `/organization` · `/branding` · `/fiscal` | 5.1, 6.1, 6.3, 6.4 |
| `/settings/password-policy` · `/notifications` · `/notifications/dlq` | 6.5, 6.6 |
| `/settings/ai` · `/api-keys` · `/webhooks` · `/audit` | 6.12, 6.13, 6.14 |
| `/settings/retention` · `/sso` · `/scim` · `/custom-domain` · `/billing` | 5.5, 6.7, 6.8, 6.9, 6.11, 6.14 |
| `/share/[token]` · `/embed/kpi/[token]` | 4.6, 8 |

## Order, size and dependencies

- Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Batch 0 unblocks the rest; 6.4 improves 2.7 but does not block it; 6.9 builds on 6.3.
- Rough size: about 120 PRs — Batch 0: 6 · 1: 6 · 2: 14 · 3: 16 · 4: 12 · 5: 14 · 6: 28 · 7: 16 · 8: 8.
- Schema migrations: 6.5 (`passwordChangedAt`), 6.6 (`NotificationDelivery.kind`), 6.7 (`lastRunDeleted`), 6.8 (SSO fields), 6.9 (domain status). All additive.

## Verification

Per PR:
1. The new test fails before the fix and passes after it.
2. `pnpm turbo typecheck lint test` (after `source .cache/activate.sh`).
3. API integration: `pnpm --filter @kpi-nexus/api test:int` (Testcontainers), including the cross-tenant fuzz for any new route.
4. Browser suite on the throwaway stack: `cd apps/web && pnpm exec playwright test <spec> -c .cache/startup.config.ts`.
5. Live check in the built-in browser against `uiwalk-web` (rebuild with `NODE_ENV=production`), with a screenshot or page text recorded in the PR.
6. CI and Security green on the exact head, then again on `main`.

End of each batch: rerun the 4-persona crawl and the full browser suite; update `HANDOFF.md`.

End of plan: the audit plan's per-page "Fix / Build / Check" lines are all closed in the fix log, the crawl is clean, and a manual pass as a brand-new organisation — signup → manual wizard → invite → record org-wide, per-unit and per-user values → dashboard shows them live → alert fires → approve an edit → report runs — completes without a dead end.
