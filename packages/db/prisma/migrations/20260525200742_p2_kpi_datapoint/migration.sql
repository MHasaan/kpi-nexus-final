-- CreateEnum
CREATE TYPE "DataPointSourceType" AS ENUM ('MANUAL', 'INGESTION', 'COMPUTED', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "DataPointQualityFlag" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "KPIDataPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "userId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "sourceType" "DataPointSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,
    "qualityFlag" "DataPointQualityFlag" NOT NULL DEFAULT 'HIGH',
    "note" TEXT,
    "metadata" JSONB,

    CONSTRAINT "KPIDataPoint_pkey" PRIMARY KEY ("recordedAt","id")
);

-- CreateIndex
CREATE INDEX "KPIDataPoint_organizationId_kpiId_periodStart_idx" ON "KPIDataPoint"("organizationId", "kpiId", "periodStart");

-- CreateIndex
CREATE INDEX "KPIDataPoint_organizationId_orgUnitId_periodStart_idx" ON "KPIDataPoint"("organizationId", "orgUnitId", "periodStart");

-- CreateIndex
CREATE INDEX "KPIDataPoint_organizationId_userId_periodStart_idx" ON "KPIDataPoint"("organizationId", "userId", "periodStart");

-- AddForeignKey
ALTER TABLE "KPIDataPoint" ADD CONSTRAINT "KPIDataPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIDataPoint" ADD CONSTRAINT "KPIDataPoint_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIDataPoint" ADD CONSTRAINT "KPIDataPoint_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIDataPoint" ADD CONSTRAINT "KPIDataPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIDataPoint" ADD CONSTRAINT "KPIDataPoint_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
