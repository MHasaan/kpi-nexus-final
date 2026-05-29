-- Manual migration: P2.x add per-assignment target/current/status to
-- KPIAssignmentUser (UserKpisModule). Hand-written (TimescaleDB drift blocks
-- prisma migrate dev). Does not touch KPIDataPoint.

ALTER TABLE "KPIAssignmentUser" ADD COLUMN "targetValue"  DOUBLE PRECISION;
ALTER TABLE "KPIAssignmentUser" ADD COLUMN "currentValue" DOUBLE PRECISION;
ALTER TABLE "KPIAssignmentUser" ADD COLUMN "status"       TEXT;
