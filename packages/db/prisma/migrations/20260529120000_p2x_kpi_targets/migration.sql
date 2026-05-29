-- Manual migration: P2.x KPI targets (build backlog). Hand-written (TimescaleDB
-- drift on KPIDataPoint blocks prisma migrate dev auto-flow). Does not touch
-- KPIDataPoint.

CREATE TYPE "KPITargetType" AS ENUM ('STATIC', 'TIERED', 'DYNAMIC', 'TIME_VARYING', 'CONDITIONAL', 'SCENARIO');

CREATE TABLE "KPITarget" (
  "id"              TEXT            NOT NULL,
  "organizationId"  TEXT            NOT NULL,
  "kpiId"           TEXT            NOT NULL,
  "type"            "KPITargetType" NOT NULL DEFAULT 'STATIC',
  "value"           DOUBLE PRECISION,
  "minValue"        DOUBLE PRECISION,
  "expectedValue"   DOUBLE PRECISION,
  "stretchValue"    DOUBLE PRECISION,
  "impossibleValue" DOUBLE PRECISION,
  "formula"         TEXT,
  "metadata"        JSONB,
  "effectiveFrom"   TIMESTAMP(3),
  "effectiveTo"     TIMESTAMP(3),
  "scenarioName"    TEXT,
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"     TEXT            NOT NULL,
  CONSTRAINT "KPITarget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KPITarget_kpiId_type_idx"          ON "KPITarget"("kpiId", "type");
CREATE INDEX "KPITarget_kpiId_effectiveFrom_idx" ON "KPITarget"("kpiId", "effectiveFrom");
CREATE INDEX "KPITarget_organizationId_idx"      ON "KPITarget"("organizationId");

ALTER TABLE "KPITarget"
  ADD CONSTRAINT "KPITarget_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
