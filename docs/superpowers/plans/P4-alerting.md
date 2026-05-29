# P4 — Alerting Implementation Plan

| | |
|---|---|
| **Phase** | P4 — Alerting |
| **Goal** | Alert rules evaluated post-data-point, escalations fan out with delays, multi-channel delivery with retry+DLQ, alert fatigue control via dedup+digest |
| **Effort** | ≈3 weeks solo |
| **Depends on** | P0, P1, P2, P3 (Realtime + BullMQ infrastructure) |
| **Blocks** | P5 (recommendations auto-trigger on alerts), P7 (workflow rule engine cross-references alerts), P8 (Slack/Teams integrations receive alerts) |
| **Spec reference** | §3.6 partial (alerts schema), §4.6 partial (alerting modules), §8.2 (BullMQ queues) |

## Why this phase matters

Without alerts, the KPI engine is a passive observer. P4 makes it actively notify the right people through the right channels when KPIs go off-track. The escalation system + dedup + digest are critical for production: a poorly designed alert system produces fatigue and gets ignored.

The retry+DLQ infrastructure for notifications is the safety net — provider 5xx errors must not silently drop alerts.

## Exit criteria

- [x] Alert latency <10s p95 — live smoke: breaching data point → OPEN alert in inbox within ~2s (BullMQ alert-eval).
- [x] Escalation level 2 fires after configured `delayMinutes` if not acknowledged — EscalationProcessor schedules level+1 by `delayMinutes`; OPEN guard halts an acked alert (4 unit tests).
- [x] Notification retry survives provider 5xx — dispatcher 30s/5m/30m exponential backoff; 4xx terminal, 5xx/network retry (6 unit tests).
- [x] Digest mode: 5 alerts within 60s → single email — NotificationDigestService deterministic colon-free jobId collapses the window (2 unit tests).
- [x] Cross-channel fan-out — dispatcher.dispatch sends one delivery per channelId + IN_APP; adapters for EMAIL/SLACK/TEAMS/SMS/WEBHOOK/IN_APP.
- [x] DLQ admin endpoints — GET /notification-deliveries?status=FAILED + POST :id/retry.
- [x] Webhook signature verify — constant-time + 5-min replay window (9 unit tests).
- [x] e2e: create rule → breach → inbox + Mailhog — uc-alerts e2e (UI create→breach→inbox→ack) + live smoke (escalation → EMAIL delivery SENT → Mailhog received).
- [ ] Tag `git tag p4-complete` — all exit criteria met; held for sign-off. Note: alerts bell (header unread badge + drawer) from the FE list is the one deferred non-exit-criterion item.

## Schema additions

### Migration: `013_alerts`

```prisma
enum AlertRuleType { STATIC_THRESHOLD DYNAMIC_STDDEV RATE_OF_CHANGE NO_DATA COMPOSITE }
enum AlertSeverity { LOW MEDIUM HIGH }
enum AlertStatus { OPEN ACKNOWLEDGED RESOLVED }
enum NotificationChannelKind { EMAIL SLACK TEAMS SMS IN_APP WEBHOOK }
enum NotificationDeliveryStatus { PENDING SENT FAILED SUPPRESSED }

model AlertRule {
  id              String          @id @default(cuid())
  organizationId  String
  kpiId           String
  name            String
  description     String?
  ruleType        AlertRuleType
  config          Json            // type-specific config
  severity        AlertSeverity   @default(MEDIUM)
  isActive        Boolean         @default(true)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  createdById     String
  @@index([kpiId, isActive])
  @@index([organizationId, isActive])
}

model EscalationRule {
  id              String   @id @default(cuid())
  organizationId  String
  alertRuleId     String   @unique
  levels          Json     // [{delayMinutes, channelIds[], notifyRoleIds[], notifyUserIds[]}, ...]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Alert {
  id              String          @id @default(cuid())
  organizationId  String
  alertRuleId     String?  // null for ad-hoc (e.g., anomaly confirms)
  kpiId           String
  message         String
  severity        AlertSeverity
  status          AlertStatus     @default(OPEN)
  targetUserId    String?
  acknowledgedAt  DateTime?
  acknowledgedById String?
  resolvedAt      DateTime?
  meta            Json?
  createdAt       DateTime        @default(now())
  @@index([organizationId, status, createdAt])
  @@index([kpiId, status])
  @@index([alertRuleId])
}

model NotificationChannel {
  id              String                    @id @default(cuid())
  organizationId  String
  name            String
  kind            NotificationChannelKind
  config          Json                      // encrypted credentials for SMTP/Slack webhook/etc.
  isActive        Boolean                   @default(true)
  createdAt       DateTime                  @default(now())
  updatedAt       DateTime                  @updatedAt
  @@index([organizationId, isActive])
}

model NotificationDelivery {
  id              String                      @id @default(cuid())
  organizationId  String
  alertId         String
  channelId       String?  // null for IN_APP
  targetUserId    String?
  status          NotificationDeliveryStatus  @default(PENDING)
  attempts        Int                         @default(0)
  error           String?
  sentAt          DateTime?
  createdAt       DateTime                    @default(now())
  @@index([alertId])
  @@index([status, createdAt])
  @@index([targetUserId, status])
}

model WebhookSubscription {
  id              String   @id @default(cuid())
  organizationId  String
  name            String
  url             String
  events          String[]
  secret          String   // for HMAC signing; prefix `whsec_`
  isActive        Boolean  @default(true)
  lastDeliveredAt DateTime?
  lastStatus      Int?     // last HTTP status
  failureCount    Int      @default(0)
  createdAt       DateTime @default(now())
  createdById     String
  @@index([organizationId, isActive])
}

model ApiKey {
  id              String   @id @default(cuid())
  organizationId  String
  name            String
  hashedKey       String   @unique
  keyPrefix       String   // 12-char display prefix
  scopes          String[]
  lastUsedAt      DateTime?
  expiresAt       DateTime?
  revokedAt       DateTime?
  createdAt       DateTime @default(now())
  createdById     String
  @@index([organizationId, revokedAt])
}
```

## Backend modules

### Module 1: AlertRulesModule

- [ ] CRUD with `ruleType`-specific config validation (Zod discriminated union):
  - `STATIC_THRESHOLD`: `{operator: ">" | "<" | ">=" | "<=" | "==", value: number}`
  - `DYNAMIC_STDDEV`: `{sigmas: number, windowSize: number}`
  - `RATE_OF_CHANGE`: `{pctChange: number, windowMinutes: number}`
  - `NO_DATA`: `{maxStaleMinutes: number}`
  - `COMPOSITE`: `{rules: AlertRuleConfig[], operator: "AND" | "OR"}`
- [ ] Severity per rule (LOW/MEDIUM/HIGH)
- [ ] Escalation editor: upserts `EscalationRule.levels Json` in same transaction
- [ ] Endpoints: `GET/POST/PATCH/DELETE /alert-rules` (KPI_EDIT for mutate, ALERTS_VIEW for read)

### Module 2: AlertEngineModule (`apps/api/src/alert-engine/`)

**Files**: `alert-engine.module.ts`, `alert-engine.producer.ts`, `alert-engine.processor.ts`, `evaluators/static-threshold.ts`, `evaluators/no-data.ts`, `*.spec.ts`

- [ ] BullMQ queue `alert-eval`
- [ ] `AlertEngineProducer.enqueueEvaluateKpi({kpiId, dataPointId, organizationId})` — called by `DataPointsService.create` after every non-COMPUTED insert
- [ ] `AlertEngineProcessor.handleEvaluateKpi(job)`:
  - Load active AlertRule rows for kpiId
  - For each rule:
    - Check cooldown: if `config.cooldownMinutes > 0` and any Alert exists for `(alertRuleId, kpiId)` within window → skip (log SUPPRESSED)
    - Evaluate rule (dispatch by ruleType):
      - STATIC_THRESHOLD: compare data point value vs operator+threshold
      - DYNAMIC_STDDEV: load last `windowSize` points, compute mean+stddev, check if current is >= `sigmas` σ away
      - RATE_OF_CHANGE: compare current vs `windowMinutes` ago, check pctChange
      - NO_DATA: check `recordedAt` of last data point vs `maxStaleMinutes` (this rule runs on cron, not data-point trigger)
      - COMPOSITE: recurse + AND/OR
    - If triggered: persist Alert, publish `alert_triggered` realtime event, enqueue escalation level 1 immediately
    - Fire-and-forget `RecommendationsService.generateInOrg({alertId, kpiId})` (P5 dep — stub in P4)
- [ ] **P4 implements STATIC_THRESHOLD + NO_DATA fully; DYNAMIC_STDDEV + RATE_OF_CHANGE + COMPOSITE accept config but evaluator can return false (stub) — full impl in P5 when stats infrastructure available**
- [ ] Scheduled NO_DATA scanner: BullMQ cron every 5 min walks all `ruleType=NO_DATA` rules + checks staleness
- [ ] Unit tests: each evaluator type with edge cases (boundary values, no history, etc.); cooldown suppression; idempotent enqueue

### Module 3: EscalationsModule

- [ ] `EscalationsService.enqueueLevel(alertId, organizationId, level, delayMs)` — adds BullMQ delayed job with deterministic jobId `escalate:{alertId}:lvl{n}` (idempotent across redeploys)
- [ ] `EscalationProcessor.handleEscalateAlert(job)`:
  - Load Alert + EscalationRule
  - **Abort if `alert.status !== "OPEN"`** (acknowledged or resolved by now)
  - Persist NotificationDelivery row per channel in level
  - Kick digest collator for each `notifyUserIds[]` (see Module 5)
  - Publish `alert_escalated` realtime event
  - Enqueue level+1 if exists with `delayMinutes * 60_000` delay
- [ ] Channel adapter dispatch handled by NotificationsModule
- [ ] Unit tests: 4 cases — trigger, cooldown suppression, level fan-out, OPEN guard

### Module 4: NotificationChannelsModule

- [ ] CRUD with `kind`-specific config validation (encrypted via AES-256-GCM):
  - EMAIL: `{smtpHost?, smtpPort?, fromAddress, replyToAddress?}` (or use Resend default)
  - SLACK: `{webhookUrl, channel?, username?, iconEmoji?}`
  - TEAMS: `{webhookUrl}`
  - SMS: `{twilioAccountSid, twilioAuthToken, fromNumber}`
  - IN_APP: `{}` (no config; always available)
  - WEBHOOK: `{url, headers?: Record<string, string>}` (HMAC secret auto-generated)
- [ ] `test()` endpoint — sends test message to the channel
- [ ] Endpoints: `GET/POST/PATCH/DELETE /notification-channels`, `POST /notification-channels/:id/test` (all ORG_SETTINGS)

### Module 5: NotificationsModule (the dispatcher + retry + digest)

**Files**: `notifications.module.ts`, `notifications.controller.ts`, `notification-dispatcher.service.ts`, `notification-retry.processor.ts`, `notification-digest.producer.ts`, `notification-digest.processor.ts`, `adapters/{email,slack,teams,sms,in_app,webhook}.ts`

- [ ] `NotificationDispatcherService.dispatch(alertId, organizationId, channelIds[], payload)`:
  - For each channelId: load channel, decrypt config, create NotificationDelivery row, call adapter
  - On success: status=SENT + sentAt
  - On failure: status=FAILED + error (truncated); auto-schedule retry attempt #1
- [ ] `NotificationDispatcherService.dispatchExisting(deliveryId)` — re-uses existing row (for retries)
- [ ] **Adapters** (each is a single file in `adapters/`):
  - `EmailAdapter.send(channel, payload)` — uses Resend API (`RESEND_API_KEY` env); falls back to console log when unset (dev mode)
  - `SlackAdapter.send(channel, payload)` — POST to webhook URL with severity emojis (🔴 HIGH, 🟡 MEDIUM, 🔵 LOW)
  - `TeamsAdapter.send(channel, payload)` — POST adaptive card to webhook
  - `SmsAdapter.send(channel, payload)` — Twilio API
  - `InAppAdapter.send(channel, payload)` — persists row only; UI reads via SSE
  - `WebhookAdapter.send(channel, payload)` — POST with HMAC-SHA256 signature header (see `WebhooksModule` signing)
- [ ] BullMQ queue `notification-retry` with exponential backoff:
  - Attempt 1: immediate (in dispatch)
  - Attempt 2: 30s
  - Attempt 3: 5min
  - Attempt 4: 30min
  - Max 3 retries; after that → terminal FAILED (DLQ)
- [ ] `NotificationRetryProcessor.handleRetry(job)`:
  - Reload delivery row
  - Refuse re-dispatch if status changed (e.g., admin manually re-sent meanwhile)
  - Call `dispatchExisting(deliveryId)`
  - Schedule next attempt or terminal FAILED
- [ ] **Operator DLQ endpoints**:
  - `GET /notification-deliveries?status=FAILED&from=&to=&limit=` (ORG_SETTINGS)
  - `POST /notification-deliveries/:id/retry` (ORG_SETTINGS)
- [ ] **Digest mode** (alert fatigue control):
  - `NotificationDigestProducer.enqueueDigest({orgId, userId})` — adds 60s-delayed job with deterministic jobId `digest:{orgId}:{userId}`; subsequent calls within 60s collapse onto same job
  - `NotificationDigestProcessor.handleDigest(job)`:
    - Query last 24h OPEN alerts for userId
    - Publish `alert_digest` realtime event with summary
    - Send digest email via EmailAdapter (if user's `notificationSettings.digestMode === "DAILY"` or `"WEEKLY"`)
- [ ] Per-user dedup window: rule config can include `cooldownMinutes`; AlertEngineProcessor checks this before creating new Alert
- [ ] Unit tests:
  - Dispatcher: 7 cases per adapter (SUCCESS, retry on 5xx, terminal on 4xx, idempotent re-dispatch)
  - Retry processor: 7 cases (schedules correctly, refuses if status changed, final attempt marks FAILED)

### Module 6: WebhooksModule (outbound)

**Files**: `webhooks.module.ts`, `webhooks.controller.ts`, `webhooks.service.ts`, `webhooks-signing.ts`, `outbound-webhook.processor.ts`

- [ ] `WebhooksService.create({name, url, events[]})` — generates secret `whsec_<base64url(32)>`, persists
- [ ] `WebhooksService.rotateSecret(id)` — mints fresh `whsec_*` once
- [ ] `WebhooksService.disable(id)` — sets `isActive=false`
- [ ] `webhooks-signing.ts`:
  - `signWebhook(secret, timestamp, body) → "v1=<hex>"`
  - `verifyWebhookSignature(secret, header, body, {maxSkewSeconds: 300}) → boolean` (constant-time + 5-min replay window)
  - 7+ unit tests (happy + tamper + wrong signature + wrong secret + drift exceeds tolerance + missing input + partial-match constant-time)
- [ ] `OutboundWebhookProcessor` (BullMQ queue `outbound-webhook`):
  - POSTs to webhook URL with headers `X-KpiNexus-Signature: t=<ts>,v1=<hex>` + `X-KpiNexus-Timestamp: <ts>`
  - Retries on 5xx (5 attempts exponential)
  - Increments `WebhookSubscription.failureCount` on final failure
  - Auto-disables at 100 consecutive failures
  - Updates `lastDeliveredAt + lastStatus`
- [ ] Endpoints:
  - `GET/POST/PATCH/DELETE /webhooks` (ORG_SETTINGS)
  - `POST /webhooks/:id/rotate-secret` (ORG_SETTINGS) — returns plaintext once
  - `POST /webhooks/:id/test` (ORG_SETTINGS) — manual fire
- [ ] Wire `RealtimeService.publish` to fan out matching events to active webhooks

### Module 7: ApiKeysModule

- [ ] `ApiKeysService.create({name, scopes[], expiresAt?})`:
  - Generate plaintext: `kpinx_<base64url(24)>` (~37 chars total)
  - Hash with SHA-256 → store in `hashedKey`
  - Extract 12-char display prefix (after `kpinx_`)
  - Return plaintext ONCE (never persisted in plaintext)
- [ ] `ApiKeysService.verify(plaintext)` — SHA-256 hash, lookup, validates not revoked + not expired; returns `{organizationId, apiKeyId, scopes}`; updates `lastUsedAt`
- [ ] `ApiKeysService.revoke(id)` — sets `revokedAt = now()`
- [ ] Endpoints: `GET/POST/DELETE /api-keys` (ORG_SETTINGS); POST returns plaintext
- [ ] **Wire into JwtAuthGuard**: short-circuits when `Authorization: Bearer kpinx_*` is present — calls `ApiKeysService.verify`; synthesises `req.user = {sub: apiKeyId, organizationId, principalType: "api_key", apiKeyScopes}` for the downstream `TenancyInterceptor`. `PermissionsGuard` checks `apiKeyScopes` against required perms for API-key principals (admin bypass disabled).
- [ ] Extend `RequestContext` with `principalType`/`apiKeyId`/`apiKeyScopes` (P1 already added these field placeholders)
- [ ] Unit tests: 6 covering create/verify/revoke/expire + 4 guard tests (happy path, invalid key 401, JWT fallback, @Public bypass)

## Frontend pages

- [ ] `/alerts` — table with filters (severity, status, KPI category, search); manual scan trigger; bulk acknowledge; severity badges (🔴🟡🔵)
- [ ] `/alerts/[id]` — detail page with related KPI chart + recommendation panel (stubbed until P5) + comments (stubbed until P7) + ack/snooze actions
- [ ] `/alerts/new` — form: name + description + KPI picker + rule type tabs (STATIC_THRESHOLD/DYNAMIC_STDDEV/RATE_OF_CHANGE/NO_DATA) + per-type fields + severity + escalation editor (see below)
- [ ] `<EscalationBuilder>` client component:
  - Dynamic list of levels with per-level: `delayMinutes` input, channels multi-select, notify-roles multi-select, optional notify-users multi-select
  - Up/down reorder + remove + clear-all controls
  - Compiles to `escalationLevels` JSON shape the API accepts
  - Empty-recipient rows dropped at serialize time
- [ ] `/alerts/channels` — NotificationChannel CRUD for EMAIL/SLACK/TEAMS/SMS/WEBHOOK/IN_APP with per-kind config + send-test button
- [ ] `/settings/notifications` — per-user prefs:
  - Email digest mode (OFF / DAILY 8am / WEEKLY Monday 8am)
  - Mute hours (start/end times for "do not disturb")
  - Per-channel mute (e.g., "no SMS")
- [ ] DLQ admin view at `/settings/notifications/dlq` — `GET /notification-deliveries?status=FAILED` with filter form + manual retry per row
- [ ] `/settings/webhooks` — list with name, URL (truncated), events, isActive toggle, lastStatus badge; create form; rotate-secret action
- [ ] `/settings/api-keys` — list with keyPrefix, scopes, lastUsedAt, revoke; mint flow (modal shows plaintext ONCE with copy button)
- [ ] AppHeader alerts bell — badge with unread alert count; opens NotificationCenter drawer with last 20 alerts + acknowledge inline

## Tests

### Unit tests
- [ ] AlertEngine evaluators: 5 rule types × 3-5 edge cases each
- [ ] Cooldown suppression: same KPI within window does not create new Alert
- [ ] Escalation OPEN guard: if alert acknowledged before escalation fires → no level-2 dispatch
- [ ] Webhook signing: 7 cases
- [ ] ApiKey verify: 6 cases + guard 4 cases
- [ ] Dispatcher: 7 cases per adapter
- [ ] Retry processor: 7 cases

### Integration tests
- [ ] Full alert flow: create STATIC_THRESHOLD rule → record breaching data point → alert appears in Alert table → NotificationDelivery rows created → Mailhog has email
- [ ] Escalation: create rule with 3-level escalation (1min, 5min, 10min) → wait → assert level 2 fires after 1 min if not acked
- [ ] Retry on failure: mock 503 from email provider → assert retry attempts 30s/5min/30min then terminal FAILED
- [ ] Digest: 5 alerts within 60s window → single email with summary
- [ ] Webhook outbound: trigger event → POST to test URL → signature verifies via verifyWebhookSignature

### e2e tests
- [ ] `apps/web/e2e/uc-alerts.spec.ts`: create alert rule via UI → record breaching data via API → assert alert visible in `/alerts` → click to acknowledge → status changes to ACKNOWLEDGED

## Acceptance checklist

```bash
# 1. Unit + integration tests
pnpm test && pnpm test:int

# 2. e2e
pnpm --filter @kpi-nexus/web test:e2e

# 3. Manual end-to-end smoke
# a. Create EMAIL channel (Mailhog config)
# b. Create STATIC_THRESHOLD rule on a KPI with severity=HIGH + escalation (level 1: EMAIL immediately, level 2: SMS after 5min)
# c. Record data point that breaches threshold
# d. Within 10s: alert in /alerts; email in Mailhog
# e. Wait 5min without ack: SMS-bound NotificationDelivery row appears with PENDING status (SMS provider may need fake config, in which case row is FAILED with retry scheduled)
# f. Acknowledge alert → escalation level 2 still pending; status check shows it's OPEN guard skipped escalation

# 4. Webhook outbound smoke
# a. Set up a test endpoint (e.g., webhook.site or local Express stub)
# b. Create WebhookSubscription with that URL + event "alert_triggered"
# c. Trigger an alert
# d. Check test endpoint: POST received with X-KpiNexus-Signature header
# e. Verify signature manually: HMAC-SHA256(secret, "{ts}.{body}") matches header

# 5. API key smoke
# a. Create API key with scope "kpi:data_entry"
# b. Try POST /kpis (KPI_CREATE) with Bearer token → 403
# c. Try POST /ingest (kpi:data_entry scope) → 200 (P8 dep; for P4, just verify guard logic)

# 6. DLQ smoke
# a. Force a delivery to fail (mock 5xx)
# b. After 30s/5min/30min: row stuck at terminal FAILED
# c. GET /notification-deliveries?status=FAILED → row appears
# d. POST /notification-deliveries/:id/retry → re-attempts

# 7. CI green
```

Tag `git tag p4-complete`.

## Gotchas + notes

- **BullMQ delayed jobs**: stored in Redis as sorted set keyed by `delay`; survives Redis restart; verify Upstash supports `bzpopmin` (some hosted Redis variants don't)
- **Escalation jobId determinism**: `escalate:{alertId}:lvl{n}` prevents duplicate scheduling if processor crashes mid-handoff
- **NO_DATA cron**: needs to run frequently (every 5 min) to detect freshness violations; balance with cost
- **Resend dev mode**: when `RESEND_API_KEY` unset, log email instead of sending — useful for local dev with Mailhog catching SMTP fallback
- **HMAC timing attacks**: use `crypto.timingSafeEqual` in `verifyWebhookSignature`; never plain `===`
- **API key prefix collision**: 12-char display prefix has 12^62 possible values; collision risk negligible
- **Replay attacks on webhooks**: 5-min replay window via `X-KpiNexus-Timestamp` is industry standard (Stripe uses this)
- **Channel encryption**: use the IntegrationCryptoService (P8 builds it; for P4, use a similar AES-256-GCM stand-in with `BYO_ENCRYPTION_KEY`)
- **In-app notifications**: don't actually send — just persist `NotificationDelivery` with `kind=IN_APP`; SSE + NotificationCenter UI reads them
- **AlertEngine performance**: at 1000 KPIs × 100 data points/day, evaluator runs ~100k times/day; each evaluation is <10ms; batch by kpiId

## Out of scope for P4

- AI-generated alert explanations (P5)
- Anomaly detection (P5)
- Slack action button → backend ack (P8)
- Jira issue creation from alert (P8)
- ApprovalWorkflow on alert rule changes (P7 — though rule changes can flow through approval)

## What comes next

Once P4 is tagged complete, open `docs/superpowers/plans/P5-ai-layer.md`. P5 is the biggest AI build: multi-provider abstraction, NLQ chat, insights, recommendations, ML sidecar.
