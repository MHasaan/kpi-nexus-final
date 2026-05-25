# P5 — AI Layer Implementation Plan

| | |
|---|---|
| **Phase** | P5 — AI Layer (multi-provider + budget + NLQ + insights + recs + ML sidecar) |
| **Goal** | Multi-provider AI working end-to-end with budget caps, NLQ chat answering real questions, recommendations triggering on alerts, insights generating daily, anomaly+forecasting via ML sidecar |
| **Effort** | ≈5 weeks solo |
| **Depends on** | P0–P4 (especially P2 KPI engine for context, P4 alerts for auto-trigger) |
| **Blocks** | P6 (onboarding AI co-pilot uses this layer), P7 (workflow rule engine can trigger AI actions) |
| **Spec reference** | §3.6 rest (anomaly/forecast/insight/recommendation/NLQ schema), §4.6 rest (AI modules), §7 (full AI/ML architecture) |

## Why this phase matters

AI is a major surface of the product. NLQ chat, contextual recommendations, AI-generated insights, anomaly detection with explanations, forecasting with confidence bands — these are the features that differentiate KPI Nexus from a spreadsheet. The multi-provider abstraction means we're never locked to one vendor and can let orgs BYO their own keys.

**Critical correctness**: visibility filtering must thread through AI features. A viewer asking "What's John's attendance?" via NLQ must not get John's data — the tool implementations apply `buildKpiVisibilityWhere(ctx)` to every query.

## Exit criteria

- [ ] Per-org Claude spend <$1/day with default settings (verified by AiBudget tests + manual e2e)
- [ ] Provider failover works (kill Claude → falls back to Gemini → response still returns successfully)
- [ ] NLQ: 18/20 hand-crafted golden questions return correct answers
- [ ] Anomaly F1 ≥0.7 on synthetic seasonal+spike test set
- [ ] Forecast MAPE ≤15% at 90-day horizon on test KPIs
- [ ] Alert latency still <10s p95 (no regression from AI auto-trigger)
- [ ] e2e UC-06 (Predictive Analytics), UC-07 (Detect Anomalies), UC-08 (Alerts & Recommendations) pass
- [ ] **NLQ visibility test: viewer asking about PER_USER data they don't own — system refuses or shows only visible**
- [ ] Tag `git tag p5-complete`

## Schema additions

### Migration: `014_ai_providers_budget`

```prisma
enum AiProviderKey { CLAUDE GEMINI OPENAI OLLAMA }
enum AiCallStatus { SUCCESS FAILED SUPPRESSED }
enum CircuitBreakerMode { FAIL_CLOSED FALLBACK }

model AiProvider {
  id                    String          @id @default(cuid())
  organizationId        String
  key                   AiProviderKey
  displayName           String
  isEnabled             Boolean         @default(true)
  encryptedCredentials  Json?           // BYO-key (AES-256-GCM with envelope)
  supportedFeatures     String[]
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt
  @@unique([organizationId, key])
}

model AiFeatureConfig {
  id                  String   @id @default(cuid())
  organizationId      String
  feature             String   // "NLQ_PRIMARY" | "INSIGHTS" | ... (11 features)
  providerId          String   // FK to AiProvider
  model               String   // e.g. "gemini-2.5-flash"
  fallbackProviderId  String?
  fallbackModel       String?
  perFeatureCapUsd    Float?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@unique([organizationId, feature])
}

model AiCallLog {
  id              String         @id @default(cuid())
  organizationId  String
  feature         String
  providerKey     AiProviderKey
  modelId         String
  inputTokens     Int            @default(0)
  outputTokens   Int            @default(0)
  costUsd         Float          @default(0)
  latencyMs       Int            @default(0)
  status          AiCallStatus
  errorCode       String?
  requestId       String
  context         Json?
  createdAt       DateTime       @default(now())
  @@index([organizationId, createdAt])
  @@index([organizationId, feature, createdAt])
  @@index([requestId])
}

model AiBudget {
  id                      String              @id @default(cuid())
  organizationId          String              @unique
  dailyCapUsd             Float               @default(1.0)
  monthlyCapUsd           Float               @default(30.0)
  circuitBreaker          CircuitBreakerMode  @default(FAIL_CLOSED)
  currentDailySpend       Float               @default(0)
  currentMonthlySpend     Float               @default(0)
  dailyPeriodStart        DateTime
  monthlyPeriodStart      DateTime
  updatedAt               DateTime            @updatedAt
}
```

### Migration: `015_anomalies_forecasts_insights_recommendations`

```prisma
enum ForecastModelKind { PROPHET ARIMA NAIVE LSTM }
enum RecommendationStatus { PENDING ACTIONED DISMISSED }

model AnomalyDetection {
  id              String   @id @default(cuid())
  organizationId  String
  kpiId           String
  dataPointId     String?
  score           Float
  method          String   // "ISOLATION_FOREST" | "ZSCORE" | "EWMA"
  isConfirmed     Boolean  @default(false)
  detectedAt      DateTime @default(now())
  @@index([kpiId, detectedAt])
  @@index([kpiId, isConfirmed])
}

model Forecast {
  id              String              @id @default(cuid())
  organizationId  String
  kpiId           String
  horizon         Int                 // days ahead
  model           ForecastModelKind
  predictions     Json                // [{ds, yhat, yhat_lower_80, yhat_upper_80, yhat_lower_95, yhat_upper_95}]
  fitMetrics      Json?               // {rmse, mape, aic}
  generatedAt     DateTime            @default(now())
  @@index([organizationId, kpiId, generatedAt])
}

model KPIInsight {
  id                  String   @id @default(cuid())
  organizationId      String
  kpiId               String
  narrative           String
  model               String
  promptTokens        Int      @default(0)
  completionTokens    Int      @default(0)
  generatedAt         DateTime @default(now())
  @@index([kpiId, generatedAt])
}

model Recommendation {
  id              String                  @id @default(cuid())
  organizationId  String
  kpiId           String
  alertId         String?
  anomalyId       String?
  content         Json                    // {summary, rootCauseHypotheses[], suggestedActions[{action, rationale, priority}]}
  confidence      Float                   // 0-1
  status          RecommendationStatus    @default(PENDING)
  createdAt       DateTime                @default(now())
  resolvedAt      DateTime?
  resolvedById    String?
  @@index([kpiId, status])
  @@index([alertId])
}

model NLQQuery {
  id                  String        @id @default(cuid())
  organizationId      String
  userId              String
  question            String
  embedding_openai    Unsupported("vector(1536)")?
  embedding_gemini    Unsupported("vector(768)")?
  embedding_voyage    Unsupported("vector(1024)")?
  response            Json          // {answer, chartSpec?, sources[]}
  latencyMs           Int
  costUsd             Float
  inputTokens         Int
  outputTokens        Int
  providerKey         AiProviderKey
  modelId             String
  status              AiCallStatus
  createdAt           DateTime      @default(now())
  @@index([organizationId, createdAt])
}

model KpiCatalogEmbedding {
  id                  String       @id @default(cuid())
  organizationId      String
  kpiId               String
  embedding_openai    Unsupported("vector(1536)")?
  embedding_gemini    Unsupported("vector(768)")?
  embedding_voyage    Unsupported("vector(1024)")?
  sourceText          String       // concatenated name + description + tags
  providerKey         AiProviderKey
  generatedAt         DateTime     @default(now())
  @@unique([kpiId, providerKey])
}

model Workflow {
  id              String   @id @default(cuid())
  organizationId  String
  name            String
  description     String?
  triggers        String[]   // "kpi_changed" | "schedule" | "alert" | "manual"
  rule            Json       // condition: {kpiId?, operator, value, ...}
  action          Json       // {kind: "create_task" | "post_webhook" | "send_notification", ...}
  isActive        Boolean    @default(true)
  lastRanAt       DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}
```

## packages/ai (the provider abstraction)

**Files**:
- `packages/ai/src/types.ts` — `IAiProvider` interface, normalized request/result/chunk
- `packages/ai/src/providers/claude.ts`
- `packages/ai/src/providers/gemini.ts`
- `packages/ai/src/providers/openai.ts`
- `packages/ai/src/providers/ollama.ts`
- `packages/ai/src/pricing.ts` — per-provider price table
- `packages/ai/src/index.ts`
- `packages/ai/src/**/*.spec.ts`

### types.ts

```typescript
export interface AiCompletionRequest {
  systemPrompt?: string;
  messages: Array<{role: 'user' | 'assistant'; content: string}>;
  maxTokens?: number;
  temperature?: number;
  tools?: NormalizedTool[];
  cacheControl?: 'ephemeral' | 'persistent';
}

export interface AiCompletionResult {
  content: string;
  toolCalls?: NormalizedToolCall[];
  finishReason: 'stop' | 'tool_use' | 'length' | 'content_filter';
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
  };
  actualCost: number;
}

export interface AiStreamChunk {
  delta?: string;
  toolCall?: NormalizedToolCall;
  finishReason?: 'stop' | 'tool_use' | 'length';
  usage?: AiCompletionResult['usage'];
}

export interface IAiProvider {
  readonly key: AiProviderKey;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
  stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk>;
  completeWithTools(req: AiCompletionRequest): Promise<AiCompletionResult>;
  embed(req: {texts: string[]; model: string}): Promise<number[][]>;
  capabilities(): AiCapabilities;
  ping(): Promise<{ok: boolean; latencyMs: number}>;
}

export interface NormalizedTool {
  name: string;
  description: string;
  parameters: object;  // JSON schema
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  input: object;
}
```

### Adapters (one file each)

- [ ] `ClaudeProvider`:
  - Direct fetch to `https://api.anthropic.com/v1/messages`
  - Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-beta: prompt-caching-2024-07-31, context-1m-2025-08-07`
  - `cache_control: { type: 'ephemeral' }` on system prompt + large catalogs
  - Tool calls translated to/from `tool_use` blocks
  - SSE streaming via `stream: true` + event parsing
- [ ] `GeminiProvider`:
  - `:generateContent` + `:streamGenerateContent` REST
  - 8-key rotation pool + cooldown on quota exhaustion (port from current app's pattern)
  - `functionCall` ↔ `NormalizedToolCall` translation
  - `:batchEmbedContents` for embeddings
- [ ] `OpenAiProvider`:
  - `/v1/chat/completions` + tools + embeddings
  - `text-embedding-3-small` (default) or `-large` for higher dim
  - `cached_tokens` captured from `prompt_tokens_details.cached_tokens`
- [ ] `OllamaProvider`:
  - `POST /api/chat` + `/api/embeddings` to `OLLAMA_BASE_URL`
  - cost = $0 always
  - tools field forwarded as-is

### pricing.ts

```typescript
export const PRICING: Record<string, {inputPerMTok: number; outputPerMTok: number; cachedInputPerMTok?: number}> = {
  'claude-opus-4-7': {inputPerMTok: 15, outputPerMTok: 75, cachedInputPerMTok: 1.5},
  'claude-haiku-4-5': {inputPerMTok: 1, outputPerMTok: 5, cachedInputPerMTok: 0.1},
  'gemini-2.5-flash': {inputPerMTok: 0, outputPerMTok: 0},  // free tier
  'gemini-2.5-flash-lite': {inputPerMTok: 0, outputPerMTok: 0},
  'openai-gpt-4o': {inputPerMTok: 2.5, outputPerMTok: 10, cachedInputPerMTok: 1.25},
  'openai-text-embedding-3-small': {inputPerMTok: 0.02, outputPerMTok: 0},
  'ollama-*': {inputPerMTok: 0, outputPerMTok: 0},
};

export function priceCall(model: string, usage: {inputTokens: number; outputTokens: number; cachedTokens?: number}): number {
  const tier = PRICING[model] ?? PRICING[model.split(':')[0] + '-*'];
  if (!tier) return 0;  // fail-open on unknown model
  const inputCost = ((usage.inputTokens - (usage.cachedTokens ?? 0)) / 1_000_000) * tier.inputPerMTok;
  const cachedCost = ((usage.cachedTokens ?? 0) / 1_000_000) * (tier.cachedInputPerMTok ?? tier.inputPerMTok);
  const outputCost = (usage.outputTokens / 1_000_000) * tier.outputPerMTok;
  return inputCost + cachedCost + outputCost;
}
```

## Backend modules

### Module 1: AiModule core (`apps/api/src/ai/`)

**Files**: `ai.module.ts`, `ai-router.service.ts`, `ai-budget.service.ts`, `ai-call-log.service.ts`, `ai-provider-registry.ts`, `byo/`, `default-fyp-config.ts`, `*.spec.ts`

- [ ] `AiProviderRegistry`:
  - Instantiates platform adapters from env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEYS`, `OLLAMA_BASE_URL`)
  - Caches BYO instances per-org separately (loaded from `AiProvider.encryptedCredentials` via `ByoKeyService.getDecryptedKeyForOrg()`)
  - `getProvider(orgId, providerKey)` returns adapter (BYO if configured for org, else platform)

- [ ] `DEFAULT_FYP_CONFIG` map (11 features → primary/fallback):
  ```typescript
  export const DEFAULT_FYP_CONFIG: Record<AiFeature, {provider: AiProviderKey; model: string; fallback?: {provider: AiProviderKey; model: string}}> = {
    ONBOARDING_GENERATOR: {provider: 'GEMINI', model: 'gemini-2.5-flash', fallback: {provider: 'CLAUDE', model: 'claude-haiku-4-5'}},
    ONBOARDING_ASSISTANT: {provider: 'GEMINI', model: 'gemini-2.5-flash', fallback: {provider: 'GEMINI', model: 'gemini-2.5-flash-lite'}},
    ONBOARDING_SUGGEST: {provider: 'GEMINI', model: 'gemini-2.5-flash-lite'},
    ONBOARDING_EXPLAIN: {provider: 'GEMINI', model: 'gemini-2.5-flash-lite'},
    KPI_SUGGESTIONS: {provider: 'GEMINI', model: 'gemini-2.5-flash', fallback: {provider: 'CLAUDE', model: 'claude-haiku-4-5'}},
    NLQ_PRIMARY: {provider: 'GEMINI', model: 'gemini-2.5-flash', fallback: {provider: 'CLAUDE', model: 'claude-haiku-4-5'}},
    NLQ_TOOLS: {provider: 'GEMINI', model: 'gemini-2.5-flash', fallback: {provider: 'CLAUDE', model: 'claude-haiku-4-5'}},
    INSIGHTS: {provider: 'GEMINI', model: 'gemini-2.5-flash', fallback: {provider: 'CLAUDE', model: 'claude-haiku-4-5'}},
    RECOMMENDATIONS: {provider: 'GEMINI', model: 'gemini-2.5-flash', fallback: {provider: 'CLAUDE', model: 'claude-opus-4-7'}},
    ANOMALY_EXPLANATIONS: {provider: 'GEMINI', model: 'gemini-2.5-flash-lite', fallback: {provider: 'GEMINI', model: 'gemini-2.5-flash'}},
    EMBEDDINGS: {provider: 'OPENAI', model: 'openai-text-embedding-3-small', fallback: {provider: 'GEMINI', model: 'gemini-text-embedding-004'}},
  };
  ```

- [ ] `AiRouterService.complete(feature, request)`:
  - Resolve config: `getAiFeatureConfig(orgId, feature) ?? DEFAULT_FYP_CONFIG[feature]`
  - Pre-flight budget check: `AiBudget.assertBudget(estimatedCost)` — throws `AiBudgetExceededError` (HTTP 402-shaped)
  - Try primary provider; on success: `AiBudget.debit(actualCost)` + `AiCallLog.record(...)`; return result
  - On retryable error (429, 5xx, network): try fallback
  - On `BUDGET_EXCEEDED` in `FALLBACK` mode: try fallback
  - Else throw `AiProviderUnavailableError({attempted: [...]})`
- [ ] `AiRouterService.stream(feature, request)` — same logic but yields chunks
- [ ] `AiRouterService.embed(feature, request)` — simpler (no streaming, no tools)
- [ ] 4 unit tests cover: happy path, fallback on rate limit, total failure throws AiProviderUnavailableError, budget-blocked returns 402

- [ ] `AiBudgetService`:
  - Redis keys: `ai_budget:{orgId}:daily:{yyyymmdd}` + `:monthly:{yyyymm}`
  - `assertBudget(orgId, cost)` — pre-flight; throws if would exceed cap
  - `debit(orgId, cost)` — atomic Redis MULTI to increment both daily + monthly
  - `getCircuitBreakerMode(orgId)` — returns `FAIL_CLOSED` or `FALLBACK`
  - `getSpendSnapshot(orgId)` — returns current + caps for UI
  - Lazy daily/monthly window rollover on read
  - 11 unit tests covering all the gating paths

- [ ] `AiCallLogService.record({organizationId, feature, providerKey, modelId, inputTokens, outputTokens, costUsd, latencyMs, status, errorCode?, requestId, context?})` — non-blocking persist

- [ ] `byo/byo-key.service.ts`:
  - `setKey(provider, apiKey)`:
    - Validate format via per-provider regex
    - Live `ping()` with 5s timeout (soft failure ok)
    - AES-256-GCM encrypt with `BYO_ENCRYPTION_KEY` (32-byte hex/base64/passphrase via `loadMasterKey()`)
    - Envelope includes `kmsKeyId` for rotation detection
    - Persist to `AiProvider.encryptedCredentials`
    - Invalidate registry cache
  - `clearKey(provider)` — nulls credentials
  - `getDecryptedKeyForOrg(orgId, provider)` — used by registry
  - 5 unit tests: roundtrip, random IV, tampered tag rejected, key rotation detection, prod hash format

### Module 2: AnomalyDetectionModule

- [ ] `AnomalyService.detect(kpiId, {method?, threshold?, persist?})` — calls ML sidecar `/anomaly/detect` via `MlClientService` (see HMAC auth below); persists `AnomalyDetection` rows if `persist=true`
- [ ] `AnomalyService.confirm(anomalyId)` — sets `isConfirmed=true`; on false→true transition:
  - Fire-and-forget `RecommendationsService.generateInOrg({kpiId, anomalyId})`
  - Persist synthetic HIGH-severity Alert (alertRuleId=null)
  - Publish `alert_triggered` realtime event so in-app inbox + downstream listeners see it
  - Escalation chain intentionally skipped (no rule)
- [ ] `MlClientService.post(endpoint, payload)`:
  - Pull org from `RequestContextStore.get()`
  - Stamp headers: `X-Tenant-Id` (orgId), `X-Signature-Timestamp` (Unix-ms), `X-Signature` (HMAC-SHA256 hex of `${ts}.${orgId}` keyed by `ML_SIDECAR_HMAC_SECRET`)
  - 8 unit tests: roundtrip, tampered orgId, wrong secret, stale timestamp, custom skew window, missing headers, non-numeric ts
- [ ] Endpoints:
  - `GET /kpis/:kpiId/anomalies?from=&to=&isConfirmed=` (INSIGHTS_VIEW + visibility filter)
  - `POST /kpis/:kpiId/anomalies/detect` (INSIGHTS_VIEW) — live re-detect with config knobs
  - `PATCH /kpis/:kpiId/anomalies/:id/confirm` (KPI_EDIT)

### Module 3: ForecastsModule

- [ ] `ForecastsService.forecast(kpiId, {horizon, model?})` — calls ML sidecar `/forecast`; persists Forecast row
- [ ] Returns yhat + 80%/95% confidence bands + fit metrics
- [ ] Endpoints:
  - `GET /kpis/:kpiId/forecasts?model=` (INSIGHTS_VIEW + visibility)
  - `POST /kpis/:kpiId/forecasts {horizon, model}` (INSIGHTS_VIEW)

### Module 4: WhatIfModule

- [ ] `WhatIfService.simulate(kpiId, {scenarios[], mechanic})` — for each upstream-dependency KPI in `scenarios`, calls ML sidecar `/whatif`
- [ ] Falls back to cascade children → top-10 active KPIs in same org if no formal deps
- [ ] Endpoints: `POST /kpis/:kpiId/whatif {scenarios[], mechanic, baselineCount?}` (INSIGHTS_VIEW)

### Module 5: KpiSuggestionsModule

- [ ] `KpiSuggestionsService.suggest({count, focus?})`:
  - Pull Organization (name/industry/type/sizeTier) + KPI names (max 200)
  - Ask via `AiRouter.complete('KPI_SUGGESTIONS', {systemPrompt, messages})` for JSON output `{suggestions: [{name, description, type, direction, scorecardQuadrant, frequency, unit?, suggestedTarget?, rationale?}]}`
  - Strip ```json fences, validate enums (drop invalid entries), clamp count 1-10
- [ ] Endpoint: `POST /ai/suggest-kpis {count?: 1-10, focus?: string}` (KPI_CREATE)
- [ ] 5 unit tests covering parse, fallback, validation

### Module 6: InsightsModule

- [ ] `InsightsService.generate(kpiId)` — computes window stats (first/last/avg/min/max/changePct), prompts via `AiRouter.complete('INSIGHTS', ...)` with strict format instruction, persists KPIInsight
- [ ] `InsightsService.generateBatch({thresholdChangePct?})` — for each KPI org-wide where |changePct| ≥ threshold (default 10%), generate insight; ranks + caps top-N (default 20)
- [ ] BullMQ repeatable cron `30 2 * * *` UTC scheduled job (via `POST /insights/schedule-daily`)
- [ ] Endpoints:
  - `GET /insights?kpiId=&from=&to=` (INSIGHTS_VIEW)
  - `POST /insights/generate {kpiId}` (INSIGHTS_VIEW)
  - `POST /insights/generate-batch {thresholdChangePct?}` (INSIGHTS_VIEW)
  - `POST /insights/schedule-daily` (ORG_SETTINGS)
- [ ] 3 unit tests covering persist, skip-when-too-few-points, ranked org-wide batch

### Module 7: RecommendationsModule

- [ ] `RecommendationsService.generate({kpiId, alertId?, anomalyId?})`:
  - Pull KPI definition + recent points (30 days) + dependencies + recent anomalies + optional alert context
  - Prompt via `AiRouter.complete('RECOMMENDATIONS', ...)` with strict JSON schema
  - Parse `{summary, rootCauseHypotheses[], suggestedActions[{action, rationale, priority}], confidence}`
  - Persist Recommendation; status=PENDING
- [ ] `RecommendationsService.generateInOrg({kpiId, alertId?, anomalyId?})` — async fire-and-forget version for auto-trigger; never breaks the calling pipeline
- [ ] `RecommendationsService.updateStatus(id, status)` — flips PENDING → ACTIONED/DISMISSED; sets `resolvedAt + resolvedById`
- [ ] **Auto-trigger wiring**: `AlertEngineProcessor.handleEvaluateKpi` calls `generateInOrg({alertId, kpiId})` after each persisted Alert
- [ ] Endpoints:
  - `GET /recommendations?kpiId=&alertId=&status=` (INSIGHTS_VIEW)
  - `POST /recommendations/generate {kpiId, alertId?, anomalyId?}` (INSIGHTS_VIEW)
  - `PATCH /recommendations/:id/status {status}` (KPI_EDIT)
- [ ] 3 unit tests covering JSON parse happy path, parse-fallback, alert→kpi resolution

### Module 8: NlqModule (the chat)

**Files**: `nlq.module.ts`, `nlq.controller.ts`, `nlq.service.ts`, `nlq.tools.ts`, `kpi-catalog-embedding.service.ts`, `reembed.producer.ts`, `reembed.processor.ts`

- [ ] `NlqService.ask({question, userId, organizationId})`:
  1. EMBED question via `AiRouter.embed('EMBEDDINGS', {texts: [question]})`
  2. pgvector cosine search `KpiCatalogEmbedding` filtered by org → LIMIT 20:
     ```sql
     SELECT kpi_id, 1 - (embedding_openai <=> $1) AS similarity
     FROM "KpiCatalogEmbedding"
     WHERE organization_id = $2 AND embedding_openai IS NOT NULL
     ORDER BY embedding_openai <=> $1
     LIMIT 20;
     ```
  3. Apply `buildKpiVisibilityWhere(ctx)` to filter sources to what user can see
  4. Claude tool-use loop (max 5 rounds):
     - System prompt: instructions + KPI catalog context (cached)
     - User message: original question
     - 5 tools registered: `query_timeseries`, `compare_kpis`, `get_metadata`, `forecast_kpi`, `get_kpi_history`
     - Both `tool_use` and `tool_result` roundtrips through the model
  5. Extract final answer + optional `chartSpec` from response
  6. Persist NLQQuery row including question embedding, response, latency, cost
  7. Return `{answer, chartSpec?, sources[], latencyMs, costUsd, provider, model}`
- [ ] `NlqService.reembed(orgId?)` — back-fills `KpiCatalogEmbedding` for the org (or all orgs if admin endpoint)
- [ ] `nlq.tools.ts` — 5 tool implementations:
  - `query_timeseries({kpiId, from, to, agg})` — uses CAGG-backed query; **applies visibility filter so user can't query a KPI they don't see**
  - `compare_kpis({kpiIds[], from, to})` — multi-KPI series with same visibility filter
  - `get_metadata({kpiId})` — definition + thresholds + targets (visibility-filtered)
  - `forecast_kpi({kpiId, horizon})` — proxies to ML sidecar; respects visibility
  - `get_kpi_history({kpiId, limit})` — raw N most-recent points for fact-checking dates
- [ ] **Auto-reembed**: `KpisService.create/update` schedules `KpiCatalogEmbeddingService.reembedKpi(kpiId)` fire-and-forget when `name/description/tags/unit` change
- [ ] **Provider-switch reembed**: BullMQ queue `nlq-reembed` + `ReembedProducer.enqueueReembedOrg(orgId, triggerKey)` with deterministic jobId (coalesces simultaneous flips); processor calls `reembedAllForOrg()` (chunked, idempotent)
- [ ] `AiConfigsService.upsertConfig` detects embedding-provider change → enqueues reembed
- [ ] Endpoints:
  - `POST /nlq/ask {question}` (INSIGHTS_VIEW)
  - `POST /nlq/reembed` (ORG_SETTINGS) — manual back-fill
- [ ] 4 unit tests covering happy path, tool-use loop, embedded chartspec extraction, catalog-search failure
- [ ] **NLQ visibility test (Critical)**: viewer asks about restricted PER_USER data → tool returns empty or refuses; LLM produces "I don't have access to that data" answer

### Module 9: AiConfigsService + endpoints (per-feature config)

- [ ] `AiConfigsService.upsertConfig(feature, {providerId, model, fallbackProviderId?, fallbackModel?, perFeatureCapUsd?})` — upserts AiFeatureConfig; if embedding provider changed, enqueues reembed
- [ ] `AiConfigsService.list()` — returns all configs + defaults for unconfigured features
- [ ] Endpoints under `apps/api/src/ai/ai-configs.controller.ts`:
  - `GET /ai/configs` (ORG_SETTINGS)
  - `PUT /ai/configs/:feature` (ORG_SETTINGS)
  - `DELETE /ai/configs/:feature` (ORG_SETTINGS) — reverts to default
  - `PATCH /ai/budget {dailyCapUsd?, monthlyCapUsd?, circuitBreaker?}` (ORG_SETTINGS)
  - `GET /ai/budget` (ORG_SETTINGS) — current spend snapshot
- [ ] BYO endpoints under `apps/api/src/ai/byo/byo.controller.ts`:
  - `GET /ai/providers/byok` (ORG_SETTINGS) — list configured BYO providers
  - `POST /ai/providers/:key/byok {apiKey}` (ORG_SETTINGS)
  - `DELETE /ai/providers/:key/byok` (ORG_SETTINGS)

## ML sidecar (`apps/ml/`)

Implement endpoints. Each is stateless — data passed in by API, no DB access.

### `/anomaly/detect`

- [ ] `apps/ml/app/routers/anomaly.py`
- [ ] Input: `{values: number[], timestamps: string[], threshold?: float, method?: "ensemble" | "isolation_forest" | "zscore" | "ewma"}`
- [ ] Output: `{anomalies: [{index, score, methodHits: {isolation_forest?: float, zscore?: float, ewma?: float}}]}`
- [ ] IsolationForest via sklearn
- [ ] Z-score: mean ± 3σ
- [ ] EWMA: exponentially weighted moving average + std band
- [ ] Ensemble: average of normalized scores
- [ ] 4 unit tests covering known anomaly patterns

### `/forecast`

- [ ] `apps/ml/app/routers/forecast.py`
- [ ] Input: `{values: number[], timestamps: string[], horizon: int, model?: "prophet" | "arima" | "naive"}`
- [ ] Output: `{predictions: [{ds, yhat, yhat_lower_80, yhat_upper_80, yhat_lower_95, yhat_upper_95}], fitMetrics: {rmse, mape, aic}}`
- [ ] Prophet for seasonal data
- [ ] ARIMA fallback (statsmodels) when Prophet fails or `model="arima"`
- [ ] Naive last-resort: linear extrapolation
- [ ] 3 unit tests

### `/whatif`

- [ ] `apps/ml/app/routers/whatif.py`
- [ ] Input: `{baseline: {values: number[]}, scenarios: [{deltaPct?, deltaAbsolute?, mechanic: "additive" | "multiplicative", floor?, ceiling?}]}`
- [ ] Output: `{baseline, scenarios: [{values, aggregateLift, aggregateLiftPct}]}`
- [ ] 4 unit tests

### `/correlation` and `/seasonality`

- [ ] `apps/ml/app/routers/correlation.py` — pairwise + matrix via scipy.stats.pearsonr/spearmanr
- [ ] `apps/ml/app/routers/seasonality.py` — statsmodels.tsa.seasonal_decompose

### HMAC auth middleware

- [ ] `apps/ml/app/middleware/hmac_auth.py`:
  - Verify `X-Tenant-Id` + `X-Signature-Timestamp` + `X-Signature` headers
  - Constant-time compare via `hmac.compare_digest`
  - 5-min skew window via `abs(now_ms - ts_ms) > 300_000` reject
  - Refuses `ML_SIDECAR_HMAC_SECRET=dev-ml-shared-secret` placeholder in production (when `ENV=production`)
- [ ] Apply to all routes except `/health`

## Frontend pages

- [ ] `/settings/ai` — AI Settings page:
  - Daily/monthly spend tiles with cap progress bars
  - Last-7d call counts per provider
  - Per-feature card: provider+model select + fallback select + per-feature cap input + save
  - BYO-key paste-and-validate flow per provider (paste → ping → encrypt → persist)
- [ ] `/ask` — NLQ chat page:
  - Message list (top) + input (bottom)
  - Each assistant message renders: answer (markdown), sources (KPI links), suggested chartspec preview (if any), provider/model/cost footer
  - Server Action POSTs to `/api/nlq/ask`
- [ ] `/insights` — server-rendered list of KPIInsight: KPI link + narrative + token footer + "Generate insights" Server Action calling `/api/v1/insights/generate-batch`
- [ ] `/recommendations` — list with status badges; priority-coded actions (P1: red, P2: amber, P3: blue); root-cause hypotheses bulleted; confidence percentage; status flip buttons (Actioned / Dismissed)
- [ ] `/kpis/[id]/anomalies` — `apps/web/src/components/charts/series-chart.tsx` (custom SVG line + 95% band + anomaly markers; no Recharts dep) + live re-detect with z-threshold knob + persist toggle + side-by-side live vs saved tables
- [ ] `/kpis/[id]/forecast` — model + horizon controls + predictions table + fit-metric tiles (RMSE/MAPE/AIC) + chart with yhat + 80%/95% bands
- [ ] `/kpis/[id]/whatif` — sliders for input KPIs → forecasted output KPI:
  - Range slider + sensitivity input per upstream-dependency KPI (falls back to cascade children → top-10 active KPIs in same org if no formal deps)
  - Mechanic toggle (additive/multiplicative)
  - `baselineCount` setting
  - Side-by-side baseline vs scenario SVG line + raw points table + aggregate lift / lift% tiles

## Tests

### Unit tests
- [ ] AiRouter fallback chain: 4 cases (happy, fallback on 429, total failure, budget-blocked)
- [ ] AiBudgetService gating: 11 cases (boundary values, rollover, exact cap, etc.)
- [ ] Per-provider adapters: smoke test against mocked HTTP (3-5 each)
- [ ] pricing.priceCall: 5 cases (cached pricing, unknown model fail-open, ollama=$0, sanity across providers, edge cases)
- [ ] BYO encryption: 5 cases (roundtrip, random IV, tampered tag, key rotation, prod hash format)
- [ ] ML client HMAC: 8 cases
- [ ] NLQ tools: 4 cases each
- [ ] Recommendations parse: 3 cases (happy, malformed JSON fallback, alert→kpi resolution)
- [ ] Insights: 3 cases (persist, skip-too-few-points, ranked batch)

### Integration tests
- [ ] Full alert → recommendation flow: create rule → record breach → alert created → recommendation auto-generated (with mocked AI provider) → appears in /recommendations
- [ ] Anomaly confirm → alert + recommendation triggers
- [ ] NLQ end-to-end with mocked AI: question → embed → catalog search → tool calls executed → answer assembled
- [ ] Visibility test: viewer queries via NLQ → tool returns visibility-filtered results

### Performance tests
- [ ] Anomaly F1 on synthetic test set: seasonal+spike data, ground truth labels, F1 ≥0.7
- [ ] Forecast MAPE: 90-day horizon, holdout last 30 days, MAPE ≤15%
- [ ] NLQ golden harness: 20 hand-crafted Q&A in `apps/api/src/nlq/acceptance/golden-questions.ts`; scorer in `scorer.ts` (3 subchecks per question); CI gate at ≥18/20 (90%)

### e2e tests
- [ ] `apps/web/e2e/uc06-predictive.spec.ts` — navigate `/kpis/[id]/forecast` → select model → generate → see predictions chart
- [ ] `apps/web/e2e/uc07-anomalies.spec.ts` — `/kpis/[id]/anomalies` → adjust threshold → re-detect → confirm one → see status change
- [ ] `apps/web/e2e/uc08-alerts-recs.spec.ts` — trigger alert → recommendation appears in `/recommendations` within reasonable time

## Acceptance checklist

```bash
# 1. Tests
pnpm test && pnpm test:int
pnpm --filter @kpi-nexus/web test:e2e
pnpm --filter @kpi-nexus/api test:e2e  # includes NLQ golden harness gate

# 2. ML sidecar tests
cd apps/ml && pytest

# 3. AI budget verification
# a. Set AiBudget.dailyCapUsd=$0.10 (lower than default for testing)
# b. Fire 5 RECOMMENDATIONS calls
# c. 6th call should throw AiBudgetExceededError (HTTP 402)
# d. Check Redis: ai_budget:{orgId}:daily:{today} = ~$0.10

# 4. Provider failover
# a. Set ANTHROPIC_API_KEY=invalid (kill Claude)
# b. Fire NLQ call (default Gemini primary, Claude fallback — but Gemini is free)
# c. Verify response returns successfully (used Gemini)
# d. Reverse: set GEMINI_API_KEYS=invalid; verify Claude fallback fires

# 5. NLQ smoke
# a. Run /nlq/reembed once to back-fill KpiCatalogEmbedding
# b. Open /ask
# c. Ask: "What is our MRR trend over the last 3 months?"
# d. Verify: answer mentions MRR, includes chartspec, sources include MRR KPI link
# e. As viewer (without KPI_VIEW for sensitive PER_USER KPIs): ask about restricted data → answer should refuse or limit to visible

# 6. Anomaly + recommendation auto-trigger
# a. Set up alert rule on a KPI with STATIC_THRESHOLD
# b. Record breaching data point
# c. Within 30s: Alert created + Recommendation appears in /recommendations with content populated

# 7. Insights cron
# a. Trigger /insights/generate-batch manually
# b. Verify KPIInsight rows created for KPIs with significant change
# c. Schedule daily via /insights/schedule-daily → verify BullMQ repeatable job registered

# 8. Forecasts
# a. /kpis/[id]/forecast → select Prophet + horizon 30
# b. Generate → see chart with yhat + bands
# c. MAPE from fitMetrics ≤ 15% on test KPIs with known patterns

# 9. CI green
```

Tag `git tag p5-complete`.

## Gotchas + notes

- **Prophet install**: heavy dependency, requires C++ compiler; Docker image pre-installs it
- **isolated-vm vs ML sidecar**: formula evaluator stays in TS isolated-vm; ML stays in Python sidecar; don't mix
- **AI mock for tests**: `AI_MOCK_RESPONSE` env var returns canned responses for e2e — saves cost + makes tests deterministic
- **Embedding dimensions**: stored as separate columns per provider so switching provider doesn't require schema migration — just back-fills the new column
- **NLQ tool-use loop**: hard cap at 5 rounds prevents runaway costs; if model hits limit without final answer, return partial with warning
- **pgvector index**: `CREATE INDEX kpi_catalog_embedding_openai_ivfflat ON "KpiCatalogEmbedding" USING ivfflat (embedding_openai vector_cosine_ops) WITH (lists = 100);` after ~10k rows
- **Visibility-aware tool calls**: critical — without this, NLQ becomes a data leak vector. Test exhaustively.
- **ML sidecar dev secret**: refuse the default `dev-ml-shared-secret` in production via `ENV=production` check
- **Recommendation JSON parsing**: AI sometimes wraps in ```json fences; strip them before JSON.parse; fallback to raw text if parse fails

## Out of scope for P5

- Onboarding AI co-pilot (P6 — uses this layer)
- Slack NLQ (P8)
- Plugin formula functions (P9 hardening)
- Real-time AI streaming over SSE (P9 stretch)

## What comes next

Once P5 is tagged complete, open `docs/superpowers/plans/P6-onboarding-v2.md`. P6 replaces the basic onboarding stub from P1 with the full sidebar-primary 3-pane experience with AI co-pilot.
