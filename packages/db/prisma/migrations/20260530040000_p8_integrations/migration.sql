-- Manual migration: P8 Integrations & Extensibility — integration connections,
-- connectors, pipelines, ingestion jobs, plugins. Hand-written (P5+ convention).
-- Does not touch the KPIDataPoint hypertable.

-- Enums -----------------------------------------------------------------------

CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'PENDING', 'ERROR');
CREATE TYPE "ConnectorType"               AS ENUM ('REST', 'GRAPHQL', 'POSTGRES', 'MYSQL', 'S3', 'GCS', 'WEBHOOK');
CREATE TYPE "PipelineStatus"              AS ENUM ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "PluginType"                  AS ENUM ('WIDGET', 'TEMPLATE', 'FORMULA_FN', 'CONNECTOR');

-- IntegrationConnection -------------------------------------------------------

CREATE TABLE "IntegrationConnection" (
  "id"              TEXT                          NOT NULL,
  "organizationId"  TEXT                          NOT NULL,
  "provider"        TEXT                          NOT NULL,
  "displayName"     TEXT,
  "encryptedTokens" JSONB                         NOT NULL,
  "scopes"          TEXT[]                        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"          "IntegrationConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "lastSyncAt"      TIMESTAMP(3),
  "lastError"       TEXT,
  "metadata"        JSONB,
  "createdById"     TEXT                          NOT NULL,
  "createdAt"       TIMESTAMP(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)                  NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationConnection_organizationId_provider_idx" ON "IntegrationConnection"("organizationId", "provider");

ALTER TABLE "IntegrationConnection"
  ADD CONSTRAINT "IntegrationConnection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Connector -------------------------------------------------------------------

CREATE TABLE "Connector" (
  "id"             TEXT            NOT NULL,
  "organizationId" TEXT            NOT NULL,
  "name"           TEXT            NOT NULL,
  "type"           "ConnectorType" NOT NULL,
  "config"         JSONB           NOT NULL,
  "schedule"       TEXT,
  "isActive"       BOOLEAN         NOT NULL DEFAULT true,
  "lastRunAt"      TIMESTAMP(3),
  "lastRunStatus"  TEXT,
  "createdById"    TEXT            NOT NULL,
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Connector_organizationId_isActive_idx" ON "Connector"("organizationId", "isActive");

ALTER TABLE "Connector"
  ADD CONSTRAINT "Connector_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Pipeline --------------------------------------------------------------------

CREATE TABLE "Pipeline" (
  "id"             TEXT             NOT NULL,
  "organizationId" TEXT             NOT NULL,
  "connectorId"    TEXT             NOT NULL,
  "name"           TEXT             NOT NULL,
  "steps"          JSONB            NOT NULL,
  "status"         "PipelineStatus" NOT NULL DEFAULT 'IDLE',
  "lastRunAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pipeline_connectorId_idx" ON "Pipeline"("connectorId");

ALTER TABLE "Pipeline"
  ADD CONSTRAINT "Pipeline_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- IngestionJob ----------------------------------------------------------------

CREATE TABLE "IngestionJob" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "kind"           TEXT         NOT NULL,
  "source"         JSONB        NOT NULL,
  "status"         TEXT         NOT NULL,
  "startedAt"      TIMESTAMP(3) NOT NULL,
  "finishedAt"     TIMESTAMP(3),
  "errorLog"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngestionJob_organizationId_createdAt_idx" ON "IngestionJob"("organizationId", "createdAt");

ALTER TABLE "IngestionJob"
  ADD CONSTRAINT "IngestionJob_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Plugin ----------------------------------------------------------------------

CREATE TABLE "Plugin" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "type"           "PluginType" NOT NULL,
  "version"        TEXT         NOT NULL,
  "entryUrl"       TEXT         NOT NULL,
  "description"    TEXT,
  "isEnabled"      BOOLEAN      NOT NULL DEFAULT true,
  "config"         JSONB,
  "installedById"  TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Plugin_organizationId_type_isEnabled_idx" ON "Plugin"("organizationId", "type", "isEnabled");

ALTER TABLE "Plugin"
  ADD CONSTRAINT "Plugin_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
