# UI verification plan — every page (2026-11-16)

A page-by-page plan of what to fix, build and re-check so that a real user going from signup to daily use finds nothing broken or missing. It is a plan only: no product code was changed.

## 1. How this was checked

| Method | What it covered |
|---|---|
| Ran the app | Production build of the web app, API and ML sidecar on a throwaway Docker stack (`kpi-uiwalk`, own ports and volumes, `helios` seeded, AI mocked). The development database was not touched. |
| Page crawl | All 84 routes × 4 passes (admin, contributor, signed out, admin at 375 px), 336 visits. Output: `.cache/uiwalk/crawl/`. |
| Live walk | Landing → signup → wizard → AI draft → finish → dashboard and tour as a new organisation; then the demo org's dashboard, a per-unit KPI's tabs, workflows, profile and activity. |
| Code inventory | Every page's controls, the API call behind each, its permission gate, its states, and which Playwright spec (if any) clicks it. |
| Route cross-check | All 176 API calls in the web app match a route in `apps/api/openapi.json`. 47 API operations have no caller in the web app. |

**Evidence tags used below**
- **[live]** — seen in the running app.
- **[crawl]** — from the 336-visit crawl.
- **[code]** — read in the source, not yet reproduced. Reproduce first; that reproduction is the failing test.

**What the crawl says:** every page loads. Admin at desktop and phone width: 0 crashes, 0 failed requests, 0 horizontal overflow. Signed-out users are sent to `/login`. So the problems are not "pages that crash" — they are controls that do the wrong thing, do nothing, or are missing.

**Not checked live:** most of the [code] items; real AI answers (mock used); anything needing an outside account (Slack, Teams, Jira, WorkOS, SCIM, DNS); email content; the 177 existing browser tests (they pass in CI on `7f4a27a`).

## 2. Summary

Severity follows `docs/audit/README.md` (Critical / High / Medium / Low).

### Critical — wrong numbers or a dead core flow

| ID | Problem | Evidence |
|---|---|---|
| UI-001 | Dashboard widgets show an old value as "latest". On Company Overview, MRR shows 477,810.97 at 90d and 380,000 at 1y; the real latest is 498,000. Charts run newest → oldest. | [live] |
| UI-002 | Dashboard date range drops any period that is not wholly inside it. The default 30d range shows "No data" on every card of the demo dashboard. | [live] |
| UI-003 | Values for a per-unit KPI cannot be recorded anywhere in the web app. 19 of the 37 demo KPIs are per-unit. | [live] + [code] |
| UI-004 | Nothing in the UI assigns a KPI to a unit or a user after it is created (the form says "assign later"). `/my-kpis`, `/team` and the KPI list on a user stay empty in a real org. | [code] |
| UI-005 | The setup wizard is one screen. Roles, positions, units and KPIs can only be added by the AI co-pilot, and the draft's contents cannot be seen, edited or removed — only counted. | [live] |

### High — a feature does not work as offered

| ID | Problem | Evidence |
|---|---|---|
| UI-006 | Dashboard live refresh does nothing (events carry no dashboard id; widgets do not reload). The browser test hides it by reloading the page. | [code] |
| UI-007 | "Create automation" on `/workflows` always fails with "Invalid request" (400). No page links to `/workflows`. | [live] |
| UI-008 | `/approvals` sends everyone without ORG_SETTINGS to `/unauthorized`, so approvers cannot approve. A new org has no approval workflow and no way to create the first one. | [crawl] + [code] |
| UI-009 | Alert rule types "Dynamic (std-dev)" and "Rate of change" can be created but never fire. | [code] |
| UI-010 | A user's manager, role and position cannot be changed after the invite. Nothing ever sets a manager, so `/team` is empty outside the seed. | [code] |
| UI-011 | With an approval workflow active, saving a KPI edit sends the user to `/kpis/undefined`; adding a target looks like nothing happened. | [code] |
| UI-012 | Pages no link leads to: forecast, anomalies, what-if, embed, widget drill-down, board pack, workflows. Not in the sidebar: `/team`, `/my-kpis`, `/me/mentions`, `/connectors`, `/plugins`, `/billing`. | [live] + [code] |
| UI-013 | The page and the API disagree on the permission needed (17 places, listed in §3). Users see a page or button and then get a 403, or are bounced from a page they are allowed to use. | [code] + [crawl] |
| UI-014 | Settings that save but change nothing: branding, fiscal calendar, org timezone / currency / locale, personal notification preferences, password max age, retention tiers, SSO, custom domain. | [code] |
| UI-015 | "Connect" on `/integrations` marks Slack / Teams / Jira as connected without any sign-in or token. | [code] |
| UI-016 | Inviting a user shows no success message outside development. | [code] |

### Medium and Low
Listed per page in §4. The recurring ones are grouped in §3.

## 3. Problems that repeat across pages

Fix each as one pattern, page by page, not as one big change.

**X-01 Deletes with no confirmation** [code]. KPI, KPI category, target, band, benchmark, cascade link, dashboard widget, role, position, org unit, unit member, merge units, archive user, task card "×", workflow, connector, plugin, channel, webhook (and rotate secret), SCIM token, custom domain, API key, retention tier, integration disconnect, clear access override. Five places use the browser's `window.confirm` instead of the app's dialog (purge user, dashboard delete, share revoke, snapshot delete, report delete, embed revoke).
→ One shared confirm dialog in `packages/ui`; use it everywhere; name the thing being deleted.

**X-02 Failures that show nothing** [code]. Empty `catch` blocks: KPI detail tabs (a failed load leaves a blank tab), tab delete buttons, alerts bell, setup checklist, global search ("No results." on error), saved views, template gallery, dashboard time range, widget delete and move, formula clear, clipboard copy, report form pickers, AI settings load.
→ Every load and every action shows the API's message or a retry.

**X-03 Internal text shown to users** [live]. `PER_UNIT`, `ORG_WIDE`, `LOWER_IS_BETTER`, `INTERNAL_PROCESS`, `no_bands`, `kpi_card`, `orgUnits`, `kpiCategories`, "UPDATE kpi", "(post-P7)", role shown as an id on the profile, KPI and rule ids on alert detail, `KPI <id>…` on insights, raw ids in lineage.
→ One label map for enums; names (with links) instead of ids.

**X-04 Page and API permission mismatches** (UI-013) [code].

| Where | Page / button shows on | API needs |
|---|---|---|
| `/kpis/[id]/forecast`, `/anomalies`, `/whatif` | ANALYTICS_VIEW | INSIGHTS_VIEW |
| `/ask` | ANALYTICS_VIEW | INSIGHTS_VIEW |
| `/kpis/import` | KPI_VIEW | KPI_CREATE |
| `/kpis/categories` add / delete | KPI_EDIT | KPI_CREATE / KPI_DELETE |
| `/kpis/archive` restore / purge | not hidden | KPI_EDIT / KPI_DELETE |
| `/kpis/[id]` formula, cascade, targets, bands, benchmarks | not hidden | KPI_EDIT |
| `/kpis/templates` "Use template" | not hidden | KPI_CREATE |
| `/dashboards/[id]` edit, settings, add widget, snapshot | not hidden | DASHBOARD_MANAGE |
| `/dashboards/[id]/snapshots` capture, delete | not hidden | DASHBOARD_MANAGE |
| `/dashboards/archive` | no page gate | DASHBOARD_VIEW |
| `/positions` | no page gate | POSITIONS_MANAGE |
| `/reports` new, pause, delete | REPORTS_VIEW | ORG_SETTINGS |
| `/alerts/new` | ALERTS_VIEW | KPI_EDIT |
| `/recommendations` actioned / dismiss | not hidden | KPI_EDIT |
| `/okrs` edit; `/okrs/[id]` sync | KPI_CREATE; not hidden | KPI_EDIT |
| `/integrations` page | ORG_SETTINGS | INTEGRATIONS_MANAGE (also the sidebar) |
| `/settings/audit` page | ORG_SETTINGS | AUDIT_VIEW (also the sidebar) |
| `/connectors` create, delete | ORG_SETTINGS | INTEGRATIONS_MANAGE allowed |
| `/approvals` | ORG_SETTINGS for the whole page | approvers need none |

→ For each row decide which side is right (usually the API), then make the page match and add the row to `gated-page-loads.spec.ts`.

**X-05 Pages that need the user list** [crawl]. `/okrs`, `/okrs/[id]`, `/tasks`, comments and `/org-units` call `GET /users`, which a contributor may not read (403). They then show "—", "Unassigned", "Unknown user" or raw ids, and @mentions do not resolve.
→ A small "people directory" read (id + name only) that any signed-in member may use.

**X-06 Forms**. No busy / disabled state on many submit buttons (double submit); blank numbers saved as 0 (AI daily cap, password minimum length, key result value, workflow value); fields that cannot be cleared (KPI edit, fiscal, mute window, key result); free-text ids where a picker is needed (workflow KPI, connector KPI); no validation on email (signup, wizard), cron, timezone, currency, horizon, threshold.

**X-07 Lists capped with no paging**: alerts (100), audit (100), alert delivery trail (100).

**X-08 Direction ignored** ("higher is better" assumed): scorecard "on target", board-pack movers, dashboard KPI card colour.

**X-09 Pages outside the app shell** (no sidebar, no way back): `/plugins`, `/settings/retention`, `/settings/scim`, `/settings/sso`, `/status`.

**X-10 Leftovers kept for tests**: hidden duplicate buttons on `/dashboards/[id]` and `/alerts` (their text leaks to screen readers and page text), list test ids that also appear in empty states, dead files `locale-picker.tsx` and `series-chart.tsx`.

## 4. Plan for each page

Each page lists: **Fix** (wrong today), **Build** (missing), **Check** (controls no test has ever clicked — click them once the fixes are in). "Loads" for all four passes is true for every page and is not repeated.

### 4.1 Public, auth and onboarding

#### `/` landing
- **Fix:** the landing page sends new users to `/signup`, the login page sends them to `/register` — two different sign-up flows [code]. Pick one (recommend `/signup`) and redirect the other.
- **Build:** the page is a headline and two buttons [live]. Add a short "what it does" section and a footer.
- **Check:** both buttons.

#### `/login`
- **Fix:** no field-level errors; an email that belongs to two orgs always signs into the oldest [code].
- **Build:** org picker when the email has more than one org; SSO entry only if SSO is made real (see `/settings/sso`).
- **Check:** MFA code step, show/hide password.

#### `/register`
- **Fix:** "slug taken" appears in the top banner, not on the slug field [code].
- **Decide:** keep or retire in favour of `/signup` (see `/`).

#### `/forgot-password`, `/reset-password`
- **Fix:** reset has no length check or strength meter in the browser [code].
- Covered end to end by `password-reset.spec.ts`.

#### `/accept-invitation`
- **Fix:** an expired invite looks valid until submit; the help text shows the wrong path (`/auth/accept-invitation`) [code].
- **Build:** "Already have an account? Sign in".

#### `/signup`
- **Fix:** an invalid email gives "Invalid request" with no field message [live]. A failed template load says "No templates available." [code]. "Quick start" and "Full setup" lead to the same screen [code].
- **Build:** a "Sign in" link [live]; a template preview before choosing.
- **Check:** Quick start, Full setup (no test clicks them).

#### `/signup/wizard` — UI-005
- **Fix [live]:** the email typed on `/signup` is not carried into "Admin email"; "Finish setup" with empty fields gives "Invalid request"; tiles read `orgUnits`, `kpiCategories`, `kpis`; admin fields have placeholders but no labels; applying the AI draft's "organization" section replaced the typed org name ("Walk Test Co" → "Mock Co") while the slug stayed.
- **Fix [code]:** "Apply selected" can be double-clicked; a suggestion that changes nothing gives no feedback.
- **Build (the main gap):** real steps — Organisation (name, industry, size, timezone, currency, fiscal year) → Roles → Positions → Org units → KPI categories → KPIs → Review — each with add / edit / remove, and the AI co-pilot filling the same lists. Show what the AI proposes (names, not counts) before it is applied. This is P6's exit criterion ("reproduce the seed org in one session"), which today only the AI path can meet.
- **Build:** password rules and confirm field; email verification or a welcome email (none was seen).

### 4.2 App shell and home

#### App shell (sidebar, header)
- **Fix:** the brand block shows "KPI Nexus / Workspace", not the org name, and has a switcher arrow that only links to `/dashboard` [live]. The mentions bell has no unread count [code]. The alerts bell polls for users without ALERTS_VIEW and hides failed acknowledgements [code].
- **Build:** sidebar entries for My KPIs, Team, Mentions, Connectors, Plugins, Billing, Automations (UI-012); impersonation banner (in the spec).
- **Check:** mobile drawer, collapse, theme toggle.

#### Global search (⌘K)
- **Fix:** errors show as "No results."; an org-unit result opens `/org-units` without selecting the unit [code].
- **Build:** arrow keys and Enter; loading state.
- **Check:** all of it — no browser test opens it.

#### Product tour, setup checklist, help drawer
- **Fix [live]:** checklist items only have Done / Dismiss — no link to where the task is done; order is odd ("Verify custom domain" first, "Add custom domain" thirteenth, SSO second); one item reads "Create your first OKR (post-P7)". Tour is text only, with no Back.
- **Fix [code]:** the checklist is hidden until the org has a KPI; Done / Dismiss failures are silent; tour completion is stored per browser, not per user.
- **Build:** each item links to its page and ticks itself when the task is really done.

#### `/dashboard` (home)
- **Fix:** the sparkline is drawn from two made-up points; "KPIs to watch" is the first five KPIs, not the user's watches; a failed range change keeps old numbers silently [code]. "Recent activity" is empty right after the org is created [live].
- **Build:** role-adaptive panels from the spec (my tasks, mentions, my team).
- **Check:** range buttons, the three tabs, side panels, Retry.

#### `/unauthorized`, not-found, error page
- **Fix:** the only button goes to `/dashboard`. If a role is denied `/dashboard` the user loops [code]. Offer "Sign out" and the first page they may open.

#### `/status`
- **Fix:** outside the shell; its only link goes to `/kpis` [code].

### 4.3 KPIs

#### `/kpis`
- **Fix:** Delete has no confirm (X-01). Per-unit and per-user rows offer no way to record (UI-003).
- **Build:** current value, trend and sorting columns (in the spec).
- **Check:** category and status filters, shared saved view, delete view.

#### `/kpis/new`
- **Fix:** submit is not disabled while saving; picker failures are silent; using a template never counts as a use [code].
- **Build:** UI-004 — an "Assignments" panel on the KPI (units / users), reachable after creation.

#### `/kpis/[id]/edit` — UI-011
- **Fix:** blank fields are not saved, so a target, owner, unit or category can never be cleared; the approval reply (202) is treated as a saved KPI [code].
- **Build:** "Sent for approval" message with a link to `/approvals`.
- **Check:** saving an edit (no test does).

#### `/kpis/[id]` (nine tabs)
- **Fix [live]:** no Edit, Delete or analytics links in the header; raw enums; per-unit Data tab has no record form, no hint where to record, and no column saying which unit a value belongs to; thresholds form has no colour (every band is saved green) and no labels; Audit says "No versions." beside "v1".
- **Fix [code]:** tab not in the URL (links from `/kpis/tree` land on Overview); recording uses "now" for the period with no picker; edit forms and deletes shown to everyone (X-04); failed tab loads are blank (X-02); cascade attach is always SUM with no weight; targets are STATIC only; lineage shows ids.
- **Build:** UI-003 record form for per-unit (pick the unit) and per-user values, using the scope-correct endpoint and showing the API's "use this endpoint" hint; Overview: target vs actual, owner, last updated by.
- **Check:** Formula, Cascade, Thresholds, Benchmarks, Lineage tabs and every Delete — covered by API tests only, never clicked.

#### `/kpis/categories`
- **Fix:** permission mismatch (X-04); delete has no confirm.
- **Check:** inline edit, sort order.

#### `/kpis/import`
- **Fix:** opens for viewers who then get 403; editing the text after a dry run leaves Commit enabled [code].
- **Build:** file upload (the spec asks for CSV / JSON).

#### `/kpis/tree`
- **Fix:** "Edit cascades" lands on Overview [code].
- **Build:** collapse, current value per node.

#### `/kpis/scorecard`
- **Fix:** "on target" ignores direction (X-08); the API already returns the right status.

#### `/kpis/templates`
- **Fix:** "Use template" shown without KPI_CREATE.

#### `/kpis/archive`
- **Fix:** Restore / Purge not hidden (X-04).

#### `/kpis/[id]/forecast`, `/anomalies`, `/whatif`, `/embed`
- **Fix:** no page links here (UI-012) — add an "Analytics" entry on the KPI page. Permission mismatch (X-04). Horizon, threshold and delta are unvalidated free text. Embed "Revoke" uses `window.confirm`; copy failures are silent.
- **Build:** list of flagged points on anomalies; "today" line on forecast.
- **Check:** `/embed` and `/embed/kpi/[token]` have no browser test at all.

### 4.4 Dashboards

#### `/dashboards`
- **Fix:** delete uses `window.confirm`.
- **Check:** search, filter, set default.

#### `/dashboards/new`
- **Fix:** if one starter widget fails, pressing Create again makes a second dashboard [code].
- **Check:** whole page (tests create dashboards through the API).

#### `/dashboards/[id]` — UI-001, UI-002, UI-006
- **Fix [live]:** wrong latest value and reversed charts (use the newest point; sort ascending for charts); date range (include periods that overlap the range, and the current period); cramped toolbar at 1024 px with an always-visible "Snapshot label" box; hidden duplicate range buttons.
- **Fix [code]:** live refresh; Edit / Settings / Add widget / Snapshot shown to view-only users; widget delete has no confirm and hides errors; an untitled widget is headed `kpi_card`; card colour ignores direction; the KPI picker never refreshes (survives sign-out).
- **Build or remove:** the Activity widget says "coming soon"; the Strategy map widget shows fixed text. Either build them or take them out of the picker.
- **Check:** settings save, unit assignments, snapshot, custom range, widget edit, print, and every widget type except the KPI card.

#### `/dashboards/[id]/share`
- **Fix:** expired links still listed as active; `window.confirm`; copy failure silent.

#### `/dashboards/[id]/snapshots`
- **Fix:** Capture / Delete not hidden (X-04); `window.confirm`.
- **Check:** whole page — no browser test.

#### `/dashboards/[id]/widgets/[wid]`
- **Fix:** nothing links here (make each widget title open it); chart runs newest → oldest; "Edit widget" just goes back.
- **Build:** data table under the chart, link to the KPI.

#### `/dashboards/archive`
- **Fix:** no permission gate (X-04).

### 4.5 Alerts

#### `/alerts`
- **Fix:** capped at 100 with no paging (X-07); hidden duplicate filter buttons.
- **Build:** KPI column; bulk acknowledge.
- **Check:** Resolve, severity filter.

#### `/alerts/new` — UI-009
- **Fix:** either build the two rule types or remove them from the form; page opens for users who then get 403 (X-04); a level with no channel is dropped silently; channels only load for ORG_SETTINGS holders.
- **Build:** recipients by role / user, cooldown, description, "who will be notified" preview.
- **Check:** every rule type, the escalation builder.

#### `/alerts/[id]`
- **Fix:** shows ids instead of the KPI and rule names; placeholder text about "later phases" [code].
- **Build:** value vs threshold chart, comments.

#### `/alerts/rules`
- **Fix:** a failed save closes the editor and loses the edit; condition and threshold cannot be edited.
- **Check:** pause, edit, delete.

#### `/alerts/channels`
- **Fix:** a failed test shows in the green success banner; SMS (a stub) and an email channel with no recipients both report "sent"; delete has no confirm; a channel cannot be edited.

### 4.6 AI

#### `/insights`
- **Fix:** KPI shown as an id; "Generate" that produces nothing says nothing.
- **Check:** generate, regenerate, dismiss, filters (run once with a real key).

#### `/recommendations`
- **Fix:** buttons shown to users who get 403 (X-04); no busy state.
- **Build:** a Generate button (the API exists); "create task from this".

#### `/ask`
- **Fix:** permission mismatch (X-04); follow-up chips carry no context because each question is sent alone.
- **Check:** chips, copy, new chat.

### 4.7 OKRs, tasks, approvals, automations

#### `/okrs`
- **Fix:** Edit permission mismatch (X-04); no check that the end date is after the start; owner names missing for contributors (X-05).
- **Check:** edit, delete, filters, parent objective.

#### `/okrs/[id]`
- **Fix:** clearing a key result's current value saves 0; description and baseline cannot be cleared; Sync button not gated.
- **Check:** sync, edits, deletes, comments.

#### `/tasks`
- **Fix:** card "×" deletes at once, and is hover-only (invisible on touch); quick-add clears the text before the save succeeds; all tasks read "Unassigned" for contributors (X-05).
- **Check:** drag and drop, the new-task dialog, detail edit / delete, filters, search.

#### `/approvals` — UI-008
- **Fix:** split the page: inbox for everyone, workflow setup for ORG_SETTINGS. Show Approve / Reject only to real approvers ("you're an approver" is fixed text today).
- **Build:** create the first workflow per entity type in a new org.
- **Check:** whole page — no browser test.

#### `/workflows` — UI-007
- **Fix:** send what the API accepts (trigger `kpi_changed`; rule `{kind:'kpi_value', operator:'>', value}`; action `{kind:'create_task', title}`); delete confirm.
- **Build:** KPI picker instead of a typed id; enable / disable, edit, "run now" (API exists); a link to the page.
- **Check:** create → record a value → task appears.

#### `/me/mentions`
- **Fix:** each row says only "You were mentioned" and a date [code].
- **Build:** who, the comment text, a link to the KPI / objective / task; unread badge in the header.

#### Comments drawer
- **Fix:** count shows 0 until opened; says "markdown ok" but shows plain text; authors "Unknown user" for contributors (X-05).
- **Build:** edit / delete own comment (API exists); @ name suggestions.

#### `/activity`
- **Fix [live]:** entries read "UPDATE kpi", "CREATE organization". **[code]:** the Objective and Task filters match nothing, KPI matches only some; "Load more" can append twice.

### 4.8 People and organisation

#### `/users` — UI-010, UI-016
- **Fix:** Archive has no confirm although it moves direct reports; suspended users appear in both filters; invite shows no success outside development.
- **Build:** edit a user (role, manager, position); restore an archived user; resend / cancel an invite; position on the invite form.
- **Check:** suspend, reactivate, archive, purge, Archived filter.

#### `/users/[id]`
- **Fix:** one failed request blanks the page; an unknown id shows an empty header.
- **Build:** UI-004 assign / unassign per-user KPIs here; trend per KPI.

#### `/roles`
- **Fix:** delete has no confirm.
- **Build:** rename / edit description; member count; hierarchy view (API exists).
- **Check:** the access section (scopes, limits, page access).

#### `/settings/access` (Access Center)
- **Fix:** an invalid limit silently becomes "inherit"; page list omits routes that are not in the sidebar.
- **Check:** whole page — no browser test.

#### `/positions`
- **Fix:** no page gate (X-04) — a contributor sees the form and Delete [crawl]; delete has no confirm.
- **Build:** edit (API exists); assign a position to a user.

#### `/org-units`
- **Fix:** delete unit, remove member and merge have no confirm; members show as ids without USERS_VIEW (X-05).
- **Build:** change parent / description (API exists); assign KPIs to a unit (UI-004).
- **Check:** split.

#### `/team`
- **Fix:** depends on UI-010 (manager can never be set).

#### `/my-kpis`
- **Fix:** records with "now" as the period; no saved message.
- **Build:** period picker / next due period.

#### `/profile` and `/me/sessions`
- **Fix [live]:** Role shows an id. **[code]:** language is kept in the browser only; no QR code for MFA; sessions have no "this device" mark, so a user can sign themselves out; `/me/sessions` repeats the Security tab.
- **Check:** save name, change password, complete and disable MFA, revoke one session, theme.

### 4.9 Reports

#### `/reports`
- **Fix:** New / Pause / Delete shown to users who get 403 (X-04); `window.confirm`.
- **Build:** link to the board pack; one-off "Export now" (the API call exists, no button uses it).
- **Check:** pause / resume, delete.

#### `/reports/new`
- **Fix:** picker load failures are silent; custom cron is not validated.
- **Build:** "next run" preview.

#### `/reports/[id]`
- **Fix:** download links stop working after 7 days.
- **Build:** edit, pause, delete from here.

#### `/reports/board-pack`
- **Fix:** nothing links here; mover colours ignore direction (X-08); each quadrant is cut to 5 with no "more".

### 4.10 Integrations

#### `/integrations` — UI-015
- **Fix:** permission mismatch (X-04); the Webhooks, API Keys and Email-in cards create empty "connections" instead of opening their settings pages; disconnect has no confirm.
- **Decide:** real connection (a token or webhook URL form per provider) or relabel as "not available". Recommend the form: it is what Slack `/kpi`, Teams cards and Jira already need.

#### `/integrations/slack/link`
- Works with a configured Slack app. Covered for bad and missing tokens.

#### `/connectors`, `/connectors/[id]`
- **Fix:** KPI typed as an id; the result of "Run now" is not shown; create / delete hidden from INTEGRATIONS_MANAGE users; no confirm.
- **Build:** edit (API exists); rows pulled and error text per run.
- **Check:** whole UI (API-only tests).

#### `/plugins`
- **Fix:** outside the shell; no confirm. The page itself says plugins are "catalog only" and never run.
- **Decide:** hide the page until plugins run, or keep it clearly labelled.

### 4.11 Settings

#### `/settings`
- **Build:** links to Integrations, Alert channels, Automations.

#### `/settings/organization`
- **Fix:** timezone, currency and locale are free text and unused (UI-014). Use pickers and apply them (dates, money formatting).

#### `/settings/branding`
- **Fix:** logo and colours are saved and never shown (UI-014). Apply in the sidebar and login page, or remove the page.
- **Check:** Save.

#### `/settings/fiscal`
- **Fix:** nothing reads these (UI-014). Apply week start / fiscal year to period pickers and reports, or remove.

#### `/settings/password-policy`
- **Fix:** "max age" is never enforced; a blank minimum length becomes 0.

#### `/settings/notifications` (personal)
- **Fix:** digest, mute window and muted channels are not used when notifications are sent (UI-014); the form is editable before the saved values load; "Delivery log" leads non-admins to `/unauthorized`.

#### `/settings/notifications/dlq`
- **Fix:** rows show an id, not the channel or alert.

#### `/settings/ai`
- **Fix:** a blank daily cap saves $0 and blocks all AI; the key field is not masked.
- **Build:** monthly cap, what to do when the cap is hit, fallback provider (API exists).
- **Check:** routing save / reset, own key.

#### `/settings/api-keys`
- **Fix:** revoke has no confirm; Copy gives no feedback.

#### `/settings/webhooks`
- **Fix:** delete and rotate have no confirm.
- **Check:** rotate, enable / disable.

#### `/settings/audit`
- **Fix:** permission mismatch (X-04); 100-row cap.
- **Build:** date and person filters, export.

#### `/settings/retention`
- **Fix:** no job deletes anything (UI-014); outside the shell.
- **Decide:** build the purge job or remove the page.

#### `/settings/sso`
- **Fix:** nothing uses the saved config; the login page has no SSO button (UI-014).
- **Decide:** needs a WorkOS account. Recommend labelling it "not available on this plan" until then.

#### `/settings/scim`
- **Fix:** outside the shell; the new token cannot be copied or dismissed; the SCIM address is not shown.

#### `/settings/custom-domain`
- **Fix:** a verified domain is never used (UI-014).
- **Decide:** on free hosting there is one fixed hostname; recommend hiding the page.

#### `/billing`
- "Upgrade (coming soon)" is disabled. No payment provider (out of scope while hosting is free). Keep read-only; remove the dead button.

### 4.12 Public pages

#### `/share/[token]`
- **Fix:** every widget is reduced to one number; the grid layout is ignored.
- **Check:** password-protected link.

#### `/embed/kpi/[token]`
- **Fix:** the error does not say whether the link was revoked or expired.
- **Check:** whole page — no browser test.

## 5. Order of work

Each item is its own PR: failing test first, fix, fix-log row in `docs/audit/README.md`, merge commit after CI and Security pass on the exact head, rollback recorded. Test on a throwaway stack only.

| Batch | Items | Why first |
|---|---|---|
| 1 Wrong numbers | UI-001, UI-002, X-08 | The flagship dashboard is wrong for the demo org today. |
| 2 Per-unit and per-user KPIs | UI-003, UI-004, UI-010 | Half the demo KPIs cannot be updated; `/my-kpis` and `/team` are empty in a real org. |
| 3 Onboarding | UI-005, `/signup` and wizard fixes, checklist links | First thing every new organisation meets. |
| 4 Dead features | UI-006, UI-007, UI-008, UI-009, UI-011 | Offered in the UI, do not work. |
| 5 Reachability and permissions | UI-012, UI-013 (X-04), X-05 | Pages nobody can find; 403s after a click. |
| 6 Honest settings | UI-014, UI-015, UI-016 | Needs the decisions in §6. |
| 7 Safety and polish | X-01, X-02, X-03, X-06, X-07, X-09, X-10 and the per-page Medium / Low items | One pattern at a time. |
| 8 Click-through | every "Check" line in §4 | After the fixes; turn each into a browser test. |

## 6. Decisions needed

1. **Settings with no effect** (branding, fiscal, timezone / currency / locale, notification preferences, password max age, retention, SSO, custom domain): make each one work, or hide it. Recommendation per page is in §4.11.
2. **Wizard:** build the manual steps (recommended), or keep it AI-only and add a review / edit screen.
3. **Integrations "Connect":** token / webhook form per provider (recommended), or mark as unavailable.
4. **Unbuilt alert rule types and widgets** (std-dev, rate of change, Activity, Strategy map): build or remove from the pickers.
5. **`/register` vs `/signup`:** keep one.

## 7. Running it again

Local, ignored files: `.cache/uiwalk/` (compose file, env, crawl output, raw notes, the three code inventories). `.claude/launch.json` has three new entries — `uiwalk-api`, `uiwalk-ml`, `uiwalk-web` — and is not committed.

```bash
docker compose -p kpi-uiwalk -f .cache/uiwalk/compose.json up -d
```

Then start `uiwalk-ml`, `uiwalk-api`, `uiwalk-web` and open http://localhost:3000 (demo login in `packages/db/prisma/seed.ts`). The web build must be made with `NODE_ENV=production`; with `NODE_ENV=development` exported, `next build` fails while prerendering.
