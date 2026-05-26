-- Manual migration: P3.2 Dashboards + Widgets.
--
-- Hand-written for the same reason as the P2.4 cascade migration: the
-- TimescaleDB hypertable conversion on KPIDataPoint produces drift that
-- the `prisma migrate dev` auto-flow refuses to ignore. None of the
-- changes below touch KPIDataPoint, so they land cleanly as raw SQL.

CREATE TABLE "Dashboard" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "ownerUserId"    TEXT,
  "ownerRoleId"    TEXT,
  "isShared"       BOOLEAN NOT NULL DEFAULT FALSE,
  "isDefault"      BOOLEAN NOT NULL DEFAULT FALSE,
  "layout"         JSONB,
  "version"        INTEGER NOT NULL DEFAULT 1,
  "deletedAt"      TIMESTAMP(3),
  "deletedById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "createdById"    TEXT,
  CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Dashboard_organizationId_deletedAt_idx"
  ON "Dashboard"("organizationId", "deletedAt");
CREATE INDEX "Dashboard_ownerUserId_idx" ON "Dashboard"("ownerUserId");

ALTER TABLE "Dashboard"
  ADD CONSTRAINT "Dashboard_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dashboard"
  ADD CONSTRAINT "Dashboard_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DashboardWidget" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "dashboardId"    TEXT NOT NULL,
  "widgetType"     TEXT NOT NULL,
  "title"          TEXT,
  "config"         JSONB NOT NULL,
  "position"       JSONB NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardWidget_dashboardId_idx" ON "DashboardWidget"("dashboardId");
CREATE INDEX "DashboardWidget_organizationId_idx" ON "DashboardWidget"("organizationId");

ALTER TABLE "DashboardWidget"
  ADD CONSTRAINT "DashboardWidget_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardWidget"
  ADD CONSTRAINT "DashboardWidget_dashboardId_fkey"
  FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
