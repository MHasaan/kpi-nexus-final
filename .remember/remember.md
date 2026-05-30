# Handoff

## State
Branch `phase/p8-integrations` (off p7-complete). **P0–P8 done+tagged.** ✅ **P8 COMPLETE** (tagged `p8-complete`).

### P8 recap (complete) — Integrations & Extensibility
- Migration `20260530040000_p8_integrations` (IntegrationConnection, Connector, Pipeline, IngestionJob, Plugin + 4 enums).
- **IntegrationsModule** (19) — pure AES-256-GCM `integration-crypto` + connection CRUD (tokens encrypted, never returned/audited); getDecryptedTokens/updateStatus/rotateTokens.
- **InboundEmailModule** (19) — pure HMAC verify + plus-addressing + quoted-reply strip; `POST /webhooks/inbound/email` (@Public, dev passthrough) → resolve entity→org+sender → CommentsService in synthesized ctx.
- **ConnectorsModule** (17) — pure extract (dot-path, REST/GraphQL, GraphQL errors[] reject); CRUD + runNow (fetch→extract→bulkRecordOrgWide→IngestionJob). REST+GraphQL only.
- **IngestModule** (4) — `POST /ingest` gated KPI_DATA_ENTRY → bulkRecordOrgWide + IngestionJob. **api-key scopes ARE PermissionKeys** so KPI_DATA_ENTRY key → 403 on POST /kpis (existing guard).
- **Slack/Teams/Jira** (24) — pure sig verify + Block Kit/Adaptive Card builders + Jira→Task status map; SlackService.handleInteractive (team_id→org→ack alert), JiraService.handleWebhook (status→Task); public callbacks.
- **PluginsModule** (5) — catalog CRUD + enable/disable. Webhook event catalog extended + GET /webhooks/events.
- **Frontend** — /integrations, /connectors(+[id]), /plugins; lib/integrations-client.ts.
- **Tests**: API unit **892/892**; e2e p8-integrations 4/4 (scope 403, inbound email→comment, connector run, plugin lifecycle).

Key fixes: IntegrationCryptoService env param @Optional (Nest DI); db index re-exports for P8 models/enums; **recordedById null for api_key principals** (ctx.userId is the key id, not a User → FK fail on connector/ingest writes) in KpiDataService.recordForOrgWideKpi.

Architecture: ApprovalGateModule pattern reused mentally; connectors/ingest share new `KpiDataService.bulkRecordOrgWide`. Servers during dev: api :4000 (LIVE Gemini), ML :8000. Background api started from `apps/api/dist/main.js` for e2e (log `.api-p8.log`).

### Deferred (documented, non-blocking)
Connector schedule BullMQ auto-runs (manual run shipped) + Postgres/MySQL/S3 runners (REST+GraphQL shipped). Plugin iframe sandbox + SSO/SCIM (`scim:provision`) → P9. Slack/Jira OAuth connect flows need real provider apps (handlers/formatting unit-tested).

## NEXT — P9 Polish
Execute `docs/superpowers/plans/P9-polish.md`: SSO + SCIM + custom domains + i18n + global search + activity feed + a11y + perf budgets + OpenAPI. Create branch `phase/p9-polish` off p8-complete. **Final phase.**
