-- Manual migration: P3.3 DashboardSnapshot FK relations.
--
-- Adds two foreign-key constraints that were omitted from the initial
-- p3_dashboard_snapshots migration (columns already exist, no DDL needed):
--   1. DashboardSnapshot → Dashboard (cascade delete)
--   2. DashboardSnapshot → User via takenById (restrict delete)

ALTER TABLE "DashboardSnapshot"
  ADD CONSTRAINT "DashboardSnapshot_dashboardId_fkey"
  FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardSnapshot"
  ADD CONSTRAINT "DashboardSnapshot_takenById_fkey"
  FOREIGN KEY ("takenById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
