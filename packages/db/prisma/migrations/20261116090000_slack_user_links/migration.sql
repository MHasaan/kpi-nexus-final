-- Slack users linked to KPI Nexus accounts (via a signed link from /kpi), so
-- the slash command answers as that person. Tenant FK as in OT-016; RLS by the
-- generic rule.

-- CreateTable
CREATE TABLE "SlackUserLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackUserLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlackUserLink_organizationId_idx" ON "SlackUserLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackUserLink_slackTeamId_slackUserId_key" ON "SlackUserLink"("slackTeamId", "slackUserId");

-- AddForeignKey
ALTER TABLE "SlackUserLink" ADD CONSTRAINT "SlackUserLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
