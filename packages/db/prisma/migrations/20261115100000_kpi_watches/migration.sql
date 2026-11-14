-- KPI watches: a user's chosen events on a KPI. Each event raises a personal
-- LOW alert, checked against what the watcher may see. Tenant FK as in OT-016;
-- RLS by the generic rule. Alert.isPersonal marks those notices: only their
-- target sees them.

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "KPIWatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "events" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPIWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KPIWatch_organizationId_kpiId_idx" ON "KPIWatch"("organizationId", "kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "KPIWatch_userId_kpiId_key" ON "KPIWatch"("userId", "kpiId");

-- AddForeignKey
ALTER TABLE "KPIWatch" ADD CONSTRAINT "KPIWatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
