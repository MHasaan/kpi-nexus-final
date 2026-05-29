-- Manual migration: P5 AI layer — provider config, per-feature routing config,
-- call log, and per-org budget caps.
--
-- Hand-written (same convention as p4_alerts) because TimescaleDB drift on
-- KPIDataPoint blocks the prisma migrate dev auto-flow. Does not touch
-- KPIDataPoint.

-- Enums -----------------------------------------------------------------------

CREATE TYPE "AiProviderKey"      AS ENUM ('CLAUDE', 'GEMINI', 'OPENAI', 'OLLAMA');
CREATE TYPE "AiCallStatus"       AS ENUM ('SUCCESS', 'FAILED', 'SUPPRESSED');
CREATE TYPE "CircuitBreakerMode" AS ENUM ('FAIL_CLOSED', 'FALLBACK');

-- AiProvider ------------------------------------------------------------------

CREATE TABLE "AiProvider" (
  "id"                   TEXT            NOT NULL,
  "organizationId"       TEXT            NOT NULL,
  "key"                  "AiProviderKey" NOT NULL,
  "displayName"          TEXT            NOT NULL,
  "isEnabled"            BOOLEAN         NOT NULL DEFAULT true,
  "encryptedCredentials" JSONB,
  "supportedFeatures"    TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"            TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiProvider_organizationId_key_key" ON "AiProvider"("organizationId", "key");
CREATE INDEX "AiProvider_organizationId_idx"            ON "AiProvider"("organizationId");

ALTER TABLE "AiProvider"
  ADD CONSTRAINT "AiProvider_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AiFeatureConfig -------------------------------------------------------------

CREATE TABLE "AiFeatureConfig" (
  "id"                 TEXT         NOT NULL,
  "organizationId"     TEXT         NOT NULL,
  "feature"            TEXT         NOT NULL,
  "providerId"         TEXT         NOT NULL,
  "model"              TEXT         NOT NULL,
  "fallbackProviderId" TEXT,
  "fallbackModel"      TEXT,
  "perFeatureCapUsd"   DOUBLE PRECISION,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiFeatureConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiFeatureConfig_organizationId_feature_key" ON "AiFeatureConfig"("organizationId", "feature");
CREATE INDEX "AiFeatureConfig_organizationId_idx"                ON "AiFeatureConfig"("organizationId");

ALTER TABLE "AiFeatureConfig"
  ADD CONSTRAINT "AiFeatureConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AiCallLog -------------------------------------------------------------------

CREATE TABLE "AiCallLog" (
  "id"             TEXT            NOT NULL,
  "organizationId" TEXT            NOT NULL,
  "feature"        TEXT            NOT NULL,
  "providerKey"    "AiProviderKey" NOT NULL,
  "modelId"        TEXT            NOT NULL,
  "inputTokens"    INTEGER         NOT NULL DEFAULT 0,
  "outputTokens"   INTEGER         NOT NULL DEFAULT 0,
  "costUsd"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "latencyMs"      INTEGER         NOT NULL DEFAULT 0,
  "status"         "AiCallStatus"  NOT NULL,
  "errorCode"      TEXT,
  "requestId"      TEXT            NOT NULL,
  "context"        JSONB,
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCallLog_organizationId_createdAt_idx"          ON "AiCallLog"("organizationId", "createdAt");
CREATE INDEX "AiCallLog_organizationId_feature_createdAt_idx"  ON "AiCallLog"("organizationId", "feature", "createdAt");
CREATE INDEX "AiCallLog_requestId_idx"                         ON "AiCallLog"("requestId");

ALTER TABLE "AiCallLog"
  ADD CONSTRAINT "AiCallLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AiBudget --------------------------------------------------------------------

CREATE TABLE "AiBudget" (
  "id"                  TEXT                 NOT NULL,
  "organizationId"      TEXT                 NOT NULL,
  "dailyCapUsd"         DOUBLE PRECISION     NOT NULL DEFAULT 1.0,
  "monthlyCapUsd"       DOUBLE PRECISION     NOT NULL DEFAULT 30.0,
  "circuitBreaker"      "CircuitBreakerMode" NOT NULL DEFAULT 'FAIL_CLOSED',
  "currentDailySpend"   DOUBLE PRECISION     NOT NULL DEFAULT 0,
  "currentMonthlySpend" DOUBLE PRECISION     NOT NULL DEFAULT 0,
  "dailyPeriodStart"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "monthlyPeriodStart"  TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiBudget_organizationId_key" ON "AiBudget"("organizationId");

ALTER TABLE "AiBudget"
  ADD CONSTRAINT "AiBudget_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
