-- CreateEnum
CREATE TYPE "KPIStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'PAUSED', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KPIScope" AS ENUM ('ORG_WIDE', 'PER_UNIT', 'PER_USER');

-- CreateEnum
CREATE TYPE "KPIType" AS ENUM ('NUMBER', 'PERCENTAGE', 'CURRENCY', 'DURATION', 'COUNT', 'RATING', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "KPIDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_IS_BEST', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "KPIFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM', 'REAL_TIME', 'AD_HOC');

-- CreateEnum
CREATE TYPE "AggregationMethod" AS ENUM ('SUM', 'AVG', 'MIN', 'MAX', 'MEDIAN', 'P25', 'P75', 'P90', 'P95', 'P99', 'LAST', 'FIRST', 'COUNT', 'COUNT_DISTINCT', 'STDEV');

-- CreateTable
CREATE TABLE "KPICategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPICategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPI" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "scope" "KPIScope" NOT NULL DEFAULT 'ORG_WIDE',
    "type" "KPIType" NOT NULL DEFAULT 'NUMBER',
    "direction" "KPIDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
    "frequency" "KPIFrequency" NOT NULL DEFAULT 'MONTHLY',
    "aggregationMethod" "AggregationMethod" NOT NULL DEFAULT 'LAST',
    "status" "KPIStatus" NOT NULL DEFAULT 'DRAFT',
    "targetValue" DOUBLE PRECISION,
    "warningThreshold" DOUBLE PRECISION,
    "criticalThreshold" DOUBLE PRECISION,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "KPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIVersion" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPIVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIAssignmentOrgUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPIAssignmentOrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIAssignmentUser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPIAssignmentUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KPICategory_organizationId_idx" ON "KPICategory"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "KPICategory_organizationId_name_key" ON "KPICategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "KPI_organizationId_status_deletedAt_idx" ON "KPI"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "KPI_categoryId_idx" ON "KPI"("categoryId");

-- CreateIndex
CREATE INDEX "KPI_scope_idx" ON "KPI"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "KPI_organizationId_name_key" ON "KPI"("organizationId", "name");

-- CreateIndex
CREATE INDEX "KPIVersion_kpiId_idx" ON "KPIVersion"("kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "KPIVersion_kpiId_version_key" ON "KPIVersion"("kpiId", "version");

-- CreateIndex
CREATE INDEX "KPIAssignmentOrgUnit_organizationId_idx" ON "KPIAssignmentOrgUnit"("organizationId");

-- CreateIndex
CREATE INDEX "KPIAssignmentOrgUnit_orgUnitId_idx" ON "KPIAssignmentOrgUnit"("orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "KPIAssignmentOrgUnit_kpiId_orgUnitId_key" ON "KPIAssignmentOrgUnit"("kpiId", "orgUnitId");

-- CreateIndex
CREATE INDEX "KPIAssignmentUser_organizationId_idx" ON "KPIAssignmentUser"("organizationId");

-- CreateIndex
CREATE INDEX "KPIAssignmentUser_userId_idx" ON "KPIAssignmentUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KPIAssignmentUser_kpiId_userId_key" ON "KPIAssignmentUser"("kpiId", "userId");

-- AddForeignKey
ALTER TABLE "KPICategory" ADD CONSTRAINT "KPICategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KPICategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIVersion" ADD CONSTRAINT "KPIVersion_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIAssignmentOrgUnit" ADD CONSTRAINT "KPIAssignmentOrgUnit_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIAssignmentOrgUnit" ADD CONSTRAINT "KPIAssignmentOrgUnit_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIAssignmentUser" ADD CONSTRAINT "KPIAssignmentUser_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIAssignmentUser" ADD CONSTRAINT "KPIAssignmentUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
