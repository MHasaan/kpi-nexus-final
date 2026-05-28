-- Manual migration: P3.4 DashboardShareLink.
--
-- Hand-written (same convention as p3_dashboard_snapshots) because
-- TimescaleDB drift on KPIDataPoint blocks the prisma migrate dev auto-flow.
-- This migration does not touch KPIDataPoint.

CREATE TABLE "DashboardShareLink" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "dashboardId"    TEXT NOT NULL,
  "token"          TEXT NOT NULL,
  "expiresAt"      TIMESTAMP(3),
  "viewCount"      INTEGER NOT NULL DEFAULT 0,
  "passwordHash"   TEXT,
  "lastViewedAt"   TIMESTAMP(3),
  "revokedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"    TEXT NOT NULL,
  CONSTRAINT "DashboardShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardShareLink_token_key"
  ON "DashboardShareLink"("token");

CREATE INDEX "DashboardShareLink_dashboardId_revokedAt_idx"
  ON "DashboardShareLink"("dashboardId", "revokedAt");

CREATE INDEX "DashboardShareLink_organizationId_idx"
  ON "DashboardShareLink"("organizationId");

ALTER TABLE "DashboardShareLink"
  ADD CONSTRAINT "DashboardShareLink_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardShareLink"
  ADD CONSTRAINT "DashboardShareLink_dashboardId_fkey"
  FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardShareLink"
  ADD CONSTRAINT "DashboardShareLink_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
