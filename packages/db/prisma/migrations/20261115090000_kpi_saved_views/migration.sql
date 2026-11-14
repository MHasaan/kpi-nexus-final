-- Saved KPI-list filter sets. Filters only, so a shared view never widens
-- what a viewer sees. Tenant FK as in OT-016; RLS by the generic rule.

-- CreateTable
CREATE TABLE "KPISavedView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KPISavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KPISavedView_organizationId_isShared_idx" ON "KPISavedView"("organizationId", "isShared");

-- CreateIndex
CREATE UNIQUE INDEX "KPISavedView_organizationId_userId_name_key" ON "KPISavedView"("organizationId", "userId", "name");

-- AddForeignKey
ALTER TABLE "KPISavedView" ADD CONSTRAINT "KPISavedView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
