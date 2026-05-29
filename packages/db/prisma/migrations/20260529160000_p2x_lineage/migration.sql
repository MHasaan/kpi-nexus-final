-- Manual migration: P2.x data lineage (build backlog). Hand-written
-- (TimescaleDB drift blocks prisma migrate dev). Does not touch KPIDataPoint.

CREATE TABLE "LineageEdge" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "sourceType"     TEXT         NOT NULL,
  "sourceId"       TEXT         NOT NULL,
  "targetType"     TEXT         NOT NULL,
  "targetId"       TEXT         NOT NULL,
  "transformType"  TEXT         NOT NULL,
  "jobRunId"       TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LineageEdge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LineageEdge_organizationId_sourceType_sourceId_idx" ON "LineageEdge"("organizationId", "sourceType", "sourceId");
CREATE INDEX "LineageEdge_organizationId_targetType_targetId_idx" ON "LineageEdge"("organizationId", "targetType", "targetId");
CREATE INDEX "LineageEdge_organizationId_createdAt_idx"           ON "LineageEdge"("organizationId", "createdAt");

ALTER TABLE "LineageEdge"
  ADD CONSTRAINT "LineageEdge_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
