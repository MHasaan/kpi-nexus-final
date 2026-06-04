-- Granular access Phase 2.5: publish-a-dashboard-to-a-unit assignment table.
-- Additive; existing data unaffected. Idempotent guards for safe re-run.
CREATE TABLE IF NOT EXISTS "DashboardAssignmentOrgUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DashboardAssignmentOrgUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DashboardAssignmentOrgUnit_dashboardId_orgUnitId_key" ON "DashboardAssignmentOrgUnit"("dashboardId", "orgUnitId");
CREATE INDEX IF NOT EXISTS "DashboardAssignmentOrgUnit_organizationId_idx" ON "DashboardAssignmentOrgUnit"("organizationId");
CREATE INDEX IF NOT EXISTS "DashboardAssignmentOrgUnit_orgUnitId_idx" ON "DashboardAssignmentOrgUnit"("orgUnitId");

DO $$ BEGIN
  ALTER TABLE "DashboardAssignmentOrgUnit" ADD CONSTRAINT "DashboardAssignmentOrgUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DashboardAssignmentOrgUnit" ADD CONSTRAINT "DashboardAssignmentOrgUnit_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DashboardAssignmentOrgUnit" ADD CONSTRAINT "DashboardAssignmentOrgUnit_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
