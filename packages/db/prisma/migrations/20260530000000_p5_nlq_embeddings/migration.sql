-- Manual migration: P5 NLQ — KPI catalog embeddings (pgvector) + question log.
--
-- Hand-written (same convention as the other P5 migrations). The `vector`
-- extension is already installed (P0). Does not touch the KPIDataPoint
-- hypertable. Vector columns are written/searched via raw SQL; an ivfflat index
-- is intentionally deferred until the catalog grows (~10k rows) — exact search
-- is fine at FYP scale.

-- KpiCatalogEmbedding ---------------------------------------------------------

CREATE TABLE "KpiCatalogEmbedding" (
  "id"               TEXT            NOT NULL,
  "organizationId"   TEXT            NOT NULL,
  "kpiId"            TEXT            NOT NULL,
  "embedding_openai" vector(1536),
  "embedding_gemini" vector(768),
  "embedding_voyage" vector(1024),
  "sourceText"       TEXT            NOT NULL,
  "providerKey"      "AiProviderKey" NOT NULL,
  "generatedAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KpiCatalogEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KpiCatalogEmbedding_kpiId_providerKey_key" ON "KpiCatalogEmbedding"("kpiId", "providerKey");
CREATE INDEX "KpiCatalogEmbedding_organizationId_idx"           ON "KpiCatalogEmbedding"("organizationId");

ALTER TABLE "KpiCatalogEmbedding"
  ADD CONSTRAINT "KpiCatalogEmbedding_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- NLQQuery --------------------------------------------------------------------

CREATE TABLE "NLQQuery" (
  "id"             TEXT            NOT NULL,
  "organizationId" TEXT            NOT NULL,
  "userId"         TEXT            NOT NULL,
  "question"       TEXT            NOT NULL,
  "response"       JSONB           NOT NULL,
  "latencyMs"      INTEGER         NOT NULL DEFAULT 0,
  "costUsd"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inputTokens"    INTEGER         NOT NULL DEFAULT 0,
  "outputTokens"   INTEGER         NOT NULL DEFAULT 0,
  "providerKey"    "AiProviderKey" NOT NULL,
  "modelId"        TEXT            NOT NULL,
  "status"         "AiCallStatus"  NOT NULL,
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NLQQuery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NLQQuery_organizationId_createdAt_idx" ON "NLQQuery"("organizationId", "createdAt");

ALTER TABLE "NLQQuery"
  ADD CONSTRAINT "NLQQuery_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
