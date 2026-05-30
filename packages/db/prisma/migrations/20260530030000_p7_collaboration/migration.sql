-- Manual migration: P7 Collaboration & Workflow — tasks, comments, mentions,
-- OKRs (objectives + key results), approval workflows/requests, generic rule
-- engine. Hand-written (P5+ convention). Does not touch the KPIDataPoint
-- hypertable.

-- Enums -----------------------------------------------------------------------

CREATE TYPE "TaskStatus"            AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');
CREATE TYPE "TaskPriority"          AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "ObjectiveStatus"       AS ENUM ('DRAFT', 'ACTIVE', 'AT_RISK', 'ACHIEVED', 'MISSED', 'ARCHIVED');
CREATE TYPE "ApprovalEntityType"    AS ENUM ('KPI_DEFINITION', 'KPI_TARGET', 'ROLE_PERMISSIONS');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Task ------------------------------------------------------------------------

CREATE TABLE "Task" (
  "id"             TEXT           NOT NULL,
  "organizationId" TEXT           NOT NULL,
  "kpiId"          TEXT,
  "alertId"        TEXT,
  "title"          TEXT           NOT NULL,
  "description"    TEXT,
  "assigneeUserId" TEXT,
  "dueAt"          TIMESTAMP(3),
  "status"         "TaskStatus"   NOT NULL DEFAULT 'TODO',
  "priority"       "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "externalRef"    TEXT,
  "createdById"    TEXT           NOT NULL,
  "createdAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Task_organizationId_status_dueAt_idx"         ON "Task"("organizationId", "status", "dueAt");
CREATE INDEX "Task_organizationId_kpiId_idx"                ON "Task"("organizationId", "kpiId");
CREATE INDEX "Task_organizationId_assigneeUserId_status_idx" ON "Task"("organizationId", "assigneeUserId", "status");

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Comment ---------------------------------------------------------------------

CREATE TABLE "Comment" (
  "id"               TEXT         NOT NULL,
  "organizationId"   TEXT         NOT NULL,
  "entityType"       TEXT         NOT NULL,
  "entityId"         TEXT         NOT NULL,
  "parentCommentId"  TEXT,
  "authorId"         TEXT         NOT NULL,
  "body"             TEXT         NOT NULL,
  "mentionedUserIds" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deletedAt"        TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_organizationId_entityType_entityId_createdAt_idx" ON "Comment"("organizationId", "entityType", "entityId", "createdAt");
CREATE INDEX "Comment_parentCommentId_idx"                              ON "Comment"("parentCommentId");

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Mention ---------------------------------------------------------------------

CREATE TABLE "Mention" (
  "id"              TEXT         NOT NULL,
  "organizationId"  TEXT         NOT NULL,
  "commentId"       TEXT         NOT NULL,
  "mentionedUserId" TEXT         NOT NULL,
  "readAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mention_commentId_mentionedUserId_key"        ON "Mention"("commentId", "mentionedUserId");
CREATE INDEX "Mention_organizationId_mentionedUserId_readAt_idx" ON "Mention"("organizationId", "mentionedUserId", "readAt");

ALTER TABLE "Mention"
  ADD CONSTRAINT "Mention_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Objective -------------------------------------------------------------------

CREATE TABLE "Objective" (
  "id"                TEXT              NOT NULL,
  "organizationId"    TEXT              NOT NULL,
  "name"              TEXT              NOT NULL,
  "description"       TEXT,
  "ownerUserId"       TEXT              NOT NULL,
  "parentObjectiveId" TEXT,
  "periodStart"       TIMESTAMP(3)      NOT NULL,
  "periodEnd"         TIMESTAMP(3)      NOT NULL,
  "status"            "ObjectiveStatus" NOT NULL DEFAULT 'DRAFT',
  "progress"          DOUBLE PRECISION  NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)      NOT NULL,
  CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Objective_organizationId_status_idx" ON "Objective"("organizationId", "status");
CREATE INDEX "Objective_parentObjectiveId_idx"     ON "Objective"("parentObjectiveId");
CREATE INDEX "Objective_ownerUserId_idx"           ON "Objective"("ownerUserId");

ALTER TABLE "Objective"
  ADD CONSTRAINT "Objective_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- KeyResult -------------------------------------------------------------------

CREATE TABLE "KeyResult" (
  "id"             TEXT             NOT NULL,
  "organizationId" TEXT             NOT NULL,
  "objectiveId"    TEXT             NOT NULL,
  "name"           TEXT             NOT NULL,
  "description"    TEXT,
  "kpiId"          TEXT,
  "baselineValue"  DOUBLE PRECISION,
  "targetValue"    DOUBLE PRECISION NOT NULL,
  "currentValue"   DOUBLE PRECISION,
  "weight"         DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "progress"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KeyResult_objectiveId_idx" ON "KeyResult"("objectiveId");
CREATE INDEX "KeyResult_kpiId_idx"       ON "KeyResult"("kpiId");

ALTER TABLE "KeyResult"
  ADD CONSTRAINT "KeyResult_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ApprovalWorkflow ------------------------------------------------------------

CREATE TABLE "ApprovalWorkflow" (
  "id"                      TEXT                 NOT NULL,
  "organizationId"          TEXT                 NOT NULL,
  "entityType"              "ApprovalEntityType" NOT NULL,
  "requiredApproverRoleIds" TEXT[]               NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requireAll"              BOOLEAN              NOT NULL DEFAULT false,
  "isActive"                BOOLEAN              NOT NULL DEFAULT false,
  "createdAt"               TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)         NOT NULL,
  CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovalWorkflow_organizationId_entityType_key" ON "ApprovalWorkflow"("organizationId", "entityType");

ALTER TABLE "ApprovalWorkflow"
  ADD CONSTRAINT "ApprovalWorkflow_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ApprovalRequest -------------------------------------------------------------

CREATE TABLE "ApprovalRequest" (
  "id"              TEXT                    NOT NULL,
  "organizationId"  TEXT                    NOT NULL,
  "workflowId"      TEXT                    NOT NULL,
  "entityType"      "ApprovalEntityType"    NOT NULL,
  "entityId"        TEXT                    NOT NULL,
  "requesterUserId" TEXT                    NOT NULL,
  "proposedPayload" JSONB                   NOT NULL,
  "status"          "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "decisions"       JSONB                   NOT NULL DEFAULT '[]',
  "resolvedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalRequest_organizationId_entityType_entityId_idx" ON "ApprovalRequest"("organizationId", "entityType", "entityId");
CREATE INDEX "ApprovalRequest_organizationId_status_createdAt_idx"    ON "ApprovalRequest"("organizationId", "status", "createdAt");

ALTER TABLE "ApprovalRequest"
  ADD CONSTRAINT "ApprovalRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Workflow (generic rule engine) ----------------------------------------------

CREATE TABLE "Workflow" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "description"    TEXT,
  "triggers"       TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rule"           JSONB,
  "action"         JSONB        NOT NULL,
  "isActive"       BOOLEAN      NOT NULL DEFAULT true,
  "scheduleCron"   TEXT,
  "lastRunAt"      TIMESTAMP(3),
  "createdById"    TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workflow_organizationId_isActive_idx" ON "Workflow"("organizationId", "isActive");

ALTER TABLE "Workflow"
  ADD CONSTRAINT "Workflow_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
