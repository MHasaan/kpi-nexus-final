-- Corrections of recorded KPI values: previous / new value and note, the
-- reason and who changed it. The point is referenced by id (KPIDataPoint is a
-- hypertable with a composite key). Tenant FK as in OT-016; RLS is applied by
-- sql/rls-policies.sql to every table with "organizationId".

-- CreateTable
CREATE TABLE "KPIDataPointHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataPointId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "previousNote" TEXT,
    "newNote" TEXT,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPIDataPointHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KPIDataPointHistory_organizationId_idx" ON "KPIDataPointHistory"("organizationId");

-- CreateIndex
CREATE INDEX "KPIDataPointHistory_dataPointId_changedAt_idx" ON "KPIDataPointHistory"("dataPointId", "changedAt");

-- AddForeignKey
ALTER TABLE "KPIDataPointHistory" ADD CONSTRAINT "KPIDataPointHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
