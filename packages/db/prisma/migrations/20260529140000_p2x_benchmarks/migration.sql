-- Manual migration: P2.x KPI benchmarks (build backlog). Hand-written
-- (TimescaleDB drift blocks prisma migrate dev). Does not touch KPIDataPoint.

CREATE TABLE "KPIBenchmark" (
  "id"             TEXT             NOT NULL,
  "organizationId" TEXT             NOT NULL,
  "kpiId"          TEXT             NOT NULL,
  "kind"           TEXT             NOT NULL,
  "value"          DOUBLE PRECISION NOT NULL,
  "periodStart"    TIMESTAMP(3),
  "periodEnd"      TIMESTAMP(3),
  "source"         TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"    TEXT             NOT NULL,
  CONSTRAINT "KPIBenchmark_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KPIBenchmark_kpiId_kind_idx"      ON "KPIBenchmark"("kpiId", "kind");
CREATE INDEX "KPIBenchmark_organizationId_idx"  ON "KPIBenchmark"("organizationId");

ALTER TABLE "KPIBenchmark"
  ADD CONSTRAINT "KPIBenchmark_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
