-- Point-in-time entity snapshots (entityType 'KPI' first): the payload holds
-- what the taker could read, so a snapshot is shown to its taker and admins
-- only. Tenant FK as in OT-016; RLS by the generic rule.

-- CreateTable
CREATE TABLE "DataSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "takenById" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataSnapshot_organizationId_entityType_entityId_takenAt_idx" ON "DataSnapshot"("organizationId", "entityType", "entityId", "takenAt");

-- AddForeignKey
ALTER TABLE "DataSnapshot" ADD CONSTRAINT "DataSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
