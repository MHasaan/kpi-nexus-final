-- Manual migration: P5 AI insights + recommendations.
--
-- Hand-written (same convention as p5_ai_providers_budget). Does not touch the
-- KPIDataPoint hypertable. Anomaly/forecast/NLQ/embedding models land with
-- their own modules later in P5.

-- Enum ------------------------------------------------------------------------

CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACTIONED', 'DISMISSED');

-- KPIInsight ------------------------------------------------------------------

CREATE TABLE "KPIInsight" (
  "id"               TEXT         NOT NULL,
  "organizationId"   TEXT         NOT NULL,
  "kpiId"            TEXT         NOT NULL,
  "narrative"        TEXT         NOT NULL,
  "model"            TEXT         NOT NULL,
  "promptTokens"     INTEGER      NOT NULL DEFAULT 0,
  "completionTokens" INTEGER      NOT NULL DEFAULT 0,
  "generatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KPIInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KPIInsight_organizationId_generatedAt_idx" ON "KPIInsight"("organizationId", "generatedAt");
CREATE INDEX "KPIInsight_kpiId_generatedAt_idx"          ON "KPIInsight"("kpiId", "generatedAt");

ALTER TABLE "KPIInsight"
  ADD CONSTRAINT "KPIInsight_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Recommendation --------------------------------------------------------------

CREATE TABLE "Recommendation" (
  "id"             TEXT                   NOT NULL,
  "organizationId" TEXT                   NOT NULL,
  "kpiId"          TEXT                   NOT NULL,
  "alertId"        TEXT,
  "anomalyId"      TEXT,
  "content"        JSONB                  NOT NULL,
  "confidence"     DOUBLE PRECISION       NOT NULL,
  "status"         "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"      TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"     TIMESTAMP(3),
  "resolvedById"   TEXT,
  CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recommendation_organizationId_status_idx" ON "Recommendation"("organizationId", "status");
CREATE INDEX "Recommendation_kpiId_status_idx"          ON "Recommendation"("kpiId", "status");
CREATE INDEX "Recommendation_alertId_idx"               ON "Recommendation"("alertId");

ALTER TABLE "Recommendation"
  ADD CONSTRAINT "Recommendation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
