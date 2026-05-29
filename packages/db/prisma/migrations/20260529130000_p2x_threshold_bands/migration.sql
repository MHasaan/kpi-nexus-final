-- Manual migration: P2.x KPI threshold bands (build backlog). Hand-written
-- (TimescaleDB drift blocks prisma migrate dev). Does not touch KPIDataPoint.

CREATE TABLE "KPIThresholdBand" (
  "id"                        TEXT             NOT NULL,
  "organizationId"            TEXT             NOT NULL,
  "kpiId"                     TEXT             NOT NULL,
  "name"                      TEXT             NOT NULL,
  "lower"                     DOUBLE PRECISION,
  "upper"                     DOUBLE PRECISION,
  "color"                     TEXT             NOT NULL,
  "order"                     INTEGER          NOT NULL,
  "consecutivePointsRequired" INTEGER          NOT NULL DEFAULT 1,
  "createdAt"                 TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"               TEXT             NOT NULL,
  CONSTRAINT "KPIThresholdBand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KPIThresholdBand_kpiId_order_idx"     ON "KPIThresholdBand"("kpiId", "order");
CREATE INDEX "KPIThresholdBand_organizationId_idx"  ON "KPIThresholdBand"("organizationId");

ALTER TABLE "KPIThresholdBand"
  ADD CONSTRAINT "KPIThresholdBand_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
