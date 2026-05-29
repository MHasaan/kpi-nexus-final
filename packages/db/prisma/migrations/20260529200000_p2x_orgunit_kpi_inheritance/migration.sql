-- Manual migration: P2.x org-unit KPI inheritance + per-assignment fields on
-- KPIAssignmentOrgUnit (OrgUnitKpisModule). Hand-written (TimescaleDB drift
-- blocks prisma migrate dev). Does not touch KPIDataPoint.

ALTER TABLE "KPIAssignmentOrgUnit" ADD COLUMN "inherited"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KPIAssignmentOrgUnit" ADD COLUMN "inheritedFromUnitId" TEXT;
ALTER TABLE "KPIAssignmentOrgUnit" ADD COLUMN "targetValue"         DOUBLE PRECISION;
ALTER TABLE "KPIAssignmentOrgUnit" ADD COLUMN "currentValue"        DOUBLE PRECISION;
ALTER TABLE "KPIAssignmentOrgUnit" ADD COLUMN "status"              TEXT;
