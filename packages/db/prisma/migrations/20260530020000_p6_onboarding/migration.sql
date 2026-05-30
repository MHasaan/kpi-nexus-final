-- Manual migration: P6 Onboarding 2.0 — sessions, AI interactions, org
-- templates, setup checklist. Hand-written (P5 convention). Does not touch the
-- KPIDataPoint hypertable.

-- Enums -----------------------------------------------------------------------

CREATE TYPE "OnboardingStatus" AS ENUM ('in_progress', 'completed', 'archived');
CREATE TYPE "OnboardingAiMode" AS ENUM ('generator', 'assistant', 'suggest', 'explain');

-- OnboardingSession -----------------------------------------------------------

CREATE TABLE "OnboardingSession" (
  "id"               TEXT               NOT NULL,
  "organizationId"   TEXT,
  "organizationName" TEXT               NOT NULL,
  "userId"           TEXT,
  "userEmail"        TEXT               NOT NULL,
  "draftTokenHash"   TEXT,
  "payload"          JSONB              NOT NULL,
  "status"           "OnboardingStatus" NOT NULL DEFAULT 'in_progress',
  "entryMode"        TEXT               NOT NULL DEFAULT 'full',
  "lastEditedStep"   TEXT,
  "startedAt"        TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"      TIMESTAMP(3),
  "updatedAt"        TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnboardingSession_userEmail_status_idx" ON "OnboardingSession"("userEmail", "status");

-- OnboardingAIInteraction -----------------------------------------------------

CREATE TABLE "OnboardingAIInteraction" (
  "id"               TEXT               NOT NULL,
  "sessionId"        TEXT               NOT NULL,
  "mode"             "OnboardingAiMode" NOT NULL,
  "prompt"           TEXT               NOT NULL,
  "response"         TEXT               NOT NULL,
  "appliedSections"  TEXT[]             NOT NULL DEFAULT ARRAY[]::TEXT[],
  "editedSections"   TEXT[]             NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rejectedSections" TEXT[]             NOT NULL DEFAULT ARRAY[]::TEXT[],
  "promptTokens"     INTEGER            NOT NULL DEFAULT 0,
  "completionTokens" INTEGER            NOT NULL DEFAULT 0,
  "latencyMs"        INTEGER            NOT NULL,
  "providerKey"      TEXT,
  "modelId"          TEXT,
  "costUsd"          DOUBLE PRECISION,
  "createdAt"        TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingAIInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnboardingAIInteraction_sessionId_createdAt_idx" ON "OnboardingAIInteraction"("sessionId", "createdAt");

-- OrgTemplate -----------------------------------------------------------------

CREATE TABLE "OrgTemplate" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT,
  "slug"           TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "description"    TEXT,
  "tier"           TEXT         NOT NULL DEFAULT 'starter',
  "orgType"        TEXT,
  "industry"       TEXT,
  "payload"        JSONB        NOT NULL,
  "isBuiltin"      BOOLEAN      NOT NULL DEFAULT false,
  "isPublic"       BOOLEAN      NOT NULL DEFAULT false,
  "popularity"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgTemplate_slug_key" ON "OrgTemplate"("slug");
CREATE INDEX "OrgTemplate_tier_idx"        ON "OrgTemplate"("tier");
CREATE INDEX "OrgTemplate_industry_idx"    ON "OrgTemplate"("industry");

-- OnboardingTask --------------------------------------------------------------

CREATE TABLE "OnboardingTask" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "key"            TEXT         NOT NULL,
  "status"         TEXT         NOT NULL DEFAULT 'pending',
  "dueAt"          TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "completedById"  TEXT,
  "dismissedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingTask_organizationId_key_key" ON "OnboardingTask"("organizationId", "key");
CREATE INDEX "OnboardingTask_organizationId_idx"           ON "OnboardingTask"("organizationId");

ALTER TABLE "OnboardingTask"
  ADD CONSTRAINT "OnboardingTask_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
