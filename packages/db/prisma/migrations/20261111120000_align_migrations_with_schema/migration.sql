-- Align the migration history with schema.prisma (OT-011).
--
-- Production builds its database with `prisma migrate deploy`; local dev uses
-- `db push`. Hand-written migrations had added database defaults that the
-- schema does not declare (`updatedAt` is set by Prisma on every write; the
-- array columns are always written explicitly), and no migration created the
-- timescaledb extension the schema lists. Dropping the defaults makes a
-- migrated database identical to a pushed one; nothing relies on them.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- AlterTable
ALTER TABLE "AiBudget" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AiFeatureConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AiProvider" ALTER COLUMN "supportedFeatures" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AlertRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ApiKey" ALTER COLUMN "scopes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ApprovalWorkflow" ALTER COLUMN "requiredApproverRoleIds" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "mentionedUserIds" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EscalationRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IntegrationConnection" ALTER COLUMN "scopes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "KPITarget" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "KPITemplate" ALTER COLUMN "tags" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NotificationChannel" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OnboardingAIInteraction" ALTER COLUMN "appliedSections" DROP DEFAULT,
ALTER COLUMN "editedSections" DROP DEFAULT,
ALTER COLUMN "rejectedSections" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OnboardingSession" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ScheduledReport" ALTER COLUMN "kpiIds" DROP DEFAULT,
ALTER COLUMN "recipients" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserAccessOverride" ALTER COLUMN "grantCapabilities" DROP DEFAULT,
ALTER COLUMN "revokeCapabilities" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WebhookSubscription" ALTER COLUMN "events" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Workflow" ALTER COLUMN "triggers" DROP DEFAULT;

