-- Manual migration: P3.6 Reports — ScheduledReport + ReportRun.
--
-- Hand-written (same convention as p3_dashboard_share_links) because
-- TimescaleDB drift on KPIDataPoint blocks the prisma migrate dev auto-flow.
-- This migration does not touch KPIDataPoint.

-- Enums -----------------------------------------------------------------------

CREATE TYPE "ReportRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ReportFormat"    AS ENUM ('CSV', 'EXCEL', 'PDF');

-- ScheduledReport -------------------------------------------------------------

CREATE TABLE "ScheduledReport" (
  "id"             TEXT          NOT NULL,
  "organizationId" TEXT          NOT NULL,
  "name"           TEXT          NOT NULL,
  "description"    TEXT,
  "dashboardId"    TEXT,
  "kpiIds"         TEXT[]        NOT NULL DEFAULT '{}',
  "cron"           TEXT          NOT NULL,
  "format"         "ReportFormat" NOT NULL,
  "recipients"     TEXT[]        NOT NULL DEFAULT '{}',
  "isActive"       BOOLEAN       NOT NULL DEFAULT true,
  "lastRunAt"      TIMESTAMP(3),
  "nextRunAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"    TEXT          NOT NULL,
  CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledReport_organizationId_isActive_idx"
  ON "ScheduledReport"("organizationId", "isActive");

ALTER TABLE "ScheduledReport"
  ADD CONSTRAINT "ScheduledReport_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ReportRun -------------------------------------------------------------------

CREATE TABLE "ReportRun" (
  "id"                TEXT              NOT NULL,
  "organizationId"    TEXT              NOT NULL,
  "scheduledReportId" TEXT,
  "triggeredById"     TEXT,
  "status"            "ReportRunStatus" NOT NULL DEFAULT 'PENDING',
  "format"            "ReportFormat"    NOT NULL,
  "fileUrl"           TEXT,
  "error"             TEXT,
  "startedAt"         TIMESTAMP(3),
  "finishedAt"        TIMESTAMP(3),
  "ranAt"             TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportRun_scheduledReportId_ranAt_idx"
  ON "ReportRun"("scheduledReportId", "ranAt");

CREATE INDEX "ReportRun_organizationId_idx"
  ON "ReportRun"("organizationId");

ALTER TABLE "ReportRun"
  ADD CONSTRAINT "ReportRun_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportRun"
  ADD CONSTRAINT "ReportRun_scheduledReportId_fkey"
  FOREIGN KEY ("scheduledReportId") REFERENCES "ScheduledReport"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
