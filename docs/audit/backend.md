# Audit — backend (apps/api, apps/worker, apps/ml)

_Part 1 of the audit. Report-only: nothing here has been fixed yet._

## Coverage

| Step | What | Result |
|---|---|---|
| 1a | Existing integration suite — `pnpm --filter @kpi-nexus/api test:int` (14 specs, live API) | ✅ 89 passed · 3 intentional `it.skip` (escalation timing, covered by unit tests) |
| 1b | Route inventory — `node scripts/audit/api-routes.mjs` → [`api-routes.json`](./api-routes.json) | 332 routes: GET 122 · POST 128 · DELETE 45 · PATCH 30 · PUT 7 · 39 public · 266 gated · 27 authenticated-only |
| 1c | Live GET sweep — `node --env-file=.env scripts/audit/api-sweep.mjs` → [`api-sweep.json`](./api-sweep.json) | 122/122 GET routes × 5 personas = 610 requests. 1 route 500s (BE-001). Auth enforced on every non-public route. Permission gates match each persona's effective capabilities (per persona: 32 correctly denied, 62 correctly served). No response > 1 s. |
| 1c+ | Data-scope comparison across personas (list sizes) | Scope inconsistencies → BE-003, BE-004 |
| 1d | Mutation cycles — `node --env-file=.env scripts/audit/api-crud.mjs` → [`api-crud.json`](./api-crud.json) | 301 steps over 8 domains in two disposable orgs (A = scenarios, B = cross-tenant probe): 273 as expected. Every deviation triaged below — harness-expectation mistakes excluded. |
| 1e | Async / background behaviour (same harness + manual) | Alert pipeline ✅ (breaching point → alert in 588 ms → email in Mailhog, HTML-escaped). Scheduled report trigger → email ✅. Outbound webhook test ✅ (signed). Redis outage: reads and login keep working, `/health` hangs (BE-018). |
| 1f | ML sidecar direct — `node --env-file=apps/ml/.env scripts/audit/ml-probe.mjs` → [`ml-probe.json`](./ml-probe.json) | 29/34 as expected. HMAC auth correct (5/5 negatives → 401). Input-validation gaps → BE-024. |

### Status by module

✅ works as expected · ⚠️ works, with findings · ❌ broken

| Domain | Modules | Status |
|---|---|---|
| Identity & tenancy | auth, password, mfa, users, roles, rbac, permission-delegations, resource-permissions, tenancy, organizations, platform-admin, sso, scim | ⚠️ BE-002, BE-007 (critical), BE-008, BE-011, BE-013, BE-017. Verified OK: register/login, refresh rotation + reuse detection, invite accept flow, suspend/reactivate, access overrides, delegations, MFA enrol, SCIM CRUD + tenant isolation, API-key scopes |
| Org modelling | org-units, org-structure (types/dimensions), org-templates, positions | ❌ BE-001 (templates list 500), BE-009 (cycles + cross-tenant parent). Verified OK: CRUD, rename/history, members, move/split/merge |
| KPI engine | kpis, kpi-categories, kpi-targets, kpi-threshold-bands, kpi-benchmarks, kpi-formula, formula, calculation-engine, kpi-cascades, lineage, user-kpis, org-unit-kpis, kpi-templates, ingest | ⚠️ BE-003, BE-012. Verified OK: CRUD, status machine, data points (+ scope 422), targets, benchmarks, formula sandbox (4/4 escapes rejected), cascade cycle/self-loop rejection, rollup, lineage, archive → restore → purge, API-key ingest |
| Visualization | dashboards, reports, scheduled reports, realtime, analytics, search | ⚠️ BE-019, BE-021. Verified OK: dashboards + widgets, snapshots, share links (revocation, password), CSV/Excel/PDF generation, board pack, SSE stream opens, search |
| Alerting | alert-rules, alerts, alert-engine, escalations, notification-channels, notifications, email | ⚠️ BE-016 (SSRF). Verified OK: end-to-end alert + email, ack/resolve, cross-tenant rule creation blocked |
| AI | ai, nlq, insights, recommendations, kpi-suggestions, onboarding-ai, ml | ⚠️ BE-010, BE-024, BE-025. Verified OK: NLQ tenant isolation (org B can't see org A KPIs), budget caps validation |
| Collaboration | tasks, comments, mentions, okrs, approvals, workflows, activity, setup-checklist | ⚠️ BE-020, BE-021, BE-022. Verified OK: CRUD, comment-ownership checks, mentions to foreign users dropped, approval workflow upsert, workflow trigger |
| Integrations | integrations (Slack/Jira), connectors, webhooks, api-keys, plugins, custom-domains, inbound-email | ❌ BE-014 (critical), BE-015, BE-016, BE-023. Verified OK: connector cross-tenant write blocked, webhook signing, secret rotation, integration tokens not echoed, duplicate domain rejected, inbound email rejects unsigned |
| Governance | audit, retention, billing, rate-limit, demo-data, health | ⚠️ BE-017, BE-018. Verified OK: audit log records changes, retention tiers, billing plan validation |
| Worker | apps/worker | See OT-003 (stub) |

Personas (seeded `helios`, password `Password123!`): `admin@helios.io` (Administrator) · `greg.sullivan@` (Executive) · `devon.reyes@` (Department Manager) · `tom.becker@` (Contributor, `KPIS: SELF`) · `aaron.cole@` (Contributor, 90-day data limit).

## Findings

### BE-001 · High · `GET /org-templates` returns 500 for every org (template picker broken)
- **Repro:** `GET /org-templates` with any token (or none) → `500 Internal server error`. `GET /org-templates/saas-starter` → 500; other slugs → 200.
- **Cause:** `TypeError: Cannot read properties of undefined (reading 'length')` at `countPayload()` — `apps/api/src/org-templates/template-payload.ts:71`, called from `org-templates.service.ts:70`. The built-in template `saas-starter` is stored in a legacy payload shape (`{ roles: string[], units: string[], kpis: string[] }` — no `positions` / `orgUnitTypes` / `orgUnits` / `kpiCategories`). One malformed row breaks the whole list.
- **Source of the bad row:** the demo seed — `packages/db/prisma/seed.ts:864-865` upserts `saas-starter` with the legacy shape.
- **Also:** `countPayload()` is not defensive, unlike `validateTemplatePayload()` in the same file, which coalesces missing sections.
- **Impact:** any UI listing org templates (onboarding / org-templates) fails — to confirm in the frontend audit.

### BE-002 · High · Demo seed wires role inheritance backwards — Contributors get Department-Manager rights
- **Repro:** sign in as `tom.becker@helios.io` → `GET /auth/me` → `accessProfile.capabilities` has 17 entries, including `KPI_CREATE`, `KPI_EDIT`, `DASHBOARD_MANAGE`, `ALERTS_MANAGE`, `OBJECTIVES_MANAGE`, `USERS_VIEW`, `GROUPS_VIEW`.
- **Expected:** Contributor role = `KPI_VIEW, KPI_DATA_ENTRY, DASHBOARD_VIEW, ALERTS_VIEW, TASKS_VIEW`, minus his `KPI_DATA_ENTRY` revoke override → 4 capabilities.
- **Cause:** the resolver treats `RoleInheritance` as "child inherits parent's permissions" (`apps/api/src/rbac/services/permission-resolver.service.ts:73-104`; `roles.service.ts:315-347` documents the same). The seed (`packages/db/prisma/seed.ts:577-580`, commented "informational hierarchy") wires it org-chart style: `Department Manager → Senior Contributor → Contributor` with `inheritsPermissions: true`. So Senior Contributors and Contributors inherit the Department Manager's permissions.
- **Impact:** every least-privilege demo built on `helios` is wrong. Seed-data bug — the product code is consistent, and inheritance edges can't be created through the API/UI.

### BE-003 · Medium · KPI `SELF` scope bypassed on detail / data / dashboard-summary endpoints
- **Repro:** as `tom.becker@helios.io` (`KPIS: SELF`): `GET /kpis` → 13 KPIs. `GET /kpis/dashboard-summary` → 18; the extra 5 are Engineering `PER_UNIT` KPIs (Deployment Frequency, Change Lead Time, Production Incidents, MTTR, Platform Uptime). `GET /kpis/<Deployment Frequency id>` → 200 and `/data` → 200. Same for `aaron.cole@` (12 vs 14: CSAT, Avg. Ticket Resolution Time).
- **Cause:** the list uses `buildKpiVisibilityWhere()` (`apps/api/src/rbac/visibility/kpi-visibility.ts`), which honours `scope` (SELF ⇒ no unit KPIs). Single-KPI access uses `KpisService.isVisibleToUser()` (`apps/api/src/kpis/kpis.service.ts:468-493`), which never reads `visibility.scope` and treats every non-admin as `UNITS`. The dashboard summary follows the looser rule.
- **Expected:** one visibility rule for list, detail, data and summary.

### BE-004 · Medium · Scopes for `PEOPLE`, `INSIGHTS`, `ANALYTICS`, `ORG` are configurable but never enforced
- **Evidence:** `access-context.service.ts:25-36` defines 10 scope domains, with defaults in `rbac/visibility/domain-visibility.ts`. Only KPIs, dashboards, alerts, alert rules, OKRs, tasks and scheduled reports read `scopeByDomain` — those are the only services referencing it. Nothing reads it for users, org units, insights or analytics.
- **Repro:** exec / manager / contributor all have `PEOPLE: UNITS`, yet `GET /users` returns all 41 users and `GET /org-units` all 9 units to each of them. Everyone sees all 15 `GET /insights`, including insights about KPIs the caller can't see (Tom: 13 visible KPIs).
- **Expected:** enforce the scope, or don't offer it in the role editor.

### BE-005 · Low · Three Redis clients have no `error` listener
- **Evidence:** the API log repeatedly prints `[ioredis] Unhandled error event: Error: read ECONNRESET`. Clients created without `.on('error')`: `apps/api/src/ai/ai-budget.service.ts:37`, `apps/api/src/health/redis-health.service.ts:7`, `apps/api/src/rate-limit/rate-limit.service.ts:20`. `realtime.service.ts` does attach listeners.
- **To check in 1e:** behaviour of login and rate limiting when Redis is unavailable.

### BE-007 · Critical · Password-reset link (with plaintext token) is written to the API log instead of being emailed — ✅ FIXED
- **Fix:** `PasswordResetService` now emails the link via `EmailService` to `WEB_APP_URL/reset-password?token=…` and logs only `password-reset email sent (user <id>)`. Delivery failures are logged without the link and still return 202. The old link pointed to a page that didn't exist (`/auth/password/reset`); the web app now has `/forgot-password` and `/reset-password` plus a "Forgot password?" link on sign-in (FE-018).
- **Repro:** `POST /auth/password/request-reset {"email":"<user>"}` → the API log prints `[password-reset] link for <email>: <reset URL with token>`.
- **Code:** `apps/api/src/password/password-reset.service.ts:61-64` — `// TODO(p1-email): hand off to EmailService — for now, log the link`. Not gated to dev; runs in every environment.
- **Impact:** (1) security — anyone who can read application logs (log shipping, Sentry/OTel exporters, support staff) can reset and take over any account that requests a reset; (2) functional — no reset email is ever sent, so in production "forgot password" doesn't work.
- **Good:** known and unknown emails both get `202 {"accepted":true}` → no account enumeration.

### BE-008 · High · Invitations are never emailed — ✅ FIXED
- **Fix:** `UsersService.invite()` now emails the accept link (`WEB_APP_URL/accept-invitation?token=…`, naming the org and inviter) via `EmailService`; the response gains `emailSent`. The link is no longer logged. The dev-only `inviteToken` / `acceptUrl` response fields are kept for E2E.
- **Repro:** `POST /users {email, fullName}` → user created as `INVITED`; nothing arrives in Mailhog. The run's audit also found Mailhog holds only alert and scheduled-report mail.
- **Code:** `apps/api/src/users/users.service.ts:400-470` — "the email handoff goes through EmailService when that module lands". `EmailService` exists (used by notifications and reports) but `invite()` never calls it. In non-production the response carries `inviteToken` + `acceptUrl` and the link is logged (`[invite] … → <acceptUrl>`); in production both are omitted.
- **Impact:** in production, invited users have no way to get their accept link → onboarding of team members is broken.
- **Good:** the accept flow itself works end-to-end with the token: preview → accept → login → second accept rejected.

### BE-009 · High · Org-unit `update()` allows cycles and cross-tenant parents
- **Cycle — repro:** create unit P, child C (`parentUnitId: P`), then `PATCH /org-units/P {"parentUnitId": C}` → `200`. DB now has P→C→P.
- **Cross-tenant — repro:** as org B, `PATCH /org-units/<B unit> {"parentUnitId": "<org A unit id>"}` → `200`; B's unit is stored with a parent in org A.
- **Cause:** `apps/api/src/org-units/org-units.service.ts:156-175` — `update()` only rejects "own parent". `create()` (lines 104-112) does verify the parent is in the same tenant; `update()` doesn't, and neither checks for ancestor cycles.
- **Impact:**
  - **Cross-tenant interference:** org A's unit now counts B's unit as a child. `DELETE` of A's unit → `409 "Org unit has 2 child unit(s)"`, and A can't see or move B's unit — another tenant can block A from deleting its own units.
  - **Data integrity:** B's unit is orphaned in B's own tree.
  - **Cycles:** cycles will break tree UIs (to check in the frontend audit).
  - **No leak:** server-side BFS walks have visited sets, so the API doesn't hang, and no org-A names leak to B (only the id).

### BE-010 · High · Unauthenticated, unlimited LLM usage via public onboarding AI endpoints
- **Evidence:** `POST /onboarding/start` is `@Public` and unthrottled — 25/25 anonymous calls returned 201. Each start returns a draft token. With it, `POST /onboarding/ai/{generate,suggest,assistant,explain,apply}` (all `@Public`) call the configured LLM directly. A real `GEMINI_API_KEYS` is set.
- **Cause:** `apps/api/src/onboarding-ai/onboarding-ai.service.ts:36-50` — limits are per *session* (`onboarding-ai:${sessionId}:${mode}`) and the call bypasses the org-scoped budget/call log ("budget/call-log are org-scoped and don't apply yet").
- **Impact:** an anonymous script can mint unlimited sessions → unlimited LLM spend / quota exhaustion. This was not exercised beyond `start`, to avoid real spend.
- **Expected:** IP-based throttling on `start` and on the AI routes, plus a global onboarding AI budget.

### BE-011 · Medium · Seeded roles contain permission keys the API rejects — seeded roles can't be re-saved
- **Evidence:** `packages/contracts/src/permissions.ts` (`PermissionKey`) has no `TASKS_VIEW`, `TASKS_MANAGE`, `OBJECTIVES_VIEW`, `OBJECTIVES_MANAGE`, `ALERTS_MANAGE`, `AI_USE`. The seed assigns them to roles (`packages/db/prisma/seed.ts`), and no API guard or web check uses them.
- **Repro:** `PATCH /roles/<helios Department Manager> {"permissions": <its own current permissions>}` → `400 invalid_enum_value … received 'AI_USE'`.
- **Impact:** admins of the demo org likely can't edit seeded roles in the role editor (to confirm in the frontend audit). The access profile also reports phantom capabilities.

### BE-012 · Low · Threshold bands accept `lower > upper`
- **Repro:** `POST /kpis/:id/threshold-bands {"name":"Bad","lower":900,"upper":100,"color":"#000000","order":1}` → `201`.
- **Location:** `apps/api/src/kpi-threshold-bands/dto/threshold-band.dto.ts` — no refine for `lower <= upper`.

### BE-013 · Low · Suspension doesn't revoke live access tokens
- **Repro:** suspend a signed-in user → their existing access token still gets `200` on `GET /auth/me` until it expires (`expiresIn: 900` s).
- **Good:** refresh is rejected (`401 Invalid refresh token`) and new logins fail, so exposure is ≤ 15 min.
- **Optional hardening:** check user status in the auth guard, or keep a token-version claim.

### BE-006 · Low · `/platform/admins` returns 403 with message "Authentication required"
- **Repro:** `GET /platform/admins` as the org Administrator → `403 {"code":"FORBIDDEN","message":"Authentication required"}`.
- **Expected:** the 403 is correct (platform admin is a separate super-role), but the message should say the caller isn't a platform admin.

### BE-014 · Critical · Unauthenticated cross-tenant task updates via the Jira webhook — ✅ FIXED
- **Fix:** route is now `POST /integrations/jira/webhook/:connectionId?secret=…`. The secret is checked against the connection's encrypted `webhookSecret` (constant-time; fails closed when unset or the connection is unknown). Task lookup is scoped to the connection's org with an exact key match (bare key or `…/browse/<KEY>`); the old global route is removed. **Setup:** store `webhookSecret` in the Jira connection's `tokens`, and register the URL above in Jira.
- **Repro (proven on an audit org):** create a task with `externalRef: "https://jira.audit.test/browse/AUDZ-…-7"` (status `TODO`). Then, with **no auth**: `POST /integrations/jira/webhook {"issue":{"key":"AUDZ-…-7","fields":{"status":{"name":"Done"}}}}` → `200 {"updated":true}`. Task is now `DONE`.
- **Cause:** `apps/api/src/integrations/providers/integration-providers.controller.ts:44-48` (`@Public`, no signature/secret check) → Jira service `handleWebhook()`: `prisma.task.findFirst({ where: { externalRef: { contains: key } } })` with **no `organizationId` filter**, then `task.update`.
- **Impact:** anyone on the internet can change the status of tasks in any tenant. `contains` makes short keys match arbitrary refs.
- **Expected:** verify a per-connection Jira webhook secret, resolve the org from the connection, and match `externalRef` exactly within that org.

### BE-015 · High · Slack interactive endpoint skips signature verification when headers are absent — ✅ FIXED
- **Fix:** always verify (`SLACK_SIGNING_SECRET` required — fails closed when unset); missing headers, bad/stale signature or no raw body → 401 before parsing. Verification now runs over the exact request bytes (`rawBody: true` in `main.ts`) instead of a re-serialised body, which could never match a real Slack signature.
- **Code:** `integration-providers.controller.ts:33-40` — `if (secret && signature && timestamp) { verify… }`. A request that simply omits `x-slack-signature` / `x-slack-request-timestamp` is never verified (fail-open). It then runs `alerts.acknowledge(action.value)` for the org resolved from `payload.team_id`.
- **Repro:** `POST /integrations/slack/interactive` with no signature headers → `200 {"handled":false}` (no Slack connection matched). With a connected workspace's `team_id` and an alert id, an anonymous caller can acknowledge that org's alerts.
- **Expected:** require and verify the signature whenever a signing secret is configured; reject otherwise.

### BE-016 · High · SSRF: tenant-supplied URLs are fetched with no private-address filtering — ✅ FIXED
- **Fix:**
  - New `src/outbound/outbound-fetch.ts`: an undici `Agent` whose DNS lookup refuses private / loopback / link-local / CGNAT / multicast / reserved ranges (IPv4, IPv6, IPv4-mapped) at **connect time**, so DNS rebinding is covered. IP literals are checked before connecting; only http/https are allowed; redirects are followed manually (max 5) with every hop re-checked.
  - Used by notification channels (a blocked target is non-retryable), outbound webhooks and REST/GraphQL connectors.
  - Create/update of webhooks, channels (`url` / `webhookUrl`) and connectors now returns 400 for internal targets. Hosts that don't resolve yet are allowed; delivery re-checks them.
  - `OUTBOUND_ALLOWED_HOSTS` explicitly allows specific internal hosts (default none).
- **Notification channels:** `WEBHOOK` / `SLACK` / `TEAMS` — `apps/api/src/notifications/notification-adapters.service.ts:43-55,85-95` POST to `config.url` / `config.webhookUrl`.
  - **Repro:** create a `WEBHOOK` channel with `config.url = http://127.0.0.1:<port>/hook` → `201`; `POST /notification-channels/:id/test` → the API made the request to the loopback listener.
- **REST / GraphQL connectors (full-read SSRF):** `apps/api/src/connectors/connectors.service.ts:160-176` GET/POST `config.url` and **read the response back** into KPI data.
  - **Repro:** connector `url = http://127.0.0.1:<port>/metrics` → `POST /connectors/:id/run` → fetched; the value from the internal response was ingested.
- **Outbound webhooks:** `webhooks/outbound-webhook.processor.ts:53` — same pattern (delivered to the loopback listener in the test).
- **Impact:** in a hosted deployment a tenant admin can reach cloud metadata (`169.254.169.254`), Redis/Postgres admin ports and other internal services. Connectors can exfiltrate response values.
- **Expected:** resolve and block private / loopback / link-local ranges (re-check after redirects), or route egress through an allow-listed proxy.

### BE-017 · Medium · No brute-force protection by default
- **Repro:** 25 failed logins for one email, 12 different emails from one IP, and 15 wrong passwords for a real account followed by the right one → all `401` and then `200`. No `429`, no lockout.
- **Cause:** `apps/api/src/rate-limit/rate-limit.guard.ts` is a no-op unless `RATE_LIMIT_ENABLED === 'true'`, and that variable isn't in any `.env.example`, so a deployment from the templates runs without rate limiting. No account-lockout logic exists.
- **Also:** while Redis is unavailable, login still succeeds, so the limiter fails open (acceptable if intentional; worth documenting). Turning the limiter on is also the main mitigation for BE-010.

### BE-018 · Medium · `/health` hangs when Redis is unresponsive
- **Repro:** `docker pause kpi-nexus-redis` → `GET /health` gives no response within 8 s (expected: fast `{"redis":"down"}`). Login and normal reads keep working; after `docker unpause` everything recovers.
- **Cause:** `RedisHealthService.ping()` has no command timeout (`apps/api/src/health/redis-health.service.ts`).
- **Impact:** a liveness probe would time out and restart a healthy API during a Redis blip.
- **Expected:** fail fast with `connectTimeout` / `commandTimeout` or a `Promise.race`.

### BE-019 · Medium · Invalid cron → 500 and an orphaned, "active" scheduled report
- **Repro:** `POST /scheduled-reports {"name":"x","cron":"every tuesday","format":"PDF","recipients":["a@b.co"]}` → `500`.
- **Result:** a `ScheduledReport` row with `isActive = true` is left behind (it never runs).
- **Cause:** `apps/api/src/reports/scheduled-report.service.ts:103-121` inserts the row first, then BullMQ rejects the pattern in `addRepeatableJob()`. The DTO (`reports/dto/reports.dto.ts`) only checks string length.
- **Expected:** validate the cron in the DTO (400), and create the row and the job atomically.

### BE-020 · Medium · OKR objectives accept self-parenting and inverted periods
- **Repro:** `PATCH /objectives/:id {"parentObjectiveId": "<same id>"}` → `200` (cycle). `POST /objectives` with `periodEnd < periodStart` → `201`.
- **Location:** `apps/api/src/okrs/dto/okr.dto.ts` + objectives service — no cycle / ancestry check, no period refine.
- **Impact:** the alignment tree / rollup UI may recurse — to check in the frontend audit.

### BE-021 · Medium · Cross-tenant references accepted (no data leak observed)
- **Repro (as org B, using org A ids):**
  - `POST /tasks {"kpiId": <A's KPI>}` → `201`
  - `POST /comments {"entityType":"task","entityId": <A's task>}` → `201`
  - `POST /dashboards/:id/widgets` with `config.kpiId` = a `helios` KPI → `201`
- **Checked:** reads are tenant-scoped, so B can't see A's data through these (`/kpis/:id/data` with B's token → 404). They are dangling foreign references and integrity noise.
- **Expected:** validate referenced ids belong to the caller's org (`tasks.service`, `comments.service`, `dashboards.service` widget config).
- **Good:** `mentionedUserIds` with a foreign user id is silently dropped.

### BE-022 · Low · Any member can complete or dismiss org-wide setup-checklist items
- **Repro:** as `tom.becker@helios.io` (Contributor): `POST /setup-checklist/domain_verification/dismiss` → `201`.
- **Location:** routes are authenticated-only (no permission gate), and rows are scoped per org (`setup-checklist.service.ts:30-66`).
- **Expected:** gate on `ORG_SETTINGS`.

### BE-023 · Low · Loose validation on webhook events and plugin URLs
- `POST /webhooks {"events":["nope.nope"]}` → `201`; unknown events are not checked against `WEBHOOK_EVENT_CATALOG`.
- `POST /plugins {"entryUrl":"javascript:alert(1)"}` → `201`; `z.string().url()` accepts `javascript:`. The web app doesn't render `entryUrl` as a link or script today, so this isn't exploitable now, but it becomes XSS the day plugins are loaded.

### BE-024 · Low · ML sidecar lacks input validation; signature doesn't bind the request
- **Accepted without error:** negative `horizon`; `horizon: 1000000` (**18 s** of CPU and a huge response); empty series → forecast of zeros; unknown anomaly `method` silently falls back to ensemble; unequal-length correlation series are silently truncated.
- **Mitigation:** the API caps horizon at 1–365 (`apps/api/src/analytics/analytics.controller.ts:21`), so this is reachable only from inside the network.
- **Signature:** the HMAC covers `"{timestamp}.{tenantId}"` only (`apps/ml/app/middleware/hmac_auth.py`), not method / path / body, so a captured request can be replayed with a different body for 5 minutes.
- **Fine:** auth negatives are all correct.

### BE-025 · Low · `POST /insights/generate` for another tenant's KPI returns `201 {"insight":null}`
- No data is exposed, but it should be `404` like the other KPI-scoped endpoints.

### BE-026 · High · AI features fail intermittently: Gemini key failover stops on a retired-model 404
- **Evidence (`AiCallLog`, last 12 h):** `gemini-2.5-flash` 30 × SUCCESS, **17 × FAILED 404**, 4 × 503. Every fallback then hits Claude models with no API key configured (`claude-opus-4-7` / `claude-haiku-4-5` → 21 × 401). KPI_SUGGESTIONS failed 3/3; RECOMMENDATIONS 11 × 404.
- **Root cause (probed each of the 8 configured `GEMINI_API_KEYS` with a tiny `generateContent`):**
  - keys #1–#2 → `429 RESOURCE_EXHAUSTED` (quota). This one is handled: rotate to the next key.
  - keys #3–#4 → `404 NOT_FOUND: "This model models/gemini-2.5-flash is no longer available to new users"`.
  - keys #5–#8 → OK.
- **The 404 path:** `packages/ai/src/providers/gemini.ts:88-90` treats only 429/401/403 as key-level. A 404 is thrown as request-level (`:127-128`) without trying the remaining keys, so whenever the round-robin lands on #3/#4 the call fails.
- **Compounding:**
  - the configured default model (`apps/api/src/ai/default-fyp-config.ts`) is being retired by Google;
  - fallbacks point at a provider with no key;
  - the provider's error text is discarded (the call log stores only the status code, the API returns a bare `503` / `AiProviderUnavailableError`, nothing is logged), which made this hard to diagnose.
- **Impact:** about 1 in 4 AI requests fail (recommendations, KPI suggestions, onboarding co-pilot, NLQ, insights). This accounts for 7 of the 32 E2E failures.
- **Expected:** treat "model not available for this key" as key-level (or fall back to a supported model), move defaults to a current model, only configure fallbacks with keys, and log/store the provider error message.

### BE-027 · High · Board-pack API returns a shape the web doesn't expect, and no values
- **Shape:** `GET /reports/board-pack?sinceDays=30` returns `quadrants: [{ name, health: {ok,warning,critical,unknown}, topKpis: [{ kpiId, name, latestValue }] }]`. The web contract (`apps/web/src/lib/api-client.ts:1316-1334`) expects `quadrants: [{ name, kpis: [{ kpiId, name, value, status }], healthDistribution }]` → the page crashes (FE-012).
- **Data:** on seeded `helios` (data through the current month) every quadrant reports `health.unknown = N`, every `latestValue: null`, and `topMovers: []`. The board pack finds no data even when the shape is right.
- **Location:** `apps/api/src/reports/` board-pack service vs `apps/web/src/app/reports/board-pack/page.tsx`.

### BE-028 · High · Real-time stream (SSE) is blocked by CORS in the browser
- **Repro:**
  - `curl -H "Origin: http://localhost:3000" -H "authorization: Bearer …" /realtime/stream?dashboardId=x` → `200 text/event-stream` with **no** `Access-Control-Allow-Origin`.
  - The same request to `/kpis` → `access-control-allow-origin: http://localhost:3000`.
  - The browser logs on every dashboard page: "Access to fetch at '…/realtime/stream?dashboardId=…' … blocked by CORS policy".
- **Cause:** `apps/api/src/realtime/realtime.controller.ts:49-56` calls `reply.hijack()` and writes headers on `reply.raw`, bypassing `@fastify/cors`'s hooks.
- **Impact:** live dashboard refresh (P3 "SSE real-time") never works in a browser, because the web and API are always on different origins. The `uc05-realtime` E2E passes only because it doesn't go through a browser `fetch`.
- **Expected:** set the CORS headers (origin from the allow-list + credentials) on `raw` before writing, or avoid `hijack()`.

### BE-029 · Medium · Slack interactive handler reads `team_id`, but Slack sends `team.id` — ✅ FIXED
- **Fix:** resolve the workspace from `team.id` (falling back to legacy `team_id`); no team → not handled.
- **Evidence:** `apps/api/src/integrations/providers/slack.service.ts` — `SlackInteractivePayload.team_id` → `resolveOrg(payload.team_id)`. Slack `block_actions` payloads carry the workspace as `team: { id }`, with no top-level `team_id`. So a genuine, correctly signed button click never resolves an org, and "Acknowledge" from Slack never works. Found while fixing BE-015.

## Verified working (no finding)

- **NLQ tenant isolation:** org B asked "list every KPI you know about" → no org-A or `helios` KPIs.
- **Cross-tenant 404s on every by-id read/update probed:** roles, positions, users, units, KPIs, dashboards, channels, alerts, objectives, tasks, webhooks, purge.
- **Formula sandbox:** `constructor.constructor`, `globalThis`, `require('fs')` and `while(true){}` are all rejected, and the API stays healthy.
- **Connectors:** org B's connector cannot write into org A's KPI (its `config.kpiId` is not honoured cross-tenant).
- **Share links:** revocation → 404; password-protected share: no / wrong password → 401, right password → 200.
- **API keys:** plaintext shown once; scopes enforced (a `KPI_VIEW` + `KPI_DATA_ENTRY` key gets 403 on users, audit, roles and api-keys); bogus key → 401; ingest works via `Authorization: Bearer kpinx_…`.
- **SCIM:** a token can't read another org's users.
- **Refresh tokens:** rotation and reuse detection (reused refresh → 401).
- **Password reset:** same `202` for known and unknown emails (no enumeration).
