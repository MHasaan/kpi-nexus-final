# KPI Nexus Final — Design Specification

| Field | Value |
|---|---|
| **Spec ID** | 2026-05-25-kpi-nexus-final-design |
| **Status** | Approved (pending file review) |
| **Authors** | brainstorming session, 2026-05-25 |
| **Supersedes** | None — fresh design (does not inherit from `another/todo.md` blueprint) |
| **Target location** | `C:\work\FYP\khan\KPI_NEXUS_Final` |
| **Reference codebase** | `C:\work\FYP\khan\KPI_NEXUS orignal` (feature reference only) |
| **Frontend design** | Deferred to a future "Claude Design" session — design brief in §12 |

---

## 0. Executive summary

**KPI Nexus Final** is a production-grade multi-tenant SaaS for KPI definition, tracking, analytics, and action. It is a ground-up rewrite of the current single-server React/Node app, designed to scale to multiple tenants and 1M+ data points per tenant while preserving every feature of the current product and adding a substantial enterprise feature set.

**Stack** (locked):

- **Monorepo**: pnpm + Turborepo
- **Frontend**: Next.js 15 (App Router, RSC) → Vercel
- **Backend API**: NestJS 11 on Fastify → Fly.io
- **Background workers**: NestJS + BullMQ → Fly.io
- **ML sidecar**: Python FastAPI (Prophet, ARIMA, IsolationForest) → Fly.io
- **Database**: PostgreSQL 16 + TimescaleDB + pgvector, self-hosted on Fly.io with persistent volume
- **Cache + queue**: Redis 7 (Upstash managed)
- **ORM**: Prisma 6
- **Validation**: Zod
- **Auth**: JWT + refresh-token rotation, MFA TOTP, SSO (SAML/OIDC) via WorkOS
- **AI**: provider-pluggable (`packages/ai` with 4 adapters); Gemini default (free tier with key rotation), Claude/OpenAI/Ollama configurable per-org-per-feature
- **Real-time**: SSE
- **Observability**: Pino + OpenTelemetry + Sentry
- **Testing**: Vitest + Playwright + Testcontainers
- **CI**: GitHub Actions
- **Deployment**: Vercel (web) + Fly.io (api, worker, ml, postgres) + Upstash Redis; local dev via docker-compose

**Scope** (locked: **maximum** — all enterprise features):

- All current-app features at production quality
- High-value additions: KPI versioning, cascades, multi-band thresholds, tiered targets, scorecard, strategy map, NLQ chat, OKRs, tasks+comments, approval workflows, soft-delete, API keys+webhooks, public share, activity feed, global search
- Enterprise features: SSO, SCIM, custom domains, integrations (Slack/Teams/Jira), ETL connectors, plugin system, i18n, multi-dimensional org hierarchies, KPI lineage graph, embedding-powered catalog search

**Scale**: ~77 NestJS modules across 10 domains, ~70 Prisma models, 18 canonical permissions, ~18 BullMQ queues, 5 ML endpoints, 11 AI features.

**Roadmap**: 10 phases (P0–P9) over ~37 weeks solo, each shippable, each expanded into a per-phase implementation plan in a future session.

---

## 1. Goals, non-goals, principles

### 1.1 Goals

The product spans **6 capability domains**:

1. **Tenancy & Identity** — orgs, users, auth, RBAC, SSO/SCIM
2. **Org Modeling** — units, hierarchies, positions, role inheritance, multi-dimensional structures
3. **KPI Engine** — definitions, versions, formulas, cascades, targets, thresholds, data points, lineage
4. **Visualization & Reporting** — dashboards, widgets, real-time updates, scheduled reports, public share, embeds
5. **Intelligence** — anomaly detection, forecasting, NLQ chat, AI insights, recommendations, what-if simulator
6. **Collaboration & Workflow** — tasks, comments, mentions, approvals, OKRs, notifications, integrations, webhooks, plugins

### 1.2 Non-goals

- **Stripe billing integration** — billing schema is ready; Stripe wiring deferred. FYP demo tenants get free ENTERPRISE.
- **Multi-region failover** — schema is region-aware (`dataResidency` enum); we deploy single-region only.
- **Native mobile apps** — responsive web only; the public REST API exists if mobile is built later.
- **Real-time collaborative editing** (Google-Docs-style on dashboards/KPI defs) — too costly for FYP.
- **On-prem / air-gapped install** — cloud-first only.

### 1.3 Design principles

- **Defense in depth** for multi-tenancy: application filter + Prisma extension + Postgres RLS — three layers all enforced.
- **Permissions check everywhere** — every endpoint, every service method, every UI element. The frontend never trusts itself; the backend never trusts the frontend.
- **Per-user data isolation** — PER_USER-scoped KPI values are visible only to the owner, their manager, and admins. The bug from the current app (user A seeing user B's attendance) cannot recur.
- **Audit everything** — interceptor auto-logs every mutation; service-level diffs add before/after detail.
- **Idempotency at boundaries** — `Idempotency-Key` on POST/PATCH/PUT/DELETE; bulk ingest accepts per-row `idempotencyKey`.
- **Optimistic concurrency** — `version` field + ETag/If-Match on mutating endpoints for entities with concurrent-edit potential.
- **Soft-delete with restore window** — KPI, Dashboard, User support 30-day restore; hard-purge background job thereafter.
- **AI budget-capped** by default — daily $1, monthly $30 per org; circuit breaker on overage.
- **Async-first** — long work runs in BullMQ; HTTP endpoints stay fast.

---

## 2. Architecture

### 2.1 Process topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER (user)                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  apps/web — Next.js 15 App Router (RSC + Server Actions)            │
│  Deploy: Vercel (free tier)                                          │
│  Auth: httpOnly cookies, proxies API calls server-side               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST + SSE (over HTTPS)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  apps/api — NestJS 11 on Fastify                                     │
│  Deploy: Fly.io — 1+ instances                                       │
│  Owns: business logic, RBAC, validation, AI orchestration           │
└──────┬──────────┬──────────────────────────────────┬─────────────────┘
       │          │                                  │
       │          │                                  │ HTTP (HMAC-signed)
       │          │                                  ▼
       │          │       ┌─────────────────────────────────────────┐
       │          │       │  apps/ml — Python FastAPI sidecar       │
       │          │       │  Deploy: Fly.io                          │
       │          │       │  Owns: Prophet, ARIMA, IsolationForest, │
       │          │       │        statistical forecasting          │
       │          │       └─────────────────────────────────────────┘
       │          │
       ▼          ▼
┌────────────────┐      ┌────────────────────────────────────────┐
│  Postgres 16   │      │  apps/worker — NestJS BullMQ workers   │
│  + TimescaleDB │      │  Deploy: Fly.io (separate process)     │
│  + pgvector    │      │  Processes: scheduled scans, emails,   │
│  Fly.io volume │      │             AI insights, ETL, exports, │
│  Owns: ALL     │      │             retention purges, etc.     │
│  tenant data   │      └─────────────────┬──────────────────────┘
└────────┬───────┘                        │
         │                                ▼
         │                       ┌──────────────────┐
         └──────────────────────►│  Redis 7         │
                                 │  Upstash managed │
                                 │  Cache + queues  │
                                 └──────────────────┘
```

**4 long-running processes**: web, api, worker, ml. Shared Postgres + Redis. External: AI providers (Gemini/Claude/OpenAI), Resend for outbound mail, Cloudflare R2 for files.

### 2.2 Repository layout

```
kpi-nexus-final/
├── apps/
│   ├── web/         Next.js 15 — UI only, no DB access
│   ├── api/         NestJS 11 — HTTP entry, all business logic
│   ├── worker/      NestJS — BullMQ processors, same modules as api
│   └── ml/          Python FastAPI — stateless math service
├── packages/
│   ├── contracts/   Zod schemas + TS types (shared web ↔ api)
│   ├── db/          Prisma schema + migrations + client wrapper
│   ├── ai/          Provider-agnostic AI layer (4 adapters + router)
│   ├── formula/     Formula parser + evaluator (isolated-vm sandbox)
│   ├── ui/          Design tokens, theme, primitive utilities
│   └── config/      tsconfig, eslint, vitest, tailwind shared configs
├── infra/
│   ├── docker/      docker-compose for local dev
│   ├── fly/         fly.toml per service
│   └── github/      CI workflows
└── docs/
    ├── superpowers/specs/   This spec lives here
    ├── superpowers/plans/   Per-phase implementation plans
    └── adrs/                Architecture decision records
```

**Boundary rules**:
- `apps/web` never imports from `apps/api`; uses only `packages/contracts` for shared types
- `apps/api` and `apps/worker` import the same modules; worker mounts a Nest app context without HTTP

### 2.3 Code organization within NestJS

Each NestJS module is `apps/api/src/<domain>/<module>/` with:
- `*.module.ts` — Nest module definition
- `*.controller.ts` — HTTP routes with `@RequirePermissions` decorators + Zod validation pipes
- `*.service.ts` — business logic, uses `RequestContextStore.require()` for tenancy
- `*.processor.ts` — BullMQ processor (used by worker, optional)
- `*.spec.ts` — Vitest unit tests
- `*.e2e-spec.ts` — Vitest integration tests (Testcontainers)

---

## 3. Data model

~70 Prisma models across 10 domains. Multi-tenant — every tenant-scoped model carries `organizationId` (FK + index + RLS policy target). Below: model inventory by domain with key fields.

### 3.1 Domain 1 — Identity & Tenancy (10 models)

| Model | Key fields |
|---|---|
| `Organization` | `slug` (subdomain unique), `tenantStatus` (TRIAL/ACTIVE/SUSPENDED/ARCHIVED/PURGED), `dataResidency`, `complianceProfile[]`, `passwordPolicy Json`, `sizeTier`, 8 terminology overrides (`roleLabel`, `kpiLabel`, etc.), `fiscalCalendar Json`, `supported{Timezones,Currencies,Locales}[]`, `userCustomFieldDefs Json?` |
| `CustomDomain` | `domain`, `txtChallengeKey`, `txtChallengeValue`, `verifiedAt?`, `lastCheckedAt?`, `lastCheckError?` |
| `User` | `status` enum (INVITED / PENDING_VERIFICATION / ACTIVE / SUSPENDED / ARCHIVED / DELETED / PURGED), `roleId`, `managerId`, `positionId`, `mfaEnabled`, `mfaRecoveryHashes[]`, `mfaPendingSecret?`, `customFields Json`, `avatarUrl?`, `secondaryEmail?` |
| `RefreshToken` | `hashedToken` (SHA-256), `expiresAt`, `revokedAt?`, `replacedById?` (rotation chain), `deviceInfo`, `ipAddress`, `userAgent` |
| `EmailVerificationToken`, `PasswordResetToken` | `hashedToken`, `consumedAt?`, `expiresAt` |
| `Session` | `expires`, `userId` (Auth.js compatibility, optional) |
| `LoginAttempt` | `email`, `ipAddress`, `userAgent`, `status` enum, `reason?` |
| `PlatformAdmin` | `userId` (cross-tenant super-user list) |

### 3.2 Domain 2 — RBAC (5 models)

| Model | Key fields |
|---|---|
| `RoleDefinition` | `permissions[]` (PermissionKey enum), `isAdmin`, `level`, `color`, `canAccessModules[]` |
| `RoleInheritance` | `parentRoleId`, `childRoleId`, `inheritsPermissions` (multi-parent join) |
| `Position` | `name`, `track` enum (IC / MANAGEMENT / EXECUTIVE), `payGrade?` |
| `PermissionDelegation` | `grantorUserId`, `granteeUserId`, `permissions[]`, `validFrom`, `validTo`, `revokedAt?`, `reason` |
| `ResourcePermission` | `subjectType`, `subjectId`, `action`, `resourceType`, `resourceId`, `expiresAt?`, `grantedById` |

**18 canonical permissions** (locked, see §5.2 for full list).

### 3.3 Domain 3 — Org Structure (8 models)

| Model | Key fields |
|---|---|
| `OrgUnitDimension` | `name` (Functional/Geographic/Project), `isDefault` |
| `OrgUnitType` | `name`, `namePlural`, `icon`, `color`, `allowNesting`, `maxDepth`, `allowedParentTypeIds[]`, `dimensionId?` |
| `OrgUnit` | `parentUnitId?`, `headUserId?`, `status` enum (PLANNED/ACTIVE/PAUSED/ARCHIVED), `effectiveFrom?/To?`, `visibilityInherits` |
| `OrgUnitMember` | `userId`, `memberRole` enum (MEMBER/MANAGER/LEAD/DEPUTY), `leftAt?`, `leaveReason?` |
| `OrgUnitNameHistory` | `previousName`, `changedById`, `changedAt` |
| `OrgUnitKPIAssignment` | `targetValue`, `currentValue`, `status`, `inherited` (parent→child auto-prop), `lastUpdatedAt` |
| `UserKPIAssignment` | `targetValue` (per-user override), `currentValue`, `status`, `lastUpdatedAt` |

### 3.4 Domain 4 — KPI Engine (14 models)

| Model | Key fields |
|---|---|
| `KPICategory` | `name`, `color`, `icon`, `sortOrder` |
| `KPI` | `status` enum (DRAFT/PROPOSED/APPROVED/ACTIVE/PAUSED/DEPRECATED/ARCHIVED), **`scope` enum (ORG_WIDE/PER_UNIT/PER_USER)** [see §6], `type` enum, `direction` enum (HIGHER_IS_BETTER/LOWER_IS_BETTER/TARGET_IS_BEST/NEUTRAL), `frequency` enum (DAILY/.../REAL_TIME/AD_HOC), `aggregationMethod` enum (15 options), `scorecardQuadrant` enum, `unitConfig Json`, `allowFutureDataPoints`, `replacedByKpiId?`, `deletedAt?`, `version Int`, `customFields Json?` |
| `KPIVersion` | `version`, `snapshot Json`, `reason`, `createdById` |
| `KPIDependency` | `sourceKpiId`, `dependentKpiId`, `formulaRef?` |
| `FormulaExpression` | `ast Json`, `raw String`, `compiledSql String?` |
| `KPITarget` | `type` enum (STATIC/TIERED/DYNAMIC/TIME_VARYING/CONDITIONAL/SCENARIO), `min/expected/stretch/impossible`, `formula?`, `effectiveFrom/To?`, `scenarioName?`, `metadata Json` |
| `KPIThresholdBand` | `name`, `lower?`, `upper?`, `color`, `order`, `consecutivePointsRequired` (hysteresis) |
| `KPIBenchmark` | `kind` (INTERNAL_HISTORICAL/EXTERNAL_INDUSTRY/...), `value`, `periodStart/End`, `source` |
| `KPICascade` | `parentKpiId`, `childKpiId`, `weight`, `level`, `rollupMethod` enum |
| `KPIDataPoint` | **TimescaleDB hypertable**, partitioned by week. `kpiId`, `value`, `recordedAt`, `recordedById?`, **`userAssignmentId?` + `unitAssignmentId?` (scope-aware)** [see §6], `sourceType` enum, `sourceId?`, `qualityFlag` enum, `dimensions Json`, `idempotencyKey?` (unique per kpi), `isOutlier`, `notes` |
| `KPIDataPointHistory` | `previousValue`, `newValue`, `reason`, `changedById` |
| `KPIWatch` | `userId`, `kpiId`, `events[]` |
| `KPISavedView` | `name`, `filters Json`, `isShared` |
| `KPITemplate` | `industry?`, `function`, `scorecardQuadrant`, `tags[]`, `popularity`, `isGlobal` |

**TimescaleDB layer** on `KPIDataPoint`:
- Hypertable partitioned by `recordedAt` weekly chunks
- 5 continuous aggregates: hourly, daily, weekly, monthly, quarterly rollups
- Auto-refresh policy every 30 min
- Compression policy after 90 days
- Dashboard summary endpoint hits CAGG, not raw table → p95 < 100ms even at 1M rows

### 3.5 Domain 5 — Visualization (6 models)

| Model | Key fields |
|---|---|
| `Dashboard` | `name`, `ownerUserId/roleId?`, `isShared`, `layout Json`, `version` (optimistic concurrency), `deletedAt?` |
| `DashboardWidget` | `widgetType`, `config Json`, `position Json (x,y,w,h)` |
| `DashboardSnapshot` | `label?`, `payload Json`, `takenAt`, `takenById` |
| `DashboardShareLink` | `token`, `expiresAt?`, `viewCount`, `passwordHash?`, `revokedAt?` |
| `ScheduledReport` | `dashboardId?`, `kpiIds[]`, `cron`, `format`, `recipients[]`, `lastRunAt?` |
| `ReportRun` | `status`, `fileUrl?`, `error?`, `ranAt` |

### 3.6 Domain 6 — Alerting & Intelligence (12 models)

| Model | Key fields |
|---|---|
| `AlertRule` | `kpiId`, `ruleType` enum (STATIC_THRESHOLD / DYNAMIC_STDDEV / RATE_OF_CHANGE / NO_DATA / COMPOSITE), `config Json`, `severity` enum, `isActive` |
| `EscalationRule` | `alertRuleId`, `levels Json` (per-level delay + channels + notify roles/users) |
| `Alert` | `alertRuleId?`, `kpiId`, `message`, `severity`, `status` (OPEN/ACKNOWLEDGED/RESOLVED), `targetUserId?`, `meta Json` |
| `NotificationChannel` | `kind` (EMAIL/SLACK/TEAMS/SMS/IN_APP/WEBHOOK), `config Json` (encrypted credentials), `isActive` |
| `NotificationDelivery` | `alertId`, `channelId`, `status` (PENDING/SENT/FAILED/SUPPRESSED), `attempts`, `error?`, `sentAt?` |
| `AnomalyDetection` | `kpiId`, `dataPointId?`, `score`, `method`, `isConfirmed`, `detectedAt` |
| `Forecast` | `kpiId`, `horizon`, `model` (PROPHET/ARIMA/NAIVE/LSTM), `predictions Json` (yhat + 80%+95% bands), `fitMetrics Json`, `generatedAt` |
| `KPIInsight` | `kpiId`, `narrative`, `model`, `promptTokens`, `completionTokens`, `generatedAt` |
| `Recommendation` | `alertId?`, `kpiId`, `content Json` (summary + rootCauseHypotheses[] + suggestedActions[]), `confidence`, `status` |
| `NLQQuery` | `question`, `embedding_openai vector(1536)?`, `embedding_gemini vector(768)?`, `response Json`, `latencyMs`, `costUsd`, `inputTokens`, `outputTokens`, `providerKey`, `modelId` |
| `KpiCatalogEmbedding` | `kpiId`, `embedding_* vector` (per provider), `sourceText`, `providerKey`, `@@unique([kpiId, providerKey])` |
| `Workflow` | `name`, `rule Json`, `action Json`, `triggers[]`, `isActive`, `lastRanAt?` |

### 3.7 Domain 7 — Collaboration (7 models)

| Model | Key fields |
|---|---|
| `Task` | `kpiId?`, `alertId?`, `title`, `description?`, `assigneeUserId?`, `dueAt?`, `status` enum, `priority` enum, `externalRef?` |
| `Comment` | `entityType`, `entityId`, `parentCommentId?`, `body`, `mentionedUserIds[]`, `deletedAt?` |
| `Mention` | `commentId`, `mentionedUserId`, `readAt?` |
| `Objective` | `name`, `ownerUserId`, `parentObjectiveId?` (alignment graph), `periodStart/End`, `status`, `progress`, `description?` |
| `KeyResult` | `objectiveId`, `name`, `kpiId?` (auto-progress) OR manual, `baselineValue?`, `targetValue`, `currentValue?`, `weight`, `progress` |
| `ApprovalWorkflow` | `entityType` (KPI_DEFINITION/KPI_TARGET/ROLE_PERMISSIONS), `requiredApproverRoleIds[]`, `requireAll`, `isActive` |
| `ApprovalRequest` | `workflowId`, `entityId`, `requesterUserId`, `status` enum, `decisions Json`, `proposedPayload Json` |

### 3.8 Domain 8 — Integration & Extension (10 models)

| Model | Key fields |
|---|---|
| `IntegrationConnection` | `provider`, `encryptedTokens` (AES-256-GCM), `scopes[]`, `status`, `lastSyncAt?`, `lastError?`, `metadata Json` |
| `Connector` | `type` (REST/GraphQL/postgres/mysql/s3/gcs/webhook), `config Json`, `schedule?`, `isActive`, `lastRunAt?`, `lastRunStatus?` |
| `Pipeline` | `connectorId`, `steps Json`, `status`, `lastRunAt?` |
| `IngestionJob` | `kind`, `source Json`, `status`, `startedAt/finishedAt?`, `errorLog?` |
| `LineageEdge` | `(sourceType, sourceId) → (targetType, targetId)`, `transformType`, `jobRunId?` |
| `DataSnapshot` | `entityType`, `entityId`, `payload Json`, `reason?`, `takenById` |
| `ApiKey` | `hashedKey` (SHA-256), `keyPrefix` (12-char display), `scopes[]`, `lastUsedAt?`, `expiresAt?`, `revokedAt?` |
| `WebhookSubscription` | `url`, `events[]`, `secret` (HMAC), `isActive`, `failureCount`, `lastDeliveredAt?` |
| `Plugin` | `name`, `type` (WIDGET/TEMPLATE/FORMULA_FN/CONNECTOR), `version`, `entryUrl`, `isEnabled` |
| `SsoConfig` | `protocol` (SAML/OIDC), `idpEntityId`, `idpSsoUrl`, `encryptedCertificate`, `allowJitProvisioning`, `defaultRoleId` |
| `ScimToken` | `label`, `hashedToken`, `expiresAt?`, `lastUsedAt?`, `revokedAt?` |

### 3.9 Domain 9 — Onboarding (4 models)

| Model | Key fields |
|---|---|
| `OnboardingSession` | `payload Json` (draft), `status` (in_progress/completed/archived), `userId?/draftTokenHash?`, `entryMode` (quick/full/template:slug), `lastEditedStep` |
| `OnboardingAIInteraction` | `sessionId`, `mode` (generator/assistant/suggest/explain), `prompt`, `response`, `appliedSections[]`, `editedSections[]`, `tokens`, `latencyMs` |
| `OrgTemplate` | `slug`, `name`, `tier` (rich/starter/legacy), `orgType`, `payload Json`, `isBuiltin`, `isPublic` |
| `OnboardingTask` | `key`, `status`, `dueAt?`, `completedAt?`, `dismissedAt?` |

### 3.10 Domain 10 — Governance & Ops (10 models)

| Model | Key fields |
|---|---|
| `AuditLog` | `action`, `entityType?`, `entityId?`, `changes Json` (before/after diff), `userId?`, `userEmail?`, `metadata Json`, `redactedKeys[]` |
| `RetentionPolicy` | `entityType`, `days`, `isActive`, `lastRunAt?` |
| `CostMetric` | per-org per UTC-day; `kpiCount`, `dataPointsToday`, `alertsToday`, `aiInputTokens`, `aiOutputTokens`, `aiCostUsd`, `apiRequests`, `storageBytes` |
| `Plan` | `key`, `displayName`, `monthlyPriceUsd`, `annualPriceUsd`, `features[]`, `quotas Json`, `isActive`, `sortOrder` |
| `TenantQuota` | `organizationId`, `key`, `limit`, `current`, `periodStart/End` |
| `FeatureFlag` | `organizationId`, `key`, `enabled`, `rolloutPercent?` |
| `AiProvider` | `organizationId`, `key`, `displayName`, `isEnabled`, `encryptedCredentials Json?`, `supportedFeatures[]` |
| `AiFeatureConfig` | `organizationId`, `feature`, `providerId`, `model`, `fallbackProviderId?`, `fallbackModel?`, `perFeatureCapUsd?` |
| `AiCallLog` | `organizationId`, `feature`, `providerKey`, `modelId`, `inputTokens`, `outputTokens`, `costUsd`, `latencyMs`, `status`, `errorCode?`, `requestId`, `context Json?` |
| `AiBudget` | `organizationId`, `dailyCapUsd`, `monthlyCapUsd`, `circuitBreaker`, `currentDailySpend`, `currentMonthlySpend`, `dailyPeriodStart`, `monthlyPeriodStart` |

### 3.11 Cross-cutting patterns

Every tenant-scoped model has:
- `organizationId` FK + index + RLS policy
- `createdAt`, `updatedAt` (`@default(now())` + `@updatedAt`)
- Soft delete via `deletedAt` (where applicable: KPI, Dashboard) or `status=ARCHIVED` (User)
- Optimistic concurrency via `version Int @default(1)` + ETag on KPI / Dashboard / OKR / KPITarget
- Idempotency via `idempotencyKey` field where bulk-ingested (KPIDataPoint primarily)
- Versioning via parallel `*Version` snapshot model where definitions evolve (KPI primarily)
- Full audit trail via `AuditLog` interceptor

---

## 4. Module breakdown (~77 NestJS modules)

Modules live in `apps/api/src/<domain>/<module>/`. The worker app imports the same module classes. Below: module inventory by domain.

### 4.1 Identity & Tenancy (8 modules)

| Module | Owns |
|---|---|
| `AuthModule` | Login, logout, register-org, refresh-token rotation with reuse-detection, multi-org login picker, org switching, invitation accept |
| `TenancyModule` | `RequestContextStore` (ALS) + `TenancyInterceptor` + Prisma RLS GUC injection; throws on context-less queries |
| `UsersModule` | User CRUD, invitation lifecycle, MFA enrollment, profile (`/me/*`), offboarding workflow, GDPR export |
| `MfaModule` | TOTP enroll/confirm/disable; pure-Node RFC 6238; SHA-256 hashed recovery codes |
| `PasswordModule` | Reset request + confirm; 1h expiry; single-use tokens; per-org `passwordPolicy` enforcement |
| `PlatformAdminModule` | Super-admin list; impersonation with persistent banner + full audit trail |
| `OrganizationsModule` | Tenant CRUD, settings, branding, terminology, fiscal calendar, lifecycle transitions, tenant export |
| `CustomDomainModule` | DNS TXT verification flow per tenant |

### 4.2 RBAC (5 modules)

| Module | Owns |
|---|---|
| `RbacModule` | 18-permission enum, `@RequirePermissions` / `@RequireAnyPermission` / `@OwnerOverride` decorators, `PermissionsGuard`, 5-min Redis cache + in-memory fallback |
| `RolesModule` | Role CRUD, multi-parent inheritance editor, 4 permission presets (KPI Manager / Data Entry / People Manager / Auditor), role audit timeline, role matrix UI, role hierarchy SVG |
| `PositionsModule` | Job titles + industry presets (Tech / Healthcare / Finance / Retail / Non-profit) |
| `PermissionDelegationsModule` | Time-bounded "act on behalf of"; BullMQ delayed jobs auto-revoke at `validTo` |
| `ResourcePermissionsModule` | Resource-level ACL fast-path |

### 4.3 Org Structure (4 modules)

| Module | Owns |
|---|---|
| `OrgUnitDimensionsModule` | Functional/Geographic/Project axes; default Functional lazy-seeded |
| `OrgUnitTypesModule` | Typed nesting rules (`maxDepth`, `allowedParentTypeIds[]`, `dimensionId`) |
| `OrgUnitsModule` | Unit CRUD + tree, reorganization (move/merge/split/rename), member management with `memberRole`, name history, visibility inheritance |
| `OrgChartModule` | Read-side projection for SVG tree view + print stylesheet |

### 4.4 KPI Engine (13 modules)

| Module | Owns |
|---|---|
| `KpiCategoriesModule` | Taxonomy CRUD |
| `KpisModule` | Definition CRUD with version snapshots, status lifecycle, deprecation chain, soft-delete + 30-day restore, sample-data seed, bulk CSV import |
| `KpiTemplatesModule` | Curated catalog (industry × function × quadrant), relevance scoring, org-private templates, marketplace + instantiation |
| `FormulaModule` | Validate + attach/detach formula, AST↔raw round-trip, dependency-edge wiring, DAG topological sort, cycle detection; uses `packages/formula` (isolated-vm sandbox, 100ms timeout, 32MB memory) |
| `CalculationEngineModule` | BullMQ queue `calc-engine` for recompute / batch / cascade |
| `DataPointsModule` | Single + bulk insert with idempotency keys, per-KPI validation, outlier flag (Welford-stable 3σ), adjust with history; cascade trigger on insert |
| `KpiTargetsModule` | 6 target types with per-type validation + `resolveActive(kpiId, at)` |
| `KpiThresholdBandsModule` | N-band thresholds + hysteresis |
| `KpiBenchmarksModule` | Internal (auto-computed N-day average) vs External (industry); compute trigger |
| `KpiCascadesModule` | Parent↔child rollup with `weight`, `level`, `rollupMethod`; cycle detection |
| `LineageModule` | Fire-and-forget `record()`; BFS trace upstream/downstream |
| `UserKpisModule` | Per-user KPI assignments + personal data entry [see §6] |
| `OrgUnitKpisModule` | Per-unit assignments + inheritance to descendants (`inherited` boolean, `override`) |

### 4.5 Visualization & Reporting (5 modules)

| Module | Owns |
|---|---|
| `DashboardsModule` | Dashboard + widget CRUD, share rules, default-dashboard logic, optimistic concurrency via `version` + ETag, soft-delete |
| `DashboardSnapshotsModule` | Point-in-time freeze for board packs |
| `DashboardShareLinksModule` | Signed public tokens; expiry; view counter; password-optional; revoke |
| `RealtimeModule` | SSE endpoint `/realtime/stream` + ioredis pub/sub + org-filtered events |
| `ReportsModule` | CSV (Papa) + Excel (exceljs) + PDF (@react-pdf) generation; scheduled reports (BullMQ cron); board-pack composer; embeddable widget tokens |

### 4.6 Alerting & Intelligence (13 modules)

| Module | Owns |
|---|---|
| `AlertRulesModule` | Rule CRUD with 5 rule types |
| `AlertEngineModule` | BullMQ queue `alert-eval`; auto-enqueue post-data-point-insert |
| `EscalationsModule` | Delayed jobs per level; deterministic BullMQ jobId; abort-if-not-OPEN |
| `NotificationChannelsModule` | Per-org channels (6 kinds); test-send |
| `NotificationsModule` | Dispatcher + per-kind adapters + retry queue (30s → 5min → 30min) + DLQ + digest mode |
| `AnomalyDetectionModule` | Routes to ML sidecar `/anomaly/detect`; confirm-triggers-alert + confirm-triggers-recommendation |
| `ForecastsModule` | Routes to ML sidecar `/forecast`; yhat + bands |
| `WhatIfModule` | Sliders UI + ML routing |
| `KpiSuggestionsModule` | AI-suggested KPIs based on org profile |
| `AiModule` (core) | `IAiProvider` interface; 4 adapters; `AiRouter`; `AiBudgetService`; `AiCallLogService`; BYO-key flow (AES-256-GCM) |
| `NlqModule` | Embed → pgvector search → Claude tool-use (5-round max) with 5 tools; auto-reembed on KPI change |
| `InsightsModule` | Scheduled cron + on-demand + batch generation of one-paragraph KPI narratives |
| `RecommendationsModule` | Alert/anomaly-triggered + manual; structured JSON output; status flow |

### 4.7 Collaboration & Workflow (6 modules)

| Module | Owns |
|---|---|
| `TasksModule` | CRUD + kanban + KPI/alert links |
| `CommentsModule` | Threaded comments on KPI/Dashboard/Alert/Task; soft-delete; author-only edit/delete |
| `MentionsModule` | Per-recipient inbox |
| `OkrsModule` | Objectives + Key Results; KPI-linked auto-progress; weighted rollup with cycle guard (depth 10) |
| `ApprovalsModule` | Workflows + requests; `requireApprovalIfActive()` seam; apply-service replays approved patches |
| `WorkflowsModule` | Generic IF X → trigger Y rule engine |

### 4.8 Integrations & Extensions (11 modules)

| Module | Owns |
|---|---|
| `IntegrationsModule` | `IntegrationConnection` CRUD + AES-256-GCM token encryption (KMS-ready) |
| `SlackModule` | Bot, slash command `/kpi <name>`, alert posting with action buttons, NLQ from Slack |
| `TeamsModule` | Webhook + adaptive cards |
| `JiraModule` | Create issue from alert + two-way status sync to Task |
| `InboundEmailModule` | Resend/SES inbound; plus-addressing routing; HMAC verifier; quoted-reply stripping |
| `ConnectorsModule` | Pull connector registry; runtime adapters (REST + GraphQL first); BullMQ-driven repeatable jobs auto-reconcile |
| `IngestModule` | Webhook receiver authenticated by ApiKey with `kpi:data_entry` scope; 1-10k rows per call |
| `WebhooksModule` | Outbound HMAC-SHA256 signing; secret rotation |
| `ApiKeysModule` | Mint `kpinx_*` plaintext; SHA-256 hash storage; scope-gated; JwtAuthGuard short-circuit |
| `PluginsModule` | Catalog (WIDGET/TEMPLATE/FORMULA_FN/CONNECTOR); isolated-vm sandbox for formula-fn; iframe sandbox for widget |
| `SsoModule` | SAML + OIDC via WorkOS; JIT user provisioning |
| `ScimModule` | RFC 7644 `/scim/v2/*` with ApiKey + `scim:provision` scope |

### 4.9 Onboarding (4 modules)

| Module | Owns |
|---|---|
| `OnboardingModule` | 5-step wizard backend with auto-save; resumable; per-step sample data; per-step advanced expand; materialization transaction |
| `OnboardingAiModule` | 4 modes (generator / assistant / suggest / explain) gated by AIDiffPreview; audited via OnboardingAIInteraction; rate-limited per mode |
| `OrgTemplatesModule` | Tiered templates (rich SaaS-Startup / starter / legacy-preset) |
| `SetupChecklistModule` | 14-task post-onboarding checklist |

### 4.10 Governance & Ops (8 modules)

| Module | Owns |
|---|---|
| `AuditModule` | Structured events + redaction + interceptor + cross-tenant guard with `runWithBypass(reason, fn)` |
| `RetentionModule` | Per-org per-entity policies; BullMQ daily cron sweeps all orgs sequentially |
| `GdprModule` | User export (JSON envelope) + user purge (PII redaction with deterministic `former-user-<hash>` handle) |
| `BillingModule` | Plan catalog (FREE/PRO/ENTERPRISE seeded lazily); TenantQuota; FeatureFlag; cost telemetry daily aggregates |
| `RateLimitModule` | Redis ZSET sliding window; 2 buckets (auth + general); 429 with retryAfter |
| `HealthModule` | `/health` + `/health/details` (per-component latency + treats db/redis required, ml optional) |
| `SearchModule` | Global FTS across KPIs/dashboards/users/units with relevance scoring |
| `ActivityModule` | Per-user/per-org timeline from AuditLog; cursor pagination |

### 4.11 Cross-cutting middleware/interceptors (global)

| Component | Order |
|---|---|
| `JwtAuthGuard` | 1st — verifies JWT; short-circuits to `ApiKeysService.verify()` on `Bearer kpinx_*` |
| `TenantLifecycleGuard` | 2nd — blocks ARCHIVED/PURGED; reads-only for SUSPENDED |
| `RateLimitGuard` | 3rd |
| `PermissionsGuard` | 4th — checks `@RequirePermissions` decorators (see §5) |
| `TenancyInterceptor` | wraps handler in `RequestContextStore.run({...})` |
| `IdempotencyInterceptor` | caches POST/PATCH/PUT/DELETE responses 24h scoped by `(orgId, userId, key)` |
| `AuditInterceptor` | auto-logs coarse audit on every successful mutation |
| `LoggerInterceptor` | Pino structured logs with requestId/userId/orgId/latency |
| `OpenTelemetryInterceptor` | OTel spans + traces + metrics |

---

## 5. Multi-tenancy & permissions

This section consolidates two related concerns: tenant data isolation and per-user permission enforcement. Both are critical to product correctness; both must thread through every layer (backend + frontend).

### 5.1 Multi-tenancy: defense in depth

**Three enforcement layers**, all active:

| Layer | Mechanism | Enforced by |
|---|---|---|
| 1. Request context | `AsyncLocalStorage` holds `{userId, organizationId, roleId, sessionId, principalType, realOrganizationId?}` injected by `TenancyInterceptor` after JWT verification | NestJS interceptor; throws if any service tries to query without context |
| 2. Application filter | Every Prisma query explicitly includes `where: { organizationId: ctx.organizationId }` | Service convention + cross-tenant fuzzer covers every endpoint |
| 3. Postgres RLS | RLS policies on every tenant-scoped table; connection pool calls `SET app.current_org = $1` at checkout via Prisma middleware | Database itself; cannot be bypassed by app bugs |

**Principal types**: `user`, `api_key`, `system` (background workers), `platform_admin` (impersonation only — `realOrganizationId` ≠ `organizationId`).

**Legitimate cross-tenant operations** (platform-admin listing all orgs, billing sweepers, lifecycle purges) use `runWithBypass(reason, fn)` which downgrades the cross-tenant warning to INFO and tags the audit row with the bypass reason.

**Tenancy in BullMQ**: every job payload carries `organizationId`; workers wrap their processor body in `RequestContextStore.run({organizationId, principalType: "system"})` before any tenant-scoped query.

**Tenant lifecycle states**: `TenantStatus` enum on `Organization`:
```
TRIAL ──► ACTIVE ──► SUSPENDED ──► ARCHIVED ──► PURGED (terminal)
```
`TenantLifecycleGuard` (after `JwtAuthGuard`, before `PermissionsGuard`) blocks all requests for ARCHIVED/PURGED orgs and allows only reads for SUSPENDED.

**Per-tenant rate limiting**: Redis sliding window in `RateLimitGuard`:
- `/auth/*` → 10 hits/60s keyed by IP (credential-stuffing defense)
- All other authed routes → 600 hits/60s keyed by `organizationId`

### 5.2 Permissions: 18 canonical permissions

Locked enum:

| Category | Permissions |
|---|---|
| **KPIs** | `KPI_VIEW`, `KPI_CREATE`, `KPI_EDIT`, `KPI_DELETE`, `KPI_DATA_ENTRY` |
| **Dashboards** | `DASHBOARD_VIEW`, `DASHBOARD_MANAGE` |
| **Users & RBAC** | `USERS_VIEW`, `USERS_MANAGE`, `ROLES_MANAGE`, `POSITIONS_MANAGE` |
| **Org Structure** | `GROUPS_VIEW`, `GROUPS_MANAGE` |
| **Alerts** | `ALERTS_VIEW` |
| **Insights** | `REPORTS_VIEW`, `ANALYTICS_VIEW`, `INSIGHTS_VIEW` |
| **Admin** | `ORG_SETTINGS` (covers retention, billing, AI config, integrations, API keys, webhooks, SSO, SCIM, custom domain) |

**Admin bypass**: `RoleDefinition.isAdmin = true` grants everything.

### 5.3 Default seeded roles (admin can edit/clone/delete)

| Role | Sees | Can do |
|---|---|---|
| **Admin** | Everything | Everything (`isAdmin: true`) |
| **Manager** | KPIs they own + their team's PER_USER/PER_UNIT data + dashboards shared with role | Create/edit KPIs in scope, manage their team members, view all alerts |
| **Employee** | ORG_WIDE KPIs + PER_USER KPIs assigned to them + dashboards shared with all | Record own PER_USER data points, comment, complete tasks |
| **Viewer** (read-only) | Same visibility as Employee | Cannot mutate anything |

### 5.4 Backend permission resolver (layered, defense in depth)

`PermissionCacheService.resolveForUser(userId)` evaluates in this order, returns the union:

1. **`isAdmin` bypass** — short-circuits to "all permissions"
2. **`ResourcePermission`** (most-specific) — explicit grant on `(subject, action, resource)`, honors `expiresAt`
3. **Role permission** — direct from `RoleDefinition.permissions[]`
4. **Inherited role permission** — BFS up `RoleInheritance` edges where `inheritsPermissions=true`; cycle-safe via visited set; admin ancestor short-circuits
5. **`PermissionDelegation`** — active delegations only (`validFrom ≤ now ≤ validTo`, `revokedAt is null`); empty `permissions[]` means inherit ALL of grantor's
6. **Owner-override** — `@OwnerOverride({modelKey, paramName, ownerField})` decorator grants full perms to creators of their own resources

Cache: Redis 5-min TTL; in-memory fallback. Invalidated on role/delegation/resource-permission changes.

### 5.5 Visibility filtering (rows the user CAN see)

Permissions gate endpoints; visibility helpers filter rows. Every list endpoint applies the per-entity visibility helper:

- `buildKpiVisibilityWhere(ctx)` — returns a Prisma `where` fragment:
  - Admins: no filter (all KPIs in tenant)
  - Managers: `OR` of (KPIs in managed units) + (KPIs assigned to direct reports) + (ORG_WIDE)
  - Individuals: `OR` of (ORG_WIDE) + (KPIs assigned to their orgUnits) + (KPIs personally assigned)
- `buildDashboardVisibilityWhere(ctx)` — owner OR `isShared=true` OR role-shared
- `buildAlertVisibilityWhere(ctx)` — alerts on KPIs the user can view
- Similar helpers for users, tasks, comments

### 5.6 Frontend permission enforcement (mirrors backend, never trusts client)

**Route guards**:
- `<ProtectedRoute>` — requires authenticated session
- `<RequirePermission permission="KPI_CREATE">` — redirects to `/unauthorized` if missing
- `<RequireAnyPermission permissions={["KPI_VIEW", "DASHBOARD_VIEW"]}>` — for or-gated routes
- `<PermissionGuard permission="KPI_DELETE" fallback={null}>` — soft fallback (hide UI element)

**Sidebar nav** filtered by permission.

**Action buttons** wrapped in `<PermissionGuard>` — viewers see KPI list but no "New KPI" button.

**Inline disabled states** with tooltips on insufficient perms.

**Auth context** holds resolved permission array; refreshed on login + on `refreshPermissions()` + 5-min interval + tab focus. 401 on any API call → logout.

### 5.7 Module-by-module permission map

| Module | Permission checks |
|---|---|
| `KpisModule` | List → `KPI_VIEW` + visibility filter; Create → `KPI_CREATE`; Edit → `KPI_EDIT` + owner-override; Delete → `KPI_DELETE`; data entry varies by scope (see §6) |
| `DashboardsModule` | List → `DASHBOARD_VIEW` + share-rule filter; Create/Edit/Delete → `DASHBOARD_MANAGE` or owner-override |
| `UsersModule` | List → `USERS_VIEW`; Create/Edit/Archive → `USERS_MANAGE`; `/me/*` always accessible to self |
| `RolesModule` | List → all authenticated; Create/Edit/Delete → `ROLES_MANAGE`; preset apply → `ROLES_MANAGE` |
| `AlertsModule` | List → `ALERTS_VIEW` + visibility (viewer sees only alerts on KPIs they can view); Ack → `ALERTS_VIEW` |
| `OrgUnitsModule` | View → `GROUPS_VIEW`; Manage → `GROUPS_MANAGE`; reorganize → `GROUPS_MANAGE` |
| `SettingsModule` (all under `/settings/*`) | All endpoints → `ORG_SETTINGS` |
| `OkrsModule` | View → `KPI_VIEW`; Create/Edit → KPI owner OR `KPI_CREATE` |
| `TasksModule` | View → all authenticated (own + assigned); Create/Edit → assignee, creator, or `USERS_MANAGE` |
| `CommentsModule` | Read → entity visibility; Write → entity visibility + author-only edit/delete |
| `ApprovalsModule` | Decide → if user's role is in `requiredApproverRoleIds[]`; Cancel → requester only |
| `IntegrationsModule`, `ConnectorsModule`, `WebhooksModule`, `ApiKeysModule`, `PluginsModule` | All → `ORG_SETTINGS` |

### 5.8 Permission delegation (act-on-behalf-of)

A manager grants a colleague time-bounded delegation: `PermissionDelegation(grantorUserId, granteeUserId, permissions[], validFrom, validTo, reason)`. When the grantee logs in, an amber banner shows "Acting on behalf of …" and `PermissionsGuard` layers grantor permissions onto grantee during the window. BullMQ delayed job auto-revokes at `validTo`. Actions are audit-logged with both `userId: grantee` and `metadata: {delegatedBy: grantor}`.

### 5.9 Resource-level override (granting a specific resource to a specific user)

`ResourcePermission(subjectType, subjectId, action, resourceType, resourceId, expiresAt?)` allows admins to grant access to a single resource (e.g., "Sarah can view ONLY the Q3 Sales Pipeline KPI") without changing her role. `PermissionsGuard` checks resource-level grants before role-level — most specific wins.

---

## 6. KPI scope model (per-user, per-unit, org-wide)

**A first-class concept**, not a feature flag. Every KPI carries a `scope` enum that determines where its values are stored, who can record them, and who can see them.

### 6.1 Three scopes

```
ORG_WIDE   — one shared org value
             Example: "Company MRR", "Org-wide NPS"

PER_UNIT   — one value per team/department/pod
             Example: "Engineering Deployment Frequency", "Sales North Quota Attainment"

PER_USER   — one value per assigned user
             Example: "Attendance Rate", "Tickets Closed", "Training Completion", "Individual Sales Goal"
```

### 6.2 Data isolation invariants

| Scope | `KPIDataPoint` storage | Endpoint to record |
|---|---|---|
| ORG_WIDE | `userAssignmentId IS NULL AND unitAssignmentId IS NULL` | `POST /kpis/:id/data` — returns **422 with the correct endpoint name** if scope ≠ ORG_WIDE |
| PER_UNIT | `unitAssignmentId IS NOT NULL` | `POST /org-units/kpi-assignments/:id/data` |
| PER_USER | `userAssignmentId IS NOT NULL` | `POST /user-kpis/my-kpis/:assignmentId/data` |

**Critical correctness invariants** maintained across `KpisService` and `UserKpisService`:

1. **Non-admin visibility derives from scope + assignment.** No "no owner = visible to all" fallback. An unassigned PER_USER KPI is visible only to admins.
2. **Global write endpoint rejects non-ORG_WIDE writes** with HTTP 422 — the error message names the correct endpoint to use.
3. **Dashboard "current value" reads** come from `UserKPIAssignment.currentValue` (maintained by `recordUserKPIData`), never from `kpi.dataPoints[0]` (the global stream).
4. **Scope changes blocked** when data points exist: `updateKPI` returns HTTP 409 if `scope` is changed while data points exist (would orphan history).

### 6.3 Visibility rules (enforced in `buildKpiVisibilityWhere`)

| Role | Sees |
|---|---|
| **Admin** | All values across all scopes |
| **Manager** | ORG_WIDE + PER_UNIT for managed units + PER_USER for direct reports |
| **Individual** | ORG_WIDE + PER_UNIT for units they're a member of + **PER_USER only for themselves** |

### 6.4 Aggregation up the cascade

PER_USER values roll up to PER_UNIT values, which roll up to ORG_WIDE — via `KPICascade` with `rollupMethod`:

```
"Org-wide Attendance" (ORG_WIDE)
        ↑ AVG
"Engineering Team Attendance" (PER_UNIT)
        ↑ AVG
"John's Attendance" + "Sarah's Attendance" + ... (PER_USER)
```

### 6.5 Frontend behavior by page

| Page | PER_USER-aware behavior |
|---|---|
| `/` (Home) | "My KPIs" panel lists PER_USER KPIs assigned to me with inline value entry |
| `/kpis` | Catalog filter includes scope facet; PER_USER KPIs visible only if I'm admin or have at least one assignment |
| `/kpis/[id]` | If scope=PER_USER and I'm not admin, I see ONLY my own data; form posts to `/user-kpis/my-kpis/:id/data` |
| `/team` (manager view) | Direct reports' PER_USER KPI grid side-by-side |
| `/users/[id]` | Per-user KPI panel showing assignments + current values + trends |
| Dashboards | KPI widget with PER_USER source respects viewer's permissions — admin sees aggregate, individual sees own line |

### 6.6 Test coverage (P1 + P2 exit criteria)

- 12-case unit test (3 scopes × 4 default roles) for `buildKpiVisibilityWhere`
- Endpoint test: `POST /kpis/:id/data` with PER_USER KPI returns 422 with correct error message naming `/user-kpis/my-kpis/:assignmentId/data`
- Cross-user isolation test: user A creates PER_USER data point, user B cannot see it via any endpoint
- Cascade rollup correctness: 3 users with attendance values → team average correct → org average correct

---

## 7. AI & ML architecture

### 7.1 Provider abstraction (`packages/ai`)

`IAiProvider` interface with 4 adapters:

| Adapter | Notes |
|---|---|
| **ClaudeProvider** | Anthropic Messages API; `cache_control: ephemeral` on system prompt; beta headers for prompt caching + 1M context; SSE streaming |
| **GeminiProvider** | `:generateContent` + `:streamGenerateContent`; functionCall ↔ NormalizedToolCall; 8-key rotation with cooldown |
| **OpenAiProvider** | Chat completions + tools + embeddings; primary for text-embedding-3-small |
| **OllamaProvider** | Local `/api/chat` + `/api/embeddings`; cost = $0 |

All adapters compile against shared types in `packages/contracts/src/ai.ts`: `AiCompletionRequest`, `AiCompletionResult`, `AiStreamChunk`, `NormalizedTool`, `NormalizedToolCall`.

### 7.2 AiRouter (`apps/api/src/ai/ai-router.service.ts`)

Resolves `(orgId, feature) → (providerId, model)` from `AiFeatureConfig`; falls back to `DEFAULT_FYP_CONFIG`.

**11 features**: `ONBOARDING_GENERATOR`, `ONBOARDING_ASSISTANT`, `ONBOARDING_SUGGEST`, `ONBOARDING_EXPLAIN`, `KPI_SUGGESTIONS`, `NLQ_PRIMARY`, `NLQ_TOOLS`, `INSIGHTS`, `RECOMMENDATIONS`, `ANOMALY_EXPLANATIONS`, `EMBEDDINGS`.

**Default FYP config** (Gemini-first per user preference):

| Feature | Primary | Fallback |
|---|---|---|
| All onboarding modes | gemini-2.5-flash | gemini-2.5-flash-lite |
| KPI_SUGGESTIONS, NLQ_*, INSIGHTS, RECOMMENDATIONS | gemini-2.5-flash | claude-haiku-4-5 |
| EMBEDDINGS | openai-text-embedding-3-small | gemini-text-embedding-004 |

### 7.3 Fallback + budget gating chain

```
1. Resolve config (AiFeatureConfig or DEFAULT_FYP_CONFIG)
2. Pre-flight: AiBudget.assertBudget(estimatedCost) — throws AiBudgetExceededError on overage
3. Try primary; on success: AiBudget.debit(actualCost) + AiCallLog.record(...)
4. On retryable error (429, 5xx, network): try fallback
5. On BUDGET_EXCEEDED in FALLBACK circuit mode: try fallback
6. Else throw AiProviderUnavailableError({attempted: [...]})
```

### 7.4 AiBudget — per-org caps

Redis-backed counters with DB persistence:
- `ai_budget:{orgId}:daily:{yyyymmdd}` and `:monthly:{yyyymm}`
- Lazy rollover on read
- Circuit breaker per org: `FAIL_CLOSED` or `FALLBACK`
- Default caps: daily $1, monthly $30 (per locked decision)
- `getSpendSnapshot()` powers the AI Settings dashboard

### 7.5 AiCallLog — every call recorded

Row per call: `{organizationId, feature, providerKey, modelId, inputTokens, outputTokens, costUsd, latencyMs, status, errorCode?, requestId, context Json?}`. Indexes for org+createdAt, org+feature+createdAt, requestId. Powers Settings dashboard + Cost Telemetry daily aggregates.

### 7.6 Prompt caching

- **Claude**: `cache_control: ephemeral` on stable system prompts and KPI catalogs (5-min TTL)
- **OpenAI**: automatic caching for prompts ≥1024 tokens; surface `cached_tokens`
- **Gemini**: minimize repeat context across calls

### 7.7 BYO-key flow

Per-org admin can paste their own provider keys:
- AES-256-GCM encryption with `BYO_ENCRYPTION_KEY` (hex/base64/passphrase)
- Envelope carries `kmsKeyId` for rotation detection
- Validate format (regex) + live ping (5s timeout, soft failure) + encrypt + persist + invalidate cache
- Endpoints `GET/POST/DELETE /ai/providers/byok` gated by `ORG_SETTINGS`

### 7.8 Embeddings strategy

Per-provider dimension columns on `KpiCatalogEmbedding` and `NLQQuery` (pgvector):
- `embedding_openai vector(1536)?`
- `embedding_gemini vector(768)?`
- `embedding_voyage vector(1024)?`

`@@unique([kpiId, providerKey])` for re-embed idempotency.

**Auto-reembed**: `KpisModule` schedules `reembedKpi` fire-and-forget when name/description/tags/unit change.

**Provider-switch reembed**: `AiConfigsService.upsertConfig` detects embedding-provider change → `ReembedProducer.enqueueReembedOrg` with deterministic jobId (coalesces simultaneous flips).

### 7.9 NLQ architecture

`POST /nlq/ask {question}`:
1. EMBED question
2. pgvector cosine search `KpiCatalogEmbedding` LIMIT 20
3. Claude tool-use loop (max 5 rounds) with 5 tools: `query_timeseries`, `compare_kpis`, `get_metadata`, `forecast_kpi`, `get_kpi_history`
4. Extract final answer + optional chartSpec
5. Persist `NLQQuery`
6. Return `{answer, chartSpec?, sources, latencyMs, costUsd}`

**Visibility-aware**: tools internally apply `buildKpiVisibilityWhere(ctx)` so a viewer asking "What's my team's MRR?" sees only what they're allowed to see — never leaks PER_USER data they don't own.

### 7.10 Insights architecture

**Scheduled**: BullMQ cron `30 2 * * *` UTC computes window stats for top-N KPIs with significant change; prompts Claude haiku; persists `KPIInsight`.

**On-demand**: `POST /insights/generate {kpiId}` for single; `POST /insights/generate-batch {threshold}` for org-wide ranked top-N.

### 7.11 Recommendations architecture

**Auto-trigger** on alert + anomaly confirm. Pipeline:
1. Pull KPI definition + recent points (30 days) + dependencies + recent anomalies + optional alert context
2. Prompt Claude opus with strict JSON schema
3. Parse `{summary, rootCauseHypotheses[], suggestedActions[], confidence}`
4. Persist `Recommendation` with status PENDING
5. User flips status via `PATCH /recommendations/:id/status`

### 7.12 Onboarding AI (4 modes, AIDiffPreview-gated)

Every output goes through diff preview UI — never auto-applies. Audited via `OnboardingAIInteraction`.

| Mode | Trigger | Output |
|---|---|---|
| `generator` | "Tell me about your company" | Full org JSON (roles + units + KPIs + categories) |
| `assistant` | "Add a Finance role" | Targeted RFC 6902 patch to current draft |
| `suggest` | Field "?" button | List of suggested values |
| `explain` | Field "Help" button | Prose explanation |

Rate-limited per mode: generator 5/hr, assistant 30/hr, suggest 60/hr, explain 100/hr per session.

### 7.13 ML sidecar (`apps/ml`)

Stateless Python FastAPI. No DB access. Data passed in by API.

| Endpoint | Library | Returns |
|---|---|---|
| `POST /anomaly/detect` | IsolationForest + Z-score + EWMA ensemble | Scored hits per detector |
| `POST /forecast` | Prophet → ARIMA → naive | yhat + 80%/95% bands + fit metrics |
| `POST /whatif` | Parameterized simulator | Baseline vs scenario; additive/multiplicative + clamps |
| `POST /correlation` | scipy.stats | Pairwise + matrix |
| `POST /seasonality` | statsmodels.tsa.seasonal_decompose | Trend + seasonal + residual |

**HMAC auth** api↔ml: `X-Tenant-Id` + `X-Signature-Timestamp` + `X-Signature` (HMAC-SHA256 of `${ts}.${orgId}`); constant-time verify; 5-min skew window; refuses placeholder dev secret in production.

**Failure handling**: ML treated as optional health-wise. If down → graceful HTTP 503; alert engine continues without enriched explanations.

### 7.14 Cost control defense in depth

1. Per-call `priceCall()` pre-flight check
2. Per-org daily cap ($1)
3. Per-org monthly cap ($30)
4. Per-feature optional sub-cap
5. Per-tenant-quota `ai.spend.daily.usd` from plan
6. Prompt caching (Claude ephemeral, OpenAI auto)
7. Cheaper fallback (Haiku ↔ Opus, flash-lite ↔ flash)
8. `AI_MOCK_RESPONSE` env var for e2e tests + local dev

---

## 8. Real-time & background jobs

### 8.1 Real-time via SSE

Single endpoint `GET /realtime/stream` (authenticated). Server-Sent Events with ioredis pub/sub on pattern `realtime:{orgId}:*`. Any service publishes via `realtimeService.publish(orgId, {type, payload})`. Client subscribes with `EventSource('/api/realtime/stream')` and filters via query params (`?dashboardId=&kpiId=`).

**Events catalog** (`packages/contracts/src/realtime.ts`): `data_point_added`, `alert_triggered`, `alert_escalated`, `alert_digest`, `dashboard_widget_added`, `recommendation_ready`, `nlq_response_ready`, `comment_added`, `mention_received`, `task_assigned`, +others.

**Webhook fan-out**: `publish()` also fans out to active `WebhookSubscription` rows matching the event. HMAC-SHA256(secret, `{ts}.{body}`) with `X-KpiNexus-Signature` + `X-KpiNexus-Timestamp` headers; 5-min replay window.

### 8.2 BullMQ queue inventory (~18 queues)

All processors live in `apps/worker/`.

| Queue | Producer | Purpose |
|---|---|---|
| `calc-engine` | DataPointsService, OrgUnitsService | Recompute/batch/cascade jobs |
| `alert-eval` | DataPointsService | Evaluate active alert rules |
| `escalation` | AlertEngineProcessor | Delayed fire per escalation level |
| `notification-dispatch` | AlertEngineProcessor | Send via channel adapter |
| `notification-retry` | NotificationProcessor on FAILED | Exponential backoff retry |
| `notification-digest` | EscalationProcessor | 60s alert collation per user |
| `connector-run` | ConnectorSchedulerService | Pull from external source per cron |
| `scheduled-report` | ScheduledReportService | Generate + deliver |
| `nlq-reembed` | AiConfigsService, KpisService | Chunked re-embed |
| `permission-delegation` | PermissionDelegationsService | Auto-revoke at validTo |
| `retention` | RetentionProducer (daily) | Sweep + purge per RetentionPolicy |
| `cost-telemetry` | CostTelemetryProducer (daily) | Aggregate per-org daily resource use |
| `insights` | InsightsService (daily) | Generate AI narratives |
| `setup-checklist-reminder` | SetupChecklistService | Weekly nag if incomplete |
| `tenant-lifecycle` | OrganizationsService | Revoke sessions + redact PII on transition |
| `purge-soft-deleted` | RetentionProducer (daily) | Hard-delete after 30-day window |
| `inbound-email` | InboundEmailService | Parse + persist comment |
| `outbound-webhook` | RealtimeService.publish | HMAC-sign + POST + retry on 5xx |

**Retry defaults**: 3 attempts, exponential backoff (1s × 2^attempt, max 30s). Overridden per queue (notification retry: 30s/5min/30min; outbound webhook: 5 attempts; connector: 3). DLQ exposed via operator endpoints.

**Tenant context**: every producer pulls `organizationId` from `RequestContextStore.require()` and stamps into job payload. Processors wrap handler body in `RequestContextStore.run({organizationId, principalType: "system"})`.

---

## 9. Observability, testing, error handling

### 9.1 Logging — Pino

Structured JSON. Every log includes `requestId, userId, organizationId, latency`. PII redaction via Pino redact paths. Sample 1% of routine GETs; always log mutations + errors at INFO+.

### 9.2 Tracing — OpenTelemetry

NestJS controller + Prisma query + Redis + outbound HTTP auto-instrumented. Custom spans wrap BullMQ producer→processor handoffs (carries `traceparent` in payload). OTLP export → Jaeger locally; Honeycomb / Grafana Cloud free tier / Tempo in prod.

### 9.3 Metrics — OpenTelemetry

- HTTP request rate + p50/p95/p99 per route
- BullMQ queue depth + processing time per queue
- Prisma query duration histogram
- AI provider call count + cost + latency + cache-hit-rate per provider+model
- KPI data point ingest rate per org
- Active SSE subscriptions per org

### 9.4 Error tracking — Sentry

api + web + worker SDKs. Auto-captures unhandled exceptions; manual capture for known-rare paths with `tags: {orgId, feature}`. PII scrubbing enabled. Source maps uploaded on CI build.

### 9.5 Health & status

`/health` (200 if DB + Redis reachable) + `/health/details` (per-component latency + version, db/redis required, ml optional). Public so external uptime monitors can hit without auth. Status page at `/status` (also `status.kpinexus.app` via custom domain).

### 9.6 Testing strategy

| Layer | Tool | Target |
|---|---|---|
| Unit | Vitest | ≥85% coverage on `apps/api/src/`, 100% on `packages/formula`, `packages/ai`, `packages/contracts` |
| Integration | Vitest + Testcontainers | Real Postgres + Redis per test file; full request → DB → response cycle |
| Cross-tenant fuzz | Vitest parameterized | Every endpoint × every verb proves org A cannot read/mutate org B |
| e2e | Playwright | One spec per use case UC-01..UC-11; full happy-path spec |
| Perf | Vitest bench + k6 | Hypertable bench (CAGG vs raw), k6 100 RPS p95 < 800ms |
| Security | gitleaks + CodeQL + npm audit | Every commit + PR |
| A11y | axe-core via @axe-core/playwright | Zero violations on top 10 pages |

### 9.7 Error handling & API conventions

Response envelope:
```ts
// Success
{ data: T }
// Error
{ error: { code: 'KPI_NOT_FOUND' | ..., message: string, details?: object, requestId: string } }
```

HTTP semantics: 200/201 happy, 202 accepted (approval/async), 400 Zod validation, 401 auth missing, 402 budget exceeded, 403 permission denied, 404 not found OR cross-tenant blocked (same response to avoid leak), 409 optimistic concurrency or state conflict, 422 semantic validation (e.g., posting to ORG_WIDE endpoint for PER_USER KPI), 429 rate limit (with `retryAfter`), 500 unexpected, 503 ML sidecar down.

Idempotency: `Idempotency-Key` header (8-128 chars, ASCII-safe) caches body for 24h scoped by `(orgId, userId, key)`; errors NOT cached.

Optimistic concurrency: ETag on GET, If-Match required on PATCH for KPI / Dashboard / OKR / KPITarget; mismatch → 409 with current ETag.

API versioning: URL prefix `/api/v1/`. Breaking changes → `/api/v2/`; v1 maintained 6 months minimum after v2.

OpenAPI: auto-generated from NestJS + Zod via `nestjs-zod`; spec at `/api/v1/openapi.json`. Spectral lint on CI. TypeScript SDK auto-gen into `packages/sdk/`.

---

## 10. Local dev & deployment

### 10.1 Local dev

`docker-compose.yml`:
- `postgres-16` + TimescaleDB + pgvector
- `redis-7`
- `minio` (S3-compatible, replaces Cloudflare R2 locally)
- `mailhog` (catches mail, web UI :8025)
- `jaeger-all-in-one` (OTel traces, :16686)

`pnpm dev` → `turbo dev` → starts web + api + worker + ml concurrently with hot reload.
`pnpm db:setup` → migrations + seed.
`pnpm db:studio` → Prisma Studio.

Env via `.env` files per app; `packages/config/env.ts` exports typed env getters with Zod validation at startup.

### 10.2 Deployment

| Service | Host | Notes |
|---|---|---|
| `apps/web` | Vercel (free tier) | Next.js native; instant deploys; automatic preview URLs per PR |
| `apps/api` | Fly.io | 256 MB instance + autoscale to 2 on load |
| `apps/worker` | Fly.io | Separate process; same image as api with `WORKER=true` env |
| `apps/ml` | Fly.io | Python image; 512 MB instance |
| Postgres + TimescaleDB | Fly.io with persistent volume | Self-hosted; 3 GB volume free tier |
| Redis | Upstash | Managed; 10k commands/day free tier |
| File storage | Cloudflare R2 | 10 GB free storage, generous egress |
| Email | Resend | 3k/month free tier |
| AI providers | External APIs | Gemini free tier (key rotation); Claude/OpenAI/Ollama BYO |

### 10.3 CI/CD

GitHub Actions (`.github/workflows/`):
- `ci.yml` — matrix lint + typecheck + unit-test + build per app/package; parallel via Turbo remote cache
- `e2e.yml` — docker-compose up → migrate → seed → Playwright suite
- `cross-tenant-fuzz.yml` — parameterized harness, every PR
- `security.yml` — gitleaks + CodeQL + npm audit
- `lighthouse.yml` — lighthouse-ci against preview deploy
- `release.yml` — on push to main, deploy web to Vercel + api/worker/ml to Fly.io

Migrations: `prisma migrate deploy` on every deploy (never on app boot). Backward-compatible discipline (add nullable → backfill → make NOT NULL in next migration; rename via dual-write across 3 releases).

Feature flags: per-org `FeatureFlag` for gating in-progress features; default OFF; admin UI to flip per tenant.

---

## 11. Phased delivery plan

10 phases (P0–P9), each shippable. Each phase will be expanded into its own detailed implementation plan in a future session via `writing-plans` skill, then executed via `executing-plans` or `subagent-driven-development`.

| Phase | Goal | Effort | Cumulative |
|---|---|---|---|
| **P0** | Foundation (scaffold all apps, CI green, docker-compose up) | 2 wk | 2 wk |
| **P1** | Identity + tenancy + 18-permission RBAC + basic onboarding stub | 4 wk | 6 wk |
| **P2** | KPI engine + data layer (formulas, cascades, targets, thresholds, TimescaleDB hypertable + CAGGs) | 5 wk | 11 wk |
| **P3** | Visualization + reporting (dashboards, widgets, real-time SSE, scheduled reports, public share, embeds) | 4 wk | 15 wk |
| **P4** | Alerting (rules + escalation + multi-channel notifications + dedup + digest + DLQ) | 3 wk | 18 wk |
| **P5** | AI layer (multi-provider abstraction + budget + NLQ + insights + recommendations + ML sidecar) | 5 wk | 23 wk |
| **P6** | Onboarding 2.0 with AI co-pilot (sidebar-primary 3-pane + drafts + templates + 4 AI modes + setup checklist) | 3 wk | 26 wk |
| **P7** | Collaboration + workflow (tasks + comments + mentions + OKRs + approvals + generic rule engine) | 4 wk | 30 wk |
| **P8** | Integrations + extensibility (Slack/Teams/Jira + connectors + inbound email + webhooks + API keys + plugins) | 4 wk | 34 wk |
| **P9** | Polish (SSO/SCIM + custom domains + i18n + global search + activity feed + a11y enforcement + perf budgets + OpenAPI clean) | 3 wk | 37 wk |

**Always-on across all phases**:
- CI green on every commit
- Cross-tenant fuzz extended with each new endpoint
- Per-phase exit criteria block phase advancement
- Architectural decision changes update this spec; breaking deviations add an ADR

**Exit criteria** per phase are documented inline in §6 of the brainstorming transcript and will be re-stated in each per-phase implementation plan. Key gates:

- **P1 exit**: cross-tenant fuzz green, e2e UC-01/02/11 pass, full happy-path register→wizard→invite→gating→audit visible, multi-parent role hierarchy correct, MFA TOTP works, refresh-token reuse-detection works, Postgres RLS enforced
- **P2 exit**: dashboard summary <100ms p95 at 1000 KPIs × 365 days, formula evaluator passes 50+ tests inc. sandbox escapes, cascade rollup correct, e2e UC-03/04 pass, **scope isolation: PER_USER posted via wrong endpoint returns 422**, **cross-user isolation test passes** (user A cannot see user B's PER_USER values)
- **P3 exit**: 12-widget dashboard <3s p95, SSE <500ms across 2 tabs, scheduled report emails within 30s, Lighthouse ≥90 on dashboard
- **P4 exit**: alert latency <10s p95, escalation level fires after delay, retry survives 5xx, digest mode collates 5 alerts in 60s
- **P5 exit**: Claude spend <$1/day default verified, provider failover works, NLQ 18/20 golden questions correct, anomaly F1 ≥0.7, forecast MAPE ≤15% at 90-day, e2e UC-06/07/08 pass
- **P6 exit**: admin can reproduce full seed.ts demo org in one onboarding session, AI generator returns reasonable org JSON in <30s, draft survives browser crash
- **P7 exit**: OKR objective with mixed KR types aggregates correctly, KPI update with approval workflow throws 202 → approver approves → patch replays, @mention creates Mention row in same transaction
- **P8 exit**: Slack alert with action buttons → ack syncs back, Jira issue round-trip, REST connector pulls daily for a week, inbound email → comment on KPI, API key with `kpi:data_entry` scope can `POST /ingest` but not `POST /kpis`
- **P9 exit**: SAML round-trip with Okta dev tenant, SCIM Okta provisions user → INVITED → admin completes → ACTIVE, axe-core zero violations on top 10 pages, k6 100 RPS p95 <800ms, Lighthouse ≥90 all top routes, GDPR export <30s, OpenAPI Spectral clean

**MVP cut points** (if you need to ship earlier):
- After P5 + P6: full functional product with AI, dashboards, alerts, onboarding
- After P3 + P4: solid SaaS without AI
- P9 fully cuttable except a11y enforcement

---

## 12. Frontend design brief (for future "Claude Design" session)

The backend + API contracts (§1–11) constrain *what data exists*; this section constrains *how it should look and feel*.

### 12.1 Design philosophy

**Modern minimal SaaS aesthetic** — Linear / Vercel / Notion / Stripe Dashboard class.
- Data-dense without cramped — KPI lists, tables, dashboards routinely show 10–100 items
- Calm by default, opinionated when it matters — neutral palette 90% of the time
- Fast-feeling — skeleton states, optimistic UI, subtle motion (≤200ms, ease-out), no spinners <300ms
- Keyboard-first — every action has a shortcut; ⌘K command palette lists everything
- Trust signals everywhere — audit timestamps, "last updated by X", AI confidence indicators

### 12.2 Brand identity

- **Name**: KPI Nexus
- **Tagline candidates**: "Measure what matters" / "From numbers to action" / "Your KPIs, organized"
- **Logo**: TBD — suggested simple wordmark + hexagonal-grid/network-node abstract mark
- **Voice**: clear, direct, expert-but-friendly. No marketing fluff.

### 12.3 Color system

HSL-based design tokens in CSS variables (`packages/ui/src/tokens.css`), wired into Tailwind. Semantic palette (token names stable, values retunable):

```
--surface-bg, --surface-1, --surface-2, --surface-hover, --surface-pressed
--content-strong (90%), --content-default (75%), --content-muted (55%), --content-disabled (40%)
--border-default, --border-strong, --border-divider
--accent-primary (brand, CTAs — suggested indigo/violet), --accent-secondary
--status-success (green family), --status-warning (amber), --status-critical (red), --status-info (blue), --status-neutral (gray)
--chart-1 ... --chart-12 (categorical, colorblind-safe, AA contrast)
```

Dark mode: every token has a dark-mode value. Tailwind `class` strategy. Persisted to localStorage + `prefers-color-scheme` detection.

Discipline: status colors ONLY for status. Never communicate state with color alone (always icon/text pair).

### 12.4 Typography

- Sans: Inter or Geist
- Mono: JetBrains Mono or Geist Mono
- Modular scale (1.25): text-xs (12) → text-4xl (36)
- Tabular numerals on all numbers
- Tight line-height on headings (1.2), normal on body (1.5)

### 12.5 Spacing & layout

- 8px base grid (4px allowed for tight inline)
- Page max-width `max-w-7xl` (1280px); full-width for dashboards/tables
- Sidebar 256px expanded / 64px collapsed; mobile sheet drawer < 768px
- User-toggleable comfortable vs compact density modes
- Card pattern: `rounded-lg` (8px), subtle border + shadow (never both heavy)

### 12.6 Component inventory

Build via **shadcn/ui + Radix primitives** wrapped with our tokens. Customize, don't copy.

**Primitives**: Button (5 variants × 4 sizes), Input/Textarea/Select/Combobox/DatePicker/DateRangePicker, Checkbox/Radio/Switch/Slider, Label/FormField, Card+sub, Badge, Avatar, Tooltip/Popover/DropdownMenu/ContextMenu, Dialog/Sheet/Drawer/AlertDialog, Tabs/Accordion/Collapsible, Toast (Sonner), Skeleton, Progress, Separator, ScrollArea, Breadcrumb, Pagination, Command (⌘K).

**Composite**: DataTable (TanStack), Form (react-hook-form + Zod), KpiCard, StatTile, SparklineChart, MetricChart, Stepper, PermissionMatrix, TreeView, KanbanBoard, CommentThread, CommentComposer, DiffPreview, EmptyState, ErrorBoundary fallback, AsyncBoundary.

**Charts** (`packages/ui/charts/` Recharts wrappers): LineChart, BarChart, AreaChart, PieChart, GaugeChart, ScatterChart, RadarChart, HeatmapChart. All theme-aware, ARIA-described, keyboard-navigable, exportable. Forecast variant (yhat + bands). Anomaly variant (markers + tooltips).

**App shell**: AppSidebar (nav, permission-filtered, org switcher, impersonation banner, user menu), AppHeader (page title, breadcrumb, search, alerts bell, theme toggle, ⌘K), CommandPalette (fuzzy search global), NotificationCenter.

### 12.7 Page-by-page intent

Auth (no app shell): `/login`, `/register`, `/auth/password/reset`, `/auth/accept-invitation/[token]`, `/auth/mfa-required`, `/unauthorized`, `/signup/wizard` (onboarding, P6).

App shell:
- `/` — role-adaptive home (admin: org health + checklist + activity; manager: team perf; individual: My KPIs + Tasks + Mentions)
- `/kpis` (+ many subroutes for builder/detail/formula/cascade/targets/thresholds/benchmarks/anomalies/forecast/whatif/lineage/embed/import/tree/scorecard/templates/archive)
- `/dashboards` (+ subroutes for builder, share, snapshots, drill-down, edit)
- `/strategy-map` — BSC SVG
- `/alerts` (+ rule builder, channel config, detail page)
- `/insights`, `/recommendations`, `/ask` (NLQ chat)
- `/reports` (+ new, detail, board-pack)
- `/tasks` (kanban)
- `/okrs` (+ new, detail)
- `/approvals` (+ workflows config)
- `/users` (+ detail page)
- `/me` (+ mentions, sessions, preferences)
- `/roles` (+ new, detail, audit, matrix, hierarchy, presets)
- `/positions` (+ presets)
- `/org-units` (+ chart, dimensions, reorganize)
- `/integrations`, `/connectors`
- `/settings` (tabbed: org/branding/custom-domain/locale/fiscal/terminology/password/ai/notifications/retention/api-keys/webhooks/billing/plugins/integrations/audit/security/sso)
- `/admin` (platform admin only)
- `/status`, `/audit`, `/activity`, `/help`, `/search` (or ⌘K)
- `/share/[token]`, `/embed/kpi/[token]` (public, no app shell)

### 12.8 Permission & visibility patterns (FE contract)

Required component conventions:
- `<ProtectedRoute>` — wraps every authenticated route
- `<RequirePermission permission="X">` — hard guard, redirects to /unauthorized
- `<RequireAnyPermission permissions={["X","Y"]}>` — or-guard
- `<PermissionGuard permission="X" fallback={null}>` — soft guard, hides element
- Sidebar nav items filtered by permission
- Action buttons wrapped in PermissionGuard
- Disabled state with tooltip explaining missing perm
- Visibility filter mirrors backend: list pages show only what user can see (no client-side filtering on data they shouldn't have received)

### 12.9 PER_USER KPI patterns (FE contract)

- KPI detail page detects `scope=PER_USER` + non-admin viewer → shows ONLY own data, posts to `/user-kpis/my-kpis/:id/data`
- Home page "My KPIs" panel lists PER_USER assignments with inline value entry
- Manager `/team` view shows direct reports' PER_USER KPIs side-by-side
- User profile `/users/[id]` shows their PER_USER assignments + trends
- Catalog `/kpis` includes scope facet; PER_USER KPIs hidden from users with no assignment
- Dashboards with PER_USER widget source apply viewer's permissions automatically

### 12.10 Interaction patterns

- Forms: react-hook-form + Zod resolver; inline field errors; submit disabled until valid
- Tables: TanStack Table; sticky header; sortable; bulk actions in floating bar; virtual scroll >500 rows
- Drag-drop: dnd-kit; drop targets highlight; optimistic commit + rollback on failure
- Loading: skeleton for >300ms; inline button spinner during submit; top progress bar (NProgress)
- Optimistic UI: status toggles, task moves, archive/restore
- Confirmations: AlertDialog with explicit verb ("Delete 3 KPIs permanently"); type-to-confirm for irreversible
- Toasts: Sonner; success 3s / error 5s with retry / info 3s; max 3 stacked
- Keyboard: ⌘K palette, ⌘/ shortcuts list, route-specific (G then K for KPIs), ESC closes panel/dialog

### 12.11 Accessibility (non-negotiable, WCAG 2.1 AA)

- axe-core zero violations on top 10 pages enforced in CI
- Keyboard navigation: every interactive element reachable with visible focus ring
- Screen reader: semantic HTML, ARIA on icon-only buttons, charts get `role="img"` + summary aria-label
- Color contrast 4.5:1 body / 3:1 large
- `prefers-reduced-motion` honored
- Touch targets ≥44×44px on mobile
- Form errors via `aria-describedby` + `aria-invalid`
- Skip-to-content link
- `lang` attribute matches locale; RTL for ur-PK

### 12.12 Responsive breakpoints

- < 768px: single column, sidebar = sheet
- 768–1024px: 2-col dashboards, condensed sidebar
- 1024–1440px: full sidebar, 3–4 col grids
- > 1440px: `max-w-7xl` on content; dashboards stretch

### 12.13 State variants every component handles

Empty, loading (skeleton), error (retry + Sentry tag), permission-denied, no-data, stale/cached, pending-sync, offline, conflict (3-way diff dialog).

### 12.14 Animation

150–250ms state changes; 300ms page transitions; 400ms celebrate. Easing: `cubic-bezier(0.16, 1, 0.3, 1)` in / `(0.7, 0, 0.84, 0)` out. Honor `prefers-reduced-motion: reduce` (snap to final state).

### 12.15 Assets needed

- Logo wordmark + mark (SVG, light + dark)
- Favicon set (16, 32, 180-touch, 512)
- OG image (1200×630)
- 9 empty-state illustrations (KPIs, Dashboards, Alerts, Tasks, OKRs, Comments, Insights, Notifications, Search) — line-art, single accent
- 5 onboarding tour screenshots

### 12.16 Design deliverable

Future "Claude Design" session produces:
1. `packages/ui/src/tokens.css` — final tokens light + dark
2. `packages/ui/src/components/` — implemented primitives + composites with Storybook stories
3. `apps/web/src/app/**/page.tsx` — pages per route map
4. Storybook for component docs
5. Updated CLAUDE.md with design conventions

---

## Appendix A — Locked decisions

1. **Plan basis**: fresh start; ignores the existing `another/todo.md` blueprint and partial implementation
2. **Success target**: production-quality multi-tenant SaaS
3. **AI provider**: Gemini default (free tier with key rotation) + multi-provider abstraction (Claude/OpenAI/Ollama pluggable) from day one
4. **Deployment**: Docker locally for dev + Vercel (web) + Fly.io (api, worker, ml, postgres) + Upstash (redis) for prod
5. **Stack**: NestJS 11 (Fastify) API + Next.js 15 (App Router) web + Python FastAPI ML sidecar + Postgres 16 + TimescaleDB (self-hosted) + pgvector + Redis + Prisma 6 + Zod + Pino + OTel + Sentry
6. **Scope**: maximum — all current-app features + high-value additions + enterprise features (~30 module surfaces)
7. **Permissions**: 18 canonical (locked)
8. **Tenancy enforcement**: 3 layers (AsyncLocalStorage context + Prisma filter + Postgres RLS)
9. **KPI scope model**: ORG_WIDE / PER_UNIT / PER_USER as first-class concept; data isolation invariants enforced by tests
10. **AI budget defaults**: $1/day, $30/month per org; circuit breaker FAIL_CLOSED or FALLBACK per org
11. **Billing**: schema-ready (Plan, TenantQuota, FeatureFlag); Stripe deferred; FYP demos default ENTERPRISE
12. **MFA**: optional per user, configurable per org (default off); TOTP primary, WebAuthn/SMS deferred
13. **Data residency**: single region; schema-ready for multi-region
14. **Approval workflow**: opt-in per org; KPI definition / target / role permission changes; per-role approvers
15. **Frontend design**: deferred to future "Claude Design" session using §12 brief

---

## Appendix B — Open questions for future sessions

1. **Logo + brand visuals** — decide during Claude Design session
2. **Exact tagline** — decide during Claude Design session
3. **Marketing/landing page** — deferred (FYP doesn't need)
4. **WebAuthn MFA** — deferred to post-P9
5. **Native mobile apps** — deferred indefinitely; REST API available
6. **Real-time collaborative editing** — explicitly out of scope
7. **Stripe billing** — schema ready; can wire post-P9 if needed for ship-to-customers
8. **AWS migration path** — Fly.io is fine for FYP; Terraform modules in `infra/` can target AWS if ambitions grow
9. **Per-org KMS data keys** — Phase 6 stretch; AES-256-GCM stand-in works for FYP

---

## Appendix C — References

- Current app (feature reference only, not code reference): `C:\work\FYP\khan\KPI_NEXUS orignal\`
- Seed gold standard: `C:\work\FYP\khan\KPI_NEXUS orignal\backend\prisma\seed.ts` (~1945 lines) — the depth the new onboarding must be able to produce
- Previous rebuild plan (explicitly NOT inherited): `C:\Users\hasaa\.claude\plans\first-understand-the-current-greedy-dongarra.md` + `C:\work\FYP\khan\KPI_NEXUS orignal\another\todo.md`
- KPI scope isolation spec from current app: `C:\work\FYP\khan\KPI_NEXUS orignal\docs\superpowers\specs\2026-05-18-kpi-per-user-isolation-design.yaml`
- Onboarding wizard v2 spec from current app: `C:\work\FYP\khan\KPI_NEXUS orignal\docs\superpowers\specs\2026-05-17-onboarding-wizard-redesign-design.yaml`

---

**End of spec. Next step: per-phase implementation plan starting with P0 (Foundation) — created via `writing-plans` skill in the next session.**
