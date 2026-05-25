# P8 — Integrations & Extensibility Implementation Plan

| | |
|---|---|
| **Phase** | P8 — Integrations & Extensibility |
| **Goal** | Pull connectors live (REST + GraphQL + Postgres), Slack/Teams/Jira integrations functional, inbound email, plugins, all governed by API keys + webhooks |
| **Effort** | ≈4 weeks solo |
| **Depends on** | P0–P7 (alerts for Slack post-back, tasks for Jira sync, comments for inbound email) |
| **Blocks** | None — last feature phase before polish |
| **Spec reference** | §3.8 (integration schema), §4.8 (integration modules) |

## Why this phase matters

A SaaS without integrations is a silo. Slack/Teams alerts + Jira issue creation + REST connectors pulling external data + inbound email creating comments — these turn KPI Nexus into the hub it's meant to be.

## Exit criteria

- [ ] Slack alert with action buttons → click "Acknowledge" → status syncs back to Alert
- [ ] Jira issue lifecycle round-trip (create from alert → close → Task status updates via webhook)
- [ ] REST connector pulls a public sample API daily into a KPI (verified for a week)
- [ ] Inbound email: send to `inbound+kpi-<id>@host` → comment appears on the KPI
- [ ] API key with `kpi:data_entry` scope can `POST /ingest` but receives 403 on `POST /kpis`
- [ ] Plugin install: register a custom widget plugin → render in iframe sandbox on dashboard
- [ ] Tag `git tag p8-complete`

## Schema additions

### Migration: `018_integrations`

```prisma
enum IntegrationConnectionStatus { CONNECTED DISCONNECTED PENDING ERROR }
enum ConnectorType { REST GRAPHQL POSTGRES MYSQL S3 GCS WEBHOOK }
enum PipelineStatus { IDLE RUNNING SUCCEEDED FAILED }
enum PluginType { WIDGET TEMPLATE FORMULA_FN CONNECTOR }

model IntegrationConnection {
  id                  String                          @id @default(cuid())
  organizationId      String
  provider            String  // "slack" | "teams" | "jira" | "salesforce" | "snowflake" | ...
  displayName         String?
  encryptedTokens     Json    // {access_token, refresh_token?, expires_at?, ...}
  scopes              String[]
  status              IntegrationConnectionStatus     @default(PENDING)
  lastSyncAt          DateTime?
  lastError           String?
  metadata            Json?   // workspace_id, channel_id, etc.
  createdAt           DateTime                        @default(now())
  updatedAt           DateTime                        @updatedAt
  createdById         String
  @@index([organizationId, provider])
}

model Connector {
  id                  String          @id @default(cuid())
  organizationId      String
  name                String
  type                ConnectorType
  config              Json
  schedule            String?         // cron format
  isActive            Boolean         @default(true)
  lastRunAt           DateTime?
  lastRunStatus       String?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  createdById         String
  @@index([organizationId, isActive])
}

model Pipeline {
  id              String          @id @default(cuid())
  organizationId  String
  connectorId     String
  name            String
  steps           Json            // [{kind: "transform" | "filter" | "load", ...}]
  status          PipelineStatus  @default(IDLE)
  lastRunAt       DateTime?
  createdAt       DateTime        @default(now())
  @@index([connectorId])
}

model IngestionJob {
  id              String   @id @default(cuid())
  organizationId  String
  kind            String   // "csv" | "json" | "webhook" | "rest_connector" | "graphql_connector"
  source          Json     // {label, apiKeyId?, connectorId?, rowCount}
  status          String   // "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED"
  startedAt       DateTime
  finishedAt      DateTime?
  errorLog        String?  @db.Text
  createdAt       DateTime @default(now())
  @@index([organizationId, createdAt])
}

model Plugin {
  id              String      @id @default(cuid())
  organizationId  String
  name            String
  type            PluginType
  version         String
  entryUrl        String      // URL to JS module or iframe HTML
  description     String?
  isEnabled       Boolean     @default(true)
  config          Json?
  createdAt       DateTime    @default(now())
  installedById   String
  @@index([organizationId, type, isEnabled])
}
```

## Backend modules

### Module 1: IntegrationsModule (`apps/api/src/integrations/`)

- [ ] `IntegrationConnection` CRUD with AES-256-GCM token encryption
- [ ] `IntegrationCryptoService` — AES-256-GCM with 12-byte random IV + 16-byte auth tag; ciphertext layout `IV‖tag‖ct` base64
- [ ] `loadMasterKey()` — reads from `INTEGRATION_CRYPTO_KEY` env (hex/base64/passphrase); KMS-ready interface for future AWS KMS swap
- [ ] `getDecryptedTokens(connectionId)` — used by provider modules
- [ ] `updateStatus(id, status, error?)` — for sync health
- [ ] `rotateTokens(id, newTokens)` — for OAuth refresh
- [ ] Audit log never carries encrypted blob or raw tokens (redaction key list includes `encryptedTokens`)
- [ ] Endpoints: `GET/POST/DELETE /integrations` + provider-specific OAuth callback routes (`/integrations/:provider/callback`)
- [ ] 12 unit tests on crypto service: hex/base64/passphrase loading, roundtrip, tampering (ct + tag), short-cipher reject, 8KB + UTF-8 payloads

### Module 2: SlackModule

- [ ] Slack OAuth flow (`/integrations/slack/callback`)
- [ ] Bot installation + workspace metadata persistence
- [ ] Slash command handler `POST /integrations/slack/slash-command` (verifies Slack signature):
  - `/kpi <name>` → returns KPI card with current value + sparkline (Slack Block Kit)
  - `/kpi ask <question>` → calls NlqService → returns answer + chart URL
- [ ] Interactive components handler `POST /integrations/slack/interactive`:
  - "Acknowledge" button → calls `AlertsService.acknowledge(alertId)`
  - "Snooze 1h" button → updates Alert with snoozedUntil
- [ ] Alert posting: wire NotificationChannel kind=SLACK to use Block Kit format with severity emojis + action buttons
- [ ] Endpoints under `/integrations/slack/*`

### Module 3: TeamsModule

- [ ] Webhook-based posting (incoming webhook URLs per channel; no OAuth needed for posting)
- [ ] Adaptive Card format for alerts (severity color + KPI link + values + action buttons that POST back to integration handler)
- [ ] Limited bidirectional (Teams adaptive card actions are limited vs Slack)

### Module 4: JiraModule

- [ ] OAuth (`/integrations/jira/callback`)
- [ ] `JiraService.createIssueFromAlert(alertId, {projectKey, issueType, fields?})`:
  - Calls Jira REST API to create issue
  - Persists `externalRef` on Task linked to alert
- [ ] Webhook receiver `POST /integrations/jira/webhook` for issue status updates:
  - Map Jira status → Task status (To Do → TODO, In Progress → IN_PROGRESS, Done → DONE)
  - Update Task in-place
- [ ] Endpoints under `/integrations/jira/*`

### Module 5: InboundEmailModule (`apps/api/src/inbound-email/`)

- [ ] Public webhook receiver `POST /webhooks/inbound/email` (no auth — verified by HMAC)
- [ ] Body: `{to, from, subject, text, html?, attachments?}`
- [ ] Plus-addressing routing: parse `to` field for `inbound+<type>-<id>@host`:
  - `inbound+kpi-<kpiId>@host` → adds comment to KPI
  - `inbound+alert-<alertId>@host` → adds comment to Alert
  - `inbound+task-<taskId>@host` → adds comment to Task
- [ ] HMAC verifier on `x-inbound-signature` using `EMAIL_INBOUND_SECRET` env; dev mode passes through if secret unset
- [ ] Sender must match a user in resolved org (look up by from email)
- [ ] Quoted-reply stripping (lines with `>` prefix or "On … wrote:" boundary)
- [ ] Persists via `CommentsService.create()`
- [ ] 9 unit tests covering: signature valid/invalid, plus-addressing parse, sender-not-found, quoted-reply strip, attachments

### Module 6: ConnectorsModule

**Files**: `connectors.module.ts`, `connectors.controller.ts`, `runners/rest-runner.ts`, `runners/graphql-runner.ts`, `runners/postgres-runner.ts`, `connector-scheduler.service.ts`, `connector-runner.processor.ts`

- [ ] CRUD on Connector rows
- [ ] **REST runner** (`rest-runner.ts`):
  - Config: `{url, method?, headers?, valuePath, arrayPath?, recordedAtPath?, kpiId, queryParams?}`
  - Fetches → extracts rows via JSON path expressions → calls `DataPointsService.bulkCreate(rows)` with idempotency key namespace `rest:`
- [ ] **GraphQL runner** (`graphql-runner.ts`):
  - Config: `{query, variables?, url, kpiId, valuePath, arrayPath?, headers?, recordedAtPath?}`
  - POSTs `{query, variables}` → pulls rows from `data` envelope → rejects when `errors[]` non-empty
  - Idempotency namespace `graphql:`
- [ ] **Postgres runner** (`postgres-runner.ts`):
  - Config: `{connectionString (encrypted), query, kpiId, valueColumn, recordedAtColumn?}`
  - Read-only connection; runs query → maps rows → bulkCreate
- [ ] MySQL runner same pattern
- [ ] `ConnectorSchedulerService.onModuleInit()`:
  - Reads every `type=rest|graphql|postgres|mysql, isActive=true, schedule!=null` Connector
  - Registers per-row repeatable BullMQ job (`jobId: connector-run:<id>`, idempotent across redeploys)
- [ ] `ConnectorRunnerProcessor.handleRun(job)`:
  - Re-establishes org's ALS context via `RequestContextStore.run({principalType:"system", organizationId, userId:"system"})`
  - Dispatches by connector type to appropriate runner
  - Logs IngestionJob row (status SUCCEEDED/PARTIAL/FAILED with row counts)
- [ ] Hot-edit support: `register(id, orgId, cron)`, `unregister(id)`, `runNow(id, orgId)`, `reconcileAll()` exposed via API for admin
- [ ] Endpoints:
  - `GET/POST/PATCH/DELETE /connectors` (ORG_SETTINGS)
  - `POST /connectors/:id/run` (ORG_SETTINGS) — manual trigger
  - `GET /connectors/:id/runs` — IngestionJob history
- [ ] 9 unit tests on parseGraphqlConfig + extractGraphqlRows + REST equivalents

### Module 7: IngestModule (webhook ingest authenticated by ApiKey)

- [ ] `POST /ingest` (auth via Bearer kpinx_* + scope `kpi:data_entry`):
  - Body: `{source?, rows: [{kpiId, value, recordedAt?, idempotencyKey?, qualityFlag?, dimensions?}]}`
  - Accepts 1-10,000 rows per call
  - Creates IngestionJob audit row (kind=webhook + api_key_id + label + rowCount)
  - Forwards rows to `DataPointsService.bulkCreate`
  - Marks IngestionJob status SUCCEEDED / PARTIAL / FAILED based on results
- [ ] 4 unit tests

### Module 8: WebhooksModule (already shipped in P4, extend with event catalog)

- [ ] Extend events list with new domain events:
  - `task_created`, `task_assigned`, `task_completed`
  - `okr_progress_changed`
  - `approval_request_created`, `approval_request_decided`
  - `comment_added`, `mention_received`
  - `integration_connected`, `integration_disconnected`
  - `connector_run_completed`

### Module 9: ApiKeysModule (already shipped in P4, extend with SCIM scope)

- [ ] Add `scim:provision` to allowed scopes
- [ ] Used by P9 SCIM endpoints

### Module 10: PluginsModule (catalog only; sandbox in P9)

- [ ] CRUD on Plugin rows
- [ ] Filter by type
- [ ] `installPlugin({type, name, version, entryUrl, config?})` — registers (no auto-load yet)
- [ ] `enablePlugin(id)` / `disablePlugin(id)`
- [ ] **Sandbox execution deferred to P9** — P8 only catalogs what's installed
- [ ] Endpoints: `GET/POST/PATCH/DELETE /plugins` (ORG_SETTINGS)

## Frontend pages

- [ ] `/integrations` — marketplace cards (Slack/Teams/Jira/Salesforce/Snowflake/etc.) with OAuth status badges:
  - "Connect" button → starts OAuth flow → redirect to `/integrations/<provider>/callback`
  - Connected card shows lastSyncAt + "Disconnect" button
- [ ] `/integrations/[provider]` — provider-specific config (e.g., Slack channel mapping for which alerts go where)
- [ ] `/connectors` — list with name + type + schedule + last run status + manual run button
- [ ] `/connectors/new` — wizard:
  - Step 1: Source picker (REST / GraphQL / Postgres / MySQL / S3 / Webhook)
  - Step 2: Schema map (URL/query/connection string + JSON path / column names + KPI picker)
  - Step 3: Schedule (cron preset + custom)
  - Step 4: Test → preview rows that would be ingested
  - Step 5: Save + activate
- [ ] `/connectors/[id]` — detail + run history + manual trigger + edit
- [ ] `/settings/api-keys` (extended from P4) — list with keyPrefix, scopes (multi-select including `kpi:data_entry`, `scim:provision`, etc.), lastUsedAt, revoke; mint flow shows plaintext ONCE in dialog with copy button
- [ ] `/settings/webhooks` (extended from P4) — extended event picker with new events
- [ ] `/plugins` — gallery: list with name/type/version + install button (paste entryUrl + config JSON form) + enable/disable toggle

## Tests

### Unit tests
- [ ] IntegrationCryptoService: 12 cases
- [ ] InboundEmail: 9 cases
- [ ] REST + GraphQL runners: 9 cases
- [ ] Ingest scope check: API key without `kpi:data_entry` → 403

### Integration tests
- [ ] OAuth callback round-trip (mocked Slack token exchange)
- [ ] REST connector against test API (httpbin.org or similar) — config + run → KPI data points appear
- [ ] Webhook ingest with API key: POST /ingest with 100 rows → IngestionJob status SUCCEEDED + 100 KPIDataPoints created

### e2e tests
- [ ] `apps/web/e2e/integrations-slack.spec.ts` (with mocked Slack server) — connect → receive test alert → ack via slash command sim
- [ ] `apps/web/e2e/connector-rest.spec.ts` — create REST connector + manual run → preview rows → commit → KPI updates

## Acceptance checklist

```bash
# 1. Tests
pnpm test && pnpm test:int
pnpm --filter @kpi-nexus/web test:e2e

# 2. Slack end-to-end (needs Slack workspace + test app)
# a. Install Slack app via OAuth
# b. Add Slack notification channel for an alert rule
# c. Trigger alert → message appears in Slack channel with action buttons
# d. Click "Acknowledge" → Alert.status updates to ACKNOWLEDGED in app

# 3. Jira round trip
# a. Connect Jira via OAuth
# b. From alert detail, "Create Jira issue" → issue appears in Jira
# c. Move issue to "Done" in Jira
# d. Task in KPI Nexus status updates via webhook

# 4. REST connector daily pull
# a. Create REST connector pointing at public API (e.g., GitHub stargazers count)
# b. Schedule: "0 8 * * *" (8am daily)
# c. Run manually first → IngestionJob SUCCEEDED + KPIDataPoint appears
# d. Wait 24h → another run occurs at 8am

# 5. Inbound email
# a. Configure email forwarding from test address to webhook endpoint
# b. Send email to inbound+kpi-<id>@yourhost.com with body "This is a test comment"
# c. KPI detail page shows new comment

# 6. API key scope enforcement
# a. Mint API key with scope=["kpi:data_entry"] only
# b. POST /ingest with valid body → 200
# c. POST /kpis with valid body → 403 (KPI_CREATE scope not granted)

# 7. Plugin install
# a. Install a test widget plugin (entryUrl points at simple HTML)
# b. Plugin appears in /plugins
# c. Enable → available for use (sandbox in P9; for P8 just registration)

# 8. CI green
```

Tag `git tag p8-complete`.

## Gotchas + notes

- **Slack signature verify**: HMAC-SHA256 with timestamp + body + signing secret; must use `crypto.timingSafeEqual`
- **OAuth refresh tokens**: schedule periodic refresh job; on refresh failure, mark connection ERROR + notify admin
- **Connector polling vs streaming**: P8 only does scheduled pulls; future could add webhook subscribers
- **Postgres connector credentials**: encrypt connection string via IntegrationCryptoService; never log
- **Inbound email subdomain**: requires DNS MX setup to route `inbound.yourdomain.com` to email service; document setup
- **Plugin entry URL trust**: must be HTTPS + per-tenant verified; sandbox in P9 prevents XSS
- **Webhook event explosion**: don't fan out every event to every subscription; filter by events[] match upfront
- **ETL transform step**: deferred — current ETL is source → load (transform is `valuePath` extraction); full transform pipeline is post-P9

## Out of scope for P8

- Salesforce / Snowflake / Stripe data sources (architecture supports them; implement as needed)
- Bidirectional sync of all entities (we only do Alert↔Slack and Task↔Jira)
- Plugin sandboxing (P9)
- ETL transform stage with formula evaluation between fetch and load (post-P9)
- S3/GCS file watchers (architecture supports them; implement post-P9)

## What comes next

Once P8 is tagged complete, open `docs/superpowers/plans/P9-polish.md`. P9 is the polish phase — SSO, SCIM, custom domains, i18n, a11y, perf budgets, OpenAPI clean.
