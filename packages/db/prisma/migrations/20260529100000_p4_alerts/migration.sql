-- Manual migration: P4 Alerting — alert rules, escalation, alerts, channels,
-- notification deliveries, outbound webhooks, API keys.
--
-- Hand-written (same convention as p3_reports) because TimescaleDB drift on
-- KPIDataPoint blocks the prisma migrate dev auto-flow. Does not touch
-- KPIDataPoint.

-- Enums -----------------------------------------------------------------------

CREATE TYPE "AlertRuleType"              AS ENUM ('STATIC_THRESHOLD', 'DYNAMIC_STDDEV', 'RATE_OF_CHANGE', 'NO_DATA', 'COMPOSITE');
CREATE TYPE "AlertSeverity"              AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "AlertStatus"                AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "NotificationChannelKind"    AS ENUM ('EMAIL', 'SLACK', 'TEAMS', 'SMS', 'IN_APP', 'WEBHOOK');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- AlertRule -------------------------------------------------------------------

CREATE TABLE "AlertRule" (
  "id"             TEXT            NOT NULL,
  "organizationId" TEXT            NOT NULL,
  "kpiId"          TEXT            NOT NULL,
  "name"           TEXT            NOT NULL,
  "description"    TEXT,
  "ruleType"       "AlertRuleType" NOT NULL,
  "config"         JSONB           NOT NULL,
  "severity"       "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
  "isActive"       BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"    TEXT            NOT NULL,
  CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertRule_kpiId_isActive_idx"          ON "AlertRule"("kpiId", "isActive");
CREATE INDEX "AlertRule_organizationId_isActive_idx" ON "AlertRule"("organizationId", "isActive");

ALTER TABLE "AlertRule"
  ADD CONSTRAINT "AlertRule_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- EscalationRule --------------------------------------------------------------

CREATE TABLE "EscalationRule" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "alertRuleId"    TEXT         NOT NULL,
  "levels"         JSONB        NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EscalationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EscalationRule_alertRuleId_key" ON "EscalationRule"("alertRuleId");
CREATE INDEX "EscalationRule_organizationId_idx"     ON "EscalationRule"("organizationId");

ALTER TABLE "EscalationRule"
  ADD CONSTRAINT "EscalationRule_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EscalationRule"
  ADD CONSTRAINT "EscalationRule_alertRuleId_fkey"
  FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Alert -----------------------------------------------------------------------

CREATE TABLE "Alert" (
  "id"               TEXT            NOT NULL,
  "organizationId"   TEXT            NOT NULL,
  "alertRuleId"      TEXT,
  "kpiId"            TEXT            NOT NULL,
  "message"          TEXT            NOT NULL,
  "severity"         "AlertSeverity" NOT NULL,
  "status"           "AlertStatus"   NOT NULL DEFAULT 'OPEN',
  "targetUserId"     TEXT,
  "acknowledgedAt"   TIMESTAMP(3),
  "acknowledgedById" TEXT,
  "resolvedAt"       TIMESTAMP(3),
  "meta"             JSONB,
  "createdAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Alert_organizationId_status_createdAt_idx" ON "Alert"("organizationId", "status", "createdAt");
CREATE INDEX "Alert_kpiId_status_idx"                    ON "Alert"("kpiId", "status");
CREATE INDEX "Alert_alertRuleId_idx"                     ON "Alert"("alertRuleId");

ALTER TABLE "Alert"
  ADD CONSTRAINT "Alert_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Alert"
  ADD CONSTRAINT "Alert_alertRuleId_fkey"
  FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- NotificationChannel ---------------------------------------------------------

CREATE TABLE "NotificationChannel" (
  "id"             TEXT                      NOT NULL,
  "organizationId" TEXT                      NOT NULL,
  "name"           TEXT                      NOT NULL,
  "kind"           "NotificationChannelKind" NOT NULL,
  "config"         JSONB                     NOT NULL,
  "isActive"       BOOLEAN                   NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationChannel_organizationId_isActive_idx" ON "NotificationChannel"("organizationId", "isActive");

ALTER TABLE "NotificationChannel"
  ADD CONSTRAINT "NotificationChannel_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- NotificationDelivery --------------------------------------------------------

CREATE TABLE "NotificationDelivery" (
  "id"             TEXT                         NOT NULL,
  "organizationId" TEXT                         NOT NULL,
  "alertId"        TEXT                         NOT NULL,
  "channelId"      TEXT,
  "targetUserId"   TEXT,
  "status"         "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"       INTEGER                      NOT NULL DEFAULT 0,
  "error"          TEXT,
  "sentAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationDelivery_alertId_idx"                            ON "NotificationDelivery"("alertId");
CREATE INDEX "NotificationDelivery_organizationId_status_createdAt_idx"    ON "NotificationDelivery"("organizationId", "status", "createdAt");
CREATE INDEX "NotificationDelivery_targetUserId_status_idx"                ON "NotificationDelivery"("targetUserId", "status");

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "Alert"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- WebhookSubscription ---------------------------------------------------------

CREATE TABLE "WebhookSubscription" (
  "id"              TEXT         NOT NULL,
  "organizationId"  TEXT         NOT NULL,
  "name"            TEXT         NOT NULL,
  "url"             TEXT         NOT NULL,
  "events"          TEXT[]       NOT NULL DEFAULT '{}',
  "secret"          TEXT         NOT NULL,
  "isActive"        BOOLEAN      NOT NULL DEFAULT true,
  "lastDeliveredAt" TIMESTAMP(3),
  "lastStatus"      INTEGER,
  "failureCount"    INTEGER      NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"     TEXT         NOT NULL,
  CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookSubscription_organizationId_isActive_idx" ON "WebhookSubscription"("organizationId", "isActive");

ALTER TABLE "WebhookSubscription"
  ADD CONSTRAINT "WebhookSubscription_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ApiKey ----------------------------------------------------------------------

CREATE TABLE "ApiKey" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "hashedKey"      TEXT         NOT NULL,
  "keyPrefix"      TEXT         NOT NULL,
  "scopes"         TEXT[]       NOT NULL DEFAULT '{}',
  "lastUsedAt"     TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3),
  "revokedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"    TEXT         NOT NULL,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_hashedKey_key"             ON "ApiKey"("hashedKey");
CREATE INDEX "ApiKey_organizationId_revokedAt_idx"     ON "ApiKey"("organizationId", "revokedAt");

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
