-- Manual migration: P2.x add isOutlier flag to KPIDataPoint (Welford 3σ
-- detection at insert). Hand-written (TimescaleDB drift blocks prisma migrate
-- dev). ADD COLUMN on a hypertable is supported by TimescaleDB.

ALTER TABLE "KPIDataPoint" ADD COLUMN "isOutlier" BOOLEAN NOT NULL DEFAULT false;
