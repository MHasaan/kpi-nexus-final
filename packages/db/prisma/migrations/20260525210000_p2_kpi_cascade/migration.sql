-- Manual migration: P2.4 cascade rollups.
--
-- The auto-generated `prisma migrate dev` flow wants to reset the dev DB
-- here because TimescaleDB added a `recordedAt` index to KPIDataPoint
-- during the hypertable conversion (post-migration SQL), and Prisma sees
-- that as drift. The cascade-table additions below don't touch
-- KPIDataPoint at all, so we land them as a manual SQL migration that
-- the migrate runner will accept on first apply.

CREATE TYPE "RollupMethod" AS ENUM (
  'SUM', 'AVG', 'WEIGHTED_AVG', 'MIN', 'MAX', 'CUSTOM_FORMULA'
);

CREATE TABLE "KPICascade" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "parentKpiId"    TEXT NOT NULL,
  "childKpiId"     TEXT NOT NULL,
  "method"         "RollupMethod" NOT NULL DEFAULT 'SUM',
  "weight"         DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "level"          INTEGER NOT NULL DEFAULT 0,
  "customFormula"  TEXT,
  "lastComputedAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KPICascade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KPICascade_parentKpiId_childKpiId_key"
  ON "KPICascade"("parentKpiId", "childKpiId");
CREATE INDEX "KPICascade_organizationId_idx" ON "KPICascade"("organizationId");
CREATE INDEX "KPICascade_childKpiId_idx" ON "KPICascade"("childKpiId");

ALTER TABLE "KPICascade"
  ADD CONSTRAINT "KPICascade_parentKpiId_fkey"
  FOREIGN KEY ("parentKpiId") REFERENCES "KPI"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KPICascade"
  ADD CONSTRAINT "KPICascade_childKpiId_fkey"
  FOREIGN KEY ("childKpiId") REFERENCES "KPI"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
