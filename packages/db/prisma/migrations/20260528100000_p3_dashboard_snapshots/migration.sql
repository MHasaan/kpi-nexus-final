-- Manual migration: P3.3 DashboardSnapshot.
--
-- Hand-written (same as p3_dashboards) because TimescaleDB drift on
-- KPIDataPoint blocks the prisma migrate dev auto-flow. This migration
-- does not touch KPIDataPoint.

CREATE TABLE "DashboardSnapshot" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "dashboardId"    TEXT NOT NULL,
  "label"          TEXT,
  "payload"        JSONB NOT NULL,
  "takenById"      TEXT NOT NULL,
  "takenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DashboardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardSnapshot_dashboardId_takenAt_idx"
  ON "DashboardSnapshot"("dashboardId", "takenAt");

CREATE INDEX "DashboardSnapshot_organizationId_idx"
  ON "DashboardSnapshot"("organizationId");

ALTER TABLE "DashboardSnapshot"
  ADD CONSTRAINT "DashboardSnapshot_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
