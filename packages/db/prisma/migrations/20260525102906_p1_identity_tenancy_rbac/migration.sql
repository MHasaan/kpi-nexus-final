-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PURGED');

-- CreateEnum
CREATE TYPE "OrgSizeTier" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "DataResidency" AS ENUM ('US', 'EU', 'APAC', 'OTHER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED', 'DELETED', 'PURGED');

-- CreateEnum
CREATE TYPE "LoginAttemptStatus" AS ENUM ('SUCCESS', 'INVALID_CREDENTIALS', 'USER_NOT_FOUND', 'USER_INACTIVE', 'MFA_REQUIRED', 'MFA_FAILED');

-- CreateEnum
CREATE TYPE "PositionTrack" AS ENUM ('IC', 'MANAGEMENT', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "ResourceSubjectType" AS ENUM ('user', 'role');

-- CreateEnum
CREATE TYPE "OrgUnitStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrgUnitMemberRole" AS ENUM ('MEMBER', 'MANAGER', 'LEAD', 'DEPUTY');

-- CreateEnum
CREATE TYPE "OrgUnitLeaveReason" AS ENUM ('TRANSFERRED', 'PROMOTED', 'LEFT_ORG', 'STRUCTURE_CHANGE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'IMPORT', 'EXPORT', 'IMPERSONATE_START', 'IMPERSONATE_END', 'APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tenantStatus" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "sizeTier" "OrgSizeTier",
    "industry" TEXT,
    "type" TEXT,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "supportedTimezones" TEXT[],
    "supportedCurrencies" TEXT[],
    "supportedLocales" TEXT[],
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "numberFormat" TEXT NOT NULL DEFAULT 'en-US',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 0,
    "fiscalCalendar" JSONB,
    "roleLabel" TEXT NOT NULL DEFAULT 'Role',
    "groupLabel" TEXT NOT NULL DEFAULT 'Team',
    "memberLabel" TEXT NOT NULL DEFAULT 'Member',
    "kpiLabel" TEXT NOT NULL DEFAULT 'KPI',
    "dashboardLabel" TEXT NOT NULL DEFAULT 'Dashboard',
    "scorecardLabel" TEXT NOT NULL DEFAULT 'Scorecard',
    "objectiveLabel" TEXT NOT NULL DEFAULT 'Objective',
    "taskLabel" TEXT NOT NULL DEFAULT 'Task',
    "dataResidency" "DataResidency" NOT NULL DEFAULT 'US',
    "complianceProfile" TEXT[],
    "userCustomFieldDefs" JSONB,
    "passwordPolicy" JSONB,
    "planKey" TEXT NOT NULL DEFAULT 'ENTERPRISE',
    "planStartedAt" TIMESTAMP(3),
    "planExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "txtChallengeKey" TEXT NOT NULL,
    "txtChallengeValue" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatarUrl" TEXT,
    "phone" TEXT,
    "secondaryEmail" TEXT,
    "language" TEXT,
    "timezone" TEXT,
    "customFields" JSONB,
    "roleId" TEXT,
    "managerId" TEXT,
    "positionId" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaPendingSecret" TEXT,
    "mfaRecoveryHashes" TEXT[],
    "onboardingCompletedAt" TIMESTAMP(3),
    "notificationSettings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "status" "LoginAttemptStatus" NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "level" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "canAccessModules" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleInheritance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentRoleId" TEXT NOT NULL,
    "childRoleId" TEXT NOT NULL,
    "inheritsPermissions" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleInheritance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "track" "PositionTrack",
    "payGrade" TEXT,
    "description" TEXT,
    "orgUnitId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionDelegation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grantorUserId" TEXT NOT NULL,
    "granteeUserId" TEXT NOT NULL,
    "permissions" TEXT[],
    "reason" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourcePermission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectType" "ResourceSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourcePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnitDimension" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgUnitDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnitType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dimensionId" TEXT,
    "name" TEXT NOT NULL,
    "namePlural" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "allowNesting" BOOLEAN NOT NULL DEFAULT true,
    "maxDepth" INTEGER,
    "allowedParentTypeIds" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgUnitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orgUnitTypeId" TEXT NOT NULL,
    "parentUnitId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "headUserId" TEXT,
    "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibilityInherits" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnitMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberRole" "OrgUnitMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "leaveReason" "OrgUnitLeaveReason",

    CONSTRAINT "OrgUnitMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnitNameHistory" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "previousName" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgUnitNameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "changes" JSONB,
    "userId" TEXT,
    "userEmail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "redactedKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "monthlyPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "features" TEXT[],
    "quotas" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantQuota" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "kpiCount" INTEGER NOT NULL DEFAULT 0,
    "dataPointsToday" INTEGER NOT NULL DEFAULT 0,
    "alertsToday" INTEGER NOT NULL DEFAULT 0,
    "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "apiRequests" INTEGER NOT NULL DEFAULT 0,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_tenantStatus_idx" ON "Organization"("tenantStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");

-- CreateIndex
CREATE INDEX "CustomDomain_organizationId_idx" ON "CustomDomain"("organizationId");

-- CreateIndex
CREATE INDEX "User_organizationId_status_idx" ON "User"("organizationId", "status");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_hashedToken_key" ON "RefreshToken"("hashedToken");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_hashedToken_key" ON "EmailVerificationToken"("hashedToken");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_hashedToken_key" ON "PasswordResetToken"("hashedToken");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_organizationId_status_createdAt_idx" ON "LoginAttempt"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleDefinition_organizationId_name_key" ON "RoleDefinition"("organizationId", "name");

-- CreateIndex
CREATE INDEX "RoleInheritance_childRoleId_idx" ON "RoleInheritance"("childRoleId");

-- CreateIndex
CREATE INDEX "RoleInheritance_organizationId_idx" ON "RoleInheritance"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleInheritance_parentRoleId_childRoleId_key" ON "RoleInheritance"("parentRoleId", "childRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_organizationId_name_key" ON "Position"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PermissionDelegation_granteeUserId_validFrom_validTo_idx" ON "PermissionDelegation"("granteeUserId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "ResourcePermission_subjectType_subjectId_idx" ON "ResourcePermission"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourcePermission_organizationId_subjectType_subjectId_act_key" ON "ResourcePermission"("organizationId", "subjectType", "subjectId", "action", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnitDimension_organizationId_name_key" ON "OrgUnitDimension"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnitType_organizationId_name_key" ON "OrgUnitType"("organizationId", "name");

-- CreateIndex
CREATE INDEX "OrgUnit_organizationId_status_idx" ON "OrgUnit"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrgUnit_parentUnitId_idx" ON "OrgUnit"("parentUnitId");

-- CreateIndex
CREATE INDEX "OrgUnitMember_orgUnitId_leftAt_idx" ON "OrgUnitMember"("orgUnitId", "leftAt");

-- CreateIndex
CREATE INDEX "OrgUnitMember_userId_idx" ON "OrgUnitMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnitMember_orgUnitId_userId_key" ON "OrgUnitMember"("orgUnitId", "userId");

-- CreateIndex
CREATE INDEX "OrgUnitNameHistory_orgUnitId_changedAt_idx" ON "OrgUnitNameHistory"("orgUnitId", "changedAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TenantQuota_organizationId_key_key" ON "TenantQuota"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_organizationId_key_key" ON "FeatureFlag"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CostMetric_organizationId_day_key" ON "CostMetric"("organizationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_organizationId_entityType_key" ON "RetentionPolicy"("organizationId", "entityType");

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RoleDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleDefinition" ADD CONSTRAINT "RoleDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleInheritance" ADD CONSTRAINT "RoleInheritance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleInheritance" ADD CONSTRAINT "RoleInheritance_parentRoleId_fkey" FOREIGN KEY ("parentRoleId") REFERENCES "RoleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleInheritance" ADD CONSTRAINT "RoleInheritance_childRoleId_fkey" FOREIGN KEY ("childRoleId") REFERENCES "RoleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionDelegation" ADD CONSTRAINT "PermissionDelegation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePermission" ADD CONSTRAINT "ResourcePermission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitDimension" ADD CONSTRAINT "OrgUnitDimension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitType" ADD CONSTRAINT "OrgUnitType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitType" ADD CONSTRAINT "OrgUnitType_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "OrgUnitDimension"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_orgUnitTypeId_fkey" FOREIGN KEY ("orgUnitTypeId") REFERENCES "OrgUnitType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentUnitId_fkey" FOREIGN KEY ("parentUnitId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitMember" ADD CONSTRAINT "OrgUnitMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitMember" ADD CONSTRAINT "OrgUnitMember_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitMember" ADD CONSTRAINT "OrgUnitMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnitNameHistory" ADD CONSTRAINT "OrgUnitNameHistory_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantQuota" ADD CONSTRAINT "TenantQuota_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostMetric" ADD CONSTRAINT "CostMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
