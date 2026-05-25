# P1 — Identity, Tenancy, RBAC Implementation Plan

| | |
|---|---|
| **Phase** | P1 — Identity, Tenancy, 18-Permission RBAC + Onboarding Stub |
| **Goal** | Register an org, complete a basic onboarding stub, manage users/roles/positions/units, every API call enforced by 18-permission RBAC, multi-tenant isolation enforced at 3 layers |
| **Effort** | ≈4 weeks solo |
| **Depends on** | P0 (foundation) |
| **Blocks** | All subsequent phases (everything needs auth + tenancy + RBAC) |
| **Spec reference** | §3.1, §3.2, §3.3, §3.10 (data), §4.1, §4.2, §4.3 (modules), §5 (multi-tenancy & permissions) |

## Why this phase matters

Auth + tenancy + RBAC are the cross-cutting concerns that every later phase depends on. Get these right and the rest of the build is straightforward; get them wrong and you'll be ripping out plumbing for months. **The cross-tenant fuzz harness landing in P1 is the safety net that catches accidental data leaks in every future phase.**

The PER_USER visibility helper that lands here (`buildKpiVisibilityWhere`) is the foundation for the entire KPI engine's row-level filtering in P2 — write it carefully, test it exhaustively (12 cases minimum: 3 scopes × 4 default roles).

## Exit criteria (all must be true to move to P2)

- [ ] Cross-tenant fuzz harness passes for all P1 endpoints (parameterized over 8+ resources × 4 verbs)
- [ ] e2e UC-01 (Login & Authentication) passes
- [ ] e2e UC-02 (Manage User Roles) passes
- [ ] e2e UC-11 (Manage Organization Settings) passes
- [ ] Full happy-path e2e passes: register org → skip wizard → invite user → role gating works → audit trail visible
- [ ] Multi-parent role hierarchy resolves correctly (BFS subordinate check with diamond/cycle/disconnect coverage)
- [ ] MFA TOTP: enroll → confirm → login flow works end-to-end
- [ ] Refresh-token reuse-detection: presenting a revoked-but-not-replaced token kills the entire chain
- [ ] Postgres RLS policies enforced on every tenant-scoped table (verified by a deliberate cross-tenant query without ALS context returning 0 rows)
- [ ] Custom-terminology rendering works (changing `roleLabel: "Crew"` on Organization → sidebar shows "Crew" instead of "Roles")
- [ ] 18-permission RBAC truth-table: 18 permissions × 4 default roles = 72 test cases all pass
- [ ] **12-case visibility helper test passes (3 KPI scopes × 4 default roles)** — required for §6 compliance even though KPI module is P2
- [ ] Tag `git tag p1-complete`

## Schema additions (Prisma)

Add the following models to `packages/db/prisma/schema.prisma`. After each batch, run `pnpm db:migrate -- --name <descriptive>` to create a migration.

### Migration: `001_identity_tenancy`

```prisma
enum TenantStatus { TRIAL ACTIVE SUSPENDED ARCHIVED PURGED }
enum OrgSizeTier { SMALL MEDIUM LARGE ENTERPRISE }
enum DataResidency { US EU APAC OTHER }
enum UserStatus { INVITED PENDING_VERIFICATION ACTIVE SUSPENDED ARCHIVED DELETED PURGED }
enum LoginAttemptStatus { SUCCESS INVALID_CREDENTIALS USER_NOT_FOUND USER_INACTIVE MFA_REQUIRED MFA_FAILED }

model Organization {
  id                    String          @id @default(cuid())
  name                  String
  slug                  String          @unique
  tenantStatus          TenantStatus    @default(TRIAL)
  sizeTier              OrgSizeTier?
  industry              String?
  type                  String?
  // Branding
  logoUrl               String?
  faviconUrl            String?
  primaryColor          String?
  secondaryColor        String?
  // Locale + fiscal
  timezone              String          @default("UTC")
  currency              String          @default("USD")
  locale                String          @default("en-US")
  supportedTimezones    String[]
  supportedCurrencies   String[]
  supportedLocales      String[]
  dateFormat            String          @default("YYYY-MM-DD")
  numberFormat          String          @default("en-US")
  weekStartsOn          Int             @default(0)  // Sunday
  fiscalCalendar        Json?
  // Terminology (8 fields)
  roleLabel             String          @default("Role")
  groupLabel            String          @default("Team")
  memberLabel           String          @default("Member")
  kpiLabel              String          @default("KPI")
  dashboardLabel        String          @default("Dashboard")
  scorecardLabel        String          @default("Scorecard")
  objectiveLabel        String          @default("Objective")
  taskLabel             String          @default("Task")
  // Compliance
  dataResidency         DataResidency   @default(US)
  complianceProfile     String[]
  // Per-org user custom fields definitions
  userCustomFieldDefs   Json?
  // Per-org password policy
  passwordPolicy        Json?
  // Billing
  planKey               String          @default("ENTERPRISE")
  planStartedAt         DateTime?
  planExpiresAt         DateTime?
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt
  // relations populated in later migrations
  @@index([tenantStatus])
}

model CustomDomain {
  id                String   @id @default(cuid())
  organizationId    String
  organization      Organization @relation(fields: [organizationId], references: [id])
  domain            String   @unique
  txtChallengeKey   String
  txtChallengeValue String
  verifiedAt        DateTime?
  lastCheckedAt     DateTime?
  lastCheckError    String?
  createdAt         DateTime @default(now())
  @@index([organizationId])
}

model User {
  id                  String         @id @default(cuid())
  organizationId      String
  organization        Organization   @relation(fields: [organizationId], references: [id])
  email               String
  emailVerifiedAt     DateTime?
  fullName            String
  passwordHash        String?  // nullable for SSO-only users
  status              UserStatus     @default(ACTIVE)
  // Optional fields
  avatarUrl           String?
  phone               String?
  secondaryEmail      String?
  language            String?
  timezone            String?
  customFields        Json?
  // RBAC + org
  roleId              String?
  managerId           String?
  positionId          String?
  // MFA
  mfaEnabled          Boolean        @default(false)
  mfaSecret           String?  // active TOTP secret
  mfaPendingSecret    String?  // during enrollment, before confirm
  mfaRecoveryHashes   String[]  // SHA-256 hashes of recovery codes; consumed = removed
  // Onboarding
  onboardingCompletedAt DateTime?
  notificationSettings Json?  // free-form per-user prefs
  // Lifecycle
  isActive            Boolean        @default(true)  // backward-compat field; status is source of truth
  invitedAt           DateTime?
  invitedById         String?
  archivedAt          DateTime?
  archivedById        String?
  purgedAt            DateTime?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
  @@unique([organizationId, email])
  @@index([organizationId, status])
  @@index([roleId])
  @@index([managerId])
}

model RefreshToken {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  hashedToken   String   @unique  // SHA-256
  deviceInfo    String?
  ipAddress     String?
  userAgent     String?
  expiresAt     DateTime
  revokedAt     DateTime?
  replacedById  String?  // rotation chain pointer
  createdAt     DateTime @default(now())
  @@index([userId, expiresAt])
}

model EmailVerificationToken {
  id          String   @id @default(cuid())
  userId      String
  hashedToken String   @unique
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime @default(now())
}

model PasswordResetToken {
  id          String   @id @default(cuid())
  userId      String
  hashedToken String   @unique
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime @default(now())
}

model LoginAttempt {
  id              String              @id @default(cuid())
  email           String
  organizationId  String?
  userId          String?
  status          LoginAttemptStatus
  reason          String?
  ipAddress       String?
  userAgent       String?
  createdAt       DateTime            @default(now())
  @@index([email, createdAt])
  @@index([organizationId, status, createdAt])
}

model PlatformAdmin {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  grantedAt DateTime @default(now())
  grantedBy String
}
```

### Migration: `002_rbac`

```prisma
enum PositionTrack { IC MANAGEMENT EXECUTIVE }
enum SubjectType { user role }

model RoleDefinition {
  id                  String   @id @default(cuid())
  organizationId      String
  organization        Organization @relation(fields: [organizationId], references: [id])
  name                String
  description         String?
  permissions         String[]  // PermissionKey enum values
  isAdmin             Boolean   @default(false)
  level               Int       @default(0)
  color               String?
  canAccessModules    String[]
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  @@unique([organizationId, name])
}

model RoleInheritance {
  id                    String   @id @default(cuid())
  organizationId        String
  parentRoleId          String
  childRoleId           String
  inheritsPermissions   Boolean  @default(true)
  createdAt             DateTime @default(now())
  @@unique([parentRoleId, childRoleId])
  @@index([childRoleId])
  @@index([organizationId])
}

model Position {
  id              String         @id @default(cuid())
  organizationId  String
  name            String
  level           Int            @default(0)
  track           PositionTrack?
  payGrade        String?
  description     String?
  orgUnitId       String?
  isActive        Boolean        @default(true)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  @@unique([organizationId, name])
}

model PermissionDelegation {
  id              String   @id @default(cuid())
  organizationId  String
  grantorUserId   String
  granteeUserId   String
  permissions     String[]   // empty array = inherit ALL of grantor's
  reason          String?
  validFrom       DateTime
  validTo         DateTime
  revokedAt       DateTime?
  createdAt       DateTime @default(now())
  @@index([granteeUserId, validFrom, validTo])
}

model ResourcePermission {
  id              String      @id @default(cuid())
  organizationId  String
  subjectType     SubjectType
  subjectId       String
  action          String      // verb e.g. "view", "edit", "delete"
  resourceType    String      // model name e.g. "kpi", "dashboard"
  resourceId      String
  grantedById     String
  expiresAt       DateTime?
  createdAt       DateTime    @default(now())
  @@unique([organizationId, subjectType, subjectId, action, resourceType, resourceId])
  @@index([subjectType, subjectId])
}
```

### Migration: `003_org_structure`

```prisma
enum OrgUnitStatus { PLANNED ACTIVE PAUSED ARCHIVED }
enum OrgUnitMemberRole { MEMBER MANAGER LEAD DEPUTY }
enum OrgUnitLeaveReason { TRANSFERRED PROMOTED LEFT_ORG STRUCTURE_CHANGE }

model OrgUnitDimension {
  id              String   @id @default(cuid())
  organizationId  String
  name            String
  isDefault       Boolean  @default(false)
  createdAt       DateTime @default(now())
  @@unique([organizationId, name])
}

model OrgUnitType {
  id                  String   @id @default(cuid())
  organizationId      String
  dimensionId         String?
  name                String
  namePlural          String
  icon                String?
  color               String?
  allowNesting        Boolean  @default(true)
  maxDepth            Int?
  allowedParentTypeIds String[]
  sortOrder           Int      @default(0)
  createdAt           DateTime @default(now())
  @@unique([organizationId, name])
}

model OrgUnit {
  id                  String         @id @default(cuid())
  organizationId      String
  orgUnitTypeId       String
  parentUnitId        String?
  name                String
  code                String?
  description         String?
  headUserId          String?
  status              OrgUnitStatus  @default(ACTIVE)
  visibilityInherits  Boolean        @default(true)
  effectiveFrom       DateTime?
  effectiveTo         DateTime?
  metadata            Json?
  isActive            Boolean        @default(true)  // backward-compat
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
  @@index([organizationId, status])
  @@index([parentUnitId])
}

model OrgUnitMember {
  id              String                @id @default(cuid())
  organizationId  String
  orgUnitId       String
  userId          String
  memberRole      OrgUnitMemberRole     @default(MEMBER)
  joinedAt        DateTime              @default(now())
  leftAt          DateTime?
  leaveReason     OrgUnitLeaveReason?
  @@unique([orgUnitId, userId])
  @@index([orgUnitId, leftAt])
  @@index([userId])
}

model OrgUnitNameHistory {
  id            String   @id @default(cuid())
  orgUnitId     String
  previousName  String
  changedById   String
  changedAt     DateTime @default(now())
  @@index([orgUnitId, changedAt])
}
```

### Migration: `004_audit_billing_governance`

```prisma
enum AuditAction { CREATE UPDATE DELETE LOGIN LOGOUT IMPORT EXPORT IMPERSONATE_START IMPERSONATE_END APPROVE REJECT }
enum CircuitBreakerMode { FAIL_CLOSED FALLBACK }

model AuditLog {
  id              String       @id @default(cuid())
  organizationId  String?  // null for platform-admin cross-tenant ops
  action          AuditAction
  entityType      String?
  entityId        String?
  changes         Json?  // {before, after} diff
  userId          String?
  userEmail       String?
  ipAddress       String?
  userAgent       String?
  metadata        Json?
  redactedKeys    String[]
  createdAt       DateTime     @default(now())
  @@index([organizationId, createdAt])
  @@index([entityType, entityId])
  @@index([userId, createdAt])
}

model Plan {
  id                String  @id @default(cuid())
  key               String  @unique  // FREE | PRO | ENTERPRISE
  displayName       String
  monthlyPriceUsd   Float   @default(0)
  annualPriceUsd    Float   @default(0)
  features          String[]
  quotas            Json
  isActive          Boolean @default(true)
  sortOrder         Int     @default(0)
  createdAt         DateTime @default(now())
}

model TenantQuota {
  id              String   @id @default(cuid())
  organizationId  String
  key             String   // e.g. "kpis.count", "data_points.monthly"
  limit           Int      // 0 = unlimited
  current         Int      @default(0)
  periodStart     DateTime
  periodEnd       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([organizationId, key])
}

model FeatureFlag {
  id              String   @id @default(cuid())
  organizationId  String
  key             String
  enabled         Boolean  @default(false)
  rolloutPercent  Int?
  createdAt       DateTime @default(now())
  @@unique([organizationId, key])
}

model CostMetric {
  id                  String   @id @default(cuid())
  organizationId      String
  day                 DateTime  // UTC day start
  kpiCount            Int      @default(0)
  dataPointsToday     Int      @default(0)
  alertsToday         Int      @default(0)
  aiInputTokens       Int      @default(0)
  aiOutputTokens      Int      @default(0)
  aiCostUsd           Float    @default(0)
  apiRequests         Int      @default(0)
  storageBytes        BigInt   @default(0)
  createdAt           DateTime @default(now())
  @@unique([organizationId, day])
}

model RetentionPolicy {
  id              String   @id @default(cuid())
  organizationId  String
  entityType      String
  days            Int
  isActive        Boolean  @default(true)
  lastRunAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([organizationId, entityType])
}
```

### Migration: `005_rls_policies`

Apply `packages/db/prisma/sql/rls-policies.sql` after the migrations. Policies template:

```sql
-- Enable RLS on every tenant-scoped table
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleDefinition" ENABLE ROW LEVEL SECURITY;
-- ... etc for every tenant-scoped table

-- Policy template (apply per table where the column is "organizationId")
CREATE POLICY tenant_isolation ON "User"
  USING (organization_id = current_setting('app.current_org', true)::text)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::text);

-- Allow superuser to bypass for migrations/admin
CREATE POLICY service_role_bypass ON "User"
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
```

Add Prisma middleware in `packages/db/src/index.ts` to set GUC on every connection checkout:
```typescript
const prisma = new PrismaClient();
prisma.$use(async (params, next) => {
  const ctx = RequestContextStore.get();
  if (ctx?.organizationId) {
    await prisma.$executeRawUnsafe(`SET LOCAL app.current_org = '${ctx.organizationId}'`);
  }
  return next(params);
});
```

## Backend modules to build

### Module 1: TenancyModule (`apps/api/src/tenancy/`)

**Files**: `tenancy.module.ts`, `request-context.ts`, `tenancy.interceptor.ts`, `request-context.spec.ts`

- [ ] `RequestContextStore` using `AsyncLocalStorage<RequestContext>` where `RequestContext = {userId, organizationId, roleId, sessionId, principalType, realOrganizationId?, apiKeyId?, apiKeyScopes?, tenantSlug?}`
- [ ] `RequestContextStore.run(ctx, fn)` to wrap async work
- [ ] `RequestContextStore.get()` returns current context or undefined
- [ ] `RequestContextStore.require()` throws if no context (use in services that MUST have tenant)
- [ ] `TenancyInterceptor` registered globally; after JwtAuthGuard, extracts claims from `req.user`, wraps handler in `RequestContextStore.run({...})`
- [ ] `runWithBypass(reason, fn)` for legitimate cross-tenant ops (platform admin)
- [ ] Unit tests: context propagation through async, throws on missing context, bypass works

### Module 2: AuthModule (`apps/api/src/auth/`)

**Files**: `auth.module.ts`, `auth.service.ts`, `auth.controller.ts`, `jwt.strategy.ts`, `services/refresh-token.service.ts`, `services/password.service.ts`, `auth.service.spec.ts`, `refresh-token.service.spec.ts`

- [ ] `AuthService.login({email, password, organizationId?, mfaCode?})` — returns `{accessToken, refreshToken, user, expiresIn}`
  - lookup user (within org scope or global if multi-org candidate)
  - bcrypt compare password
  - if mfaEnabled and no mfaCode → reject with `MFA_REQUIRED`
  - if mfaEnabled and bad mfaCode → reject with `MFA_FAILED`
  - persist `LoginAttempt` row
  - issue access JWT (15 min) + refresh token (30 days, SHA-256 hashed in DB)
- [ ] `AuthService.refresh({refreshToken})` — rotates: marks old `revokedAt` + `replacedById`, issues new pair
  - reuse-detection: if presented token has `revokedAt IS NOT NULL AND replacedById IS NULL`, revoke entire chain + return 401
- [ ] `AuthService.logout({refreshToken})` — marks token revoked
- [ ] `AuthService.registerOrganization({orgName, adminEmail, adminPassword, ...})` — transaction: create Org → create admin User → create default roles (Admin, Manager, Employee, Viewer) → assign admin User to Admin role → issue auth pair
- [ ] `AuthService.lookupOrgsForEmail(email)` — for multi-org login picker; returns list of orgs the email exists in (max 20, archived filtered)
- [ ] `AuthService.switchOrg(orgId)` — when user belongs to multiple orgs; mints fresh JWT scoped to new org
- [ ] `AuthService.acceptInvitation({token, password})` — validates token from `EmailVerificationToken`, validates against org password policy, flips status → ACTIVE, sets emailVerifiedAt
- [ ] Controller endpoints:
  - `POST /auth/login` (public)
  - `POST /auth/register` (public — first user creates org)
  - `POST /auth/refresh` (public, takes refresh cookie)
  - `POST /auth/logout` (authenticated)
  - `POST /auth/lookup-orgs` (public, email lookup)
  - `POST /auth/switch-org` (authenticated)
  - `POST /auth/accept-invitation` (public, takes token)
  - `GET /auth/me` (authenticated, returns user + permissions)
- [ ] `JwtAuthGuard` registered as APP_GUARD
  - verifies JWT
  - short-circuits to `ApiKeysService.verify()` if `Authorization: Bearer kpinx_*` (ApiKeys land in P4 but stub the branch)
  - `@Public()` decorator opt-out
- [ ] Unit tests:
  - login happy path, bad password, unknown user, inactive user, MFA required, MFA failed
  - refresh: rotation works, reuse-detection kills chain, expired token rejected
  - registerOrganization: creates all default roles, admin gets Admin role
  - acceptInvitation: validates token, applies password policy

### Module 3: PasswordModule (`apps/api/src/password/`)

**Files**: `password.module.ts`, `password.controller.ts`, `services/password-reset.service.ts`, `services/password-policy.ts`, `password-reset.service.spec.ts`

- [ ] `PasswordResetService.request({email})` — returns 202 regardless (privacy); for ACTIVE users, mints `base64url(32)` plaintext + SHA-256 hash with 1h expiry; sends email via EmailService (P1 uses Mailhog locally)
- [ ] `PasswordResetService.confirm({token, newPassword})` — verifies hash + expiry + not-consumed; validates against org passwordPolicy; updates passwordHash; marks token consumed; invalidates other outstanding reset tokens for user; revokes all refresh tokens
- [ ] `applyPasswordPolicy(password, policy)` helper — checks minLength, requireUpper/Lower/Digit/Special; throws ValidationException with field errors
- [ ] Controller:
  - `POST /auth/password/request-reset` (public)
  - `POST /auth/password/confirm-reset` (public)
- [ ] Unit tests: 8 cases covering happy path, expiry, double-consume, weak password, unknown email, password reuse rejection

### Module 4: MfaModule (`apps/api/src/mfa/`)

**Files**: `mfa.module.ts`, `mfa.controller.ts`, `mfa.service.ts`, `totp.ts` (pure-Node RFC 6238), `mfa.service.spec.ts`, `totp.spec.ts`

- [ ] `TotpService` — pure Node implementation:
  - `generateSecret(length=20)` → base32-encoded
  - `generateTOTP(secret, time?, step=30, digits=6)` → 6-digit code
  - `verifyTOTP(token, secret, window=±1)` → boolean
  - `generateOtpAuthURL({secret, account, issuer})` → `otpauth://...`
- [ ] `MfaService.enroll(userId)` — generates secret + 10 recovery codes; persists `mfaPendingSecret` + plaintext codes returned ONCE; SHA-256 hashes stored in `mfaRecoveryHashes` after confirm
- [ ] `MfaService.confirm(userId, code)` — verifies first TOTP code matches `mfaPendingSecret`, promotes to `mfaSecret`, sets `mfaEnabled=true`, clears `mfaPendingSecret`
- [ ] `MfaService.disable(userId, code)` — requires current TOTP or recovery code; clears `mfaSecret + mfaEnabled`
- [ ] `MfaService.verifyForLogin(userId, code)` — used by AuthService during login; checks recovery codes too (single-use, removed on consume)
- [ ] Controller:
  - `POST /mfa/enroll` (authenticated)
  - `POST /mfa/confirm` (authenticated)
  - `DELETE /mfa` (authenticated, requires current code)
- [ ] Unit tests:
  - TOTP RFC 6238 reference vectors (3-4 known test cases from the RFC)
  - enroll → confirm → verify flow
  - recovery code single-use semantics
  - drift window (±1 step accepted)
  - bad code rejected

### Module 5: PlatformAdminModule (`apps/api/src/platform-admin/`)

**Files**: `platform-admin.module.ts`, `platform-admin.controller.ts`, `platform-admin.service.ts`, `impersonation.service.ts`, `*.spec.ts`

- [ ] `PlatformAdminService.isPlatformAdmin(userId)` — boolean
- [ ] `PlatformAdminService.list()` — list platform admins (admin UI)
- [ ] `PlatformAdminService.grant(userId, grantedById)` — adds row
- [ ] `PlatformAdminService.revoke(userId)` — removes row
- [ ] `ImpersonationService.start(targetOrgId)` — checks `isPlatformAdmin`; validates target org; mints JWT with `realOrganizationId = caller's actual org` and `organizationId = target`; same 15-min TTL; writes IMPERSONATE_START audit
- [ ] `ImpersonationService.end()` — mints fresh non-impersonation JWT; writes IMPERSONATE_END audit
- [ ] Controller:
  - `POST /admin/impersonate {orgId}` (auth + platform-admin only)
  - `POST /admin/impersonate/end`
  - `GET /admin/platform-admins`, `POST /admin/platform-admins`, `DELETE /admin/platform-admins/:userId`

### Module 6: OrganizationsModule (`apps/api/src/organizations/`)

**Files**: `organizations.module.ts`, `organizations.controller.ts`, `organizations.service.ts`, `tenant-lifecycle.service.ts`, `tenant-lifecycle.guard.ts`, `services/tenant-export.service.ts`, `*.spec.ts`

- [ ] `OrganizationsService.getCurrent()` — returns full Organization
- [ ] `OrganizationsService.update(patch)` — validates terminology fields, fiscal calendar, password policy; emits audit
- [ ] `TenantLifecycleService.transition(orgId, nextStatus)` — state machine:
  - TRIAL → ACTIVE | SUSPENDED | ARCHIVED
  - ACTIVE → SUSPENDED | ARCHIVED
  - SUSPENDED → ACTIVE | ARCHIVED
  - ARCHIVED → PURGED
  - PURGED is terminal
  - invalidates `TenantLifecycleGuard` cache, enqueues BullMQ job (`tenant-lifecycle` queue) for cleanup
- [ ] `TenantLifecycleGuard` (APP_GUARD after JwtAuthGuard, before PermissionsGuard) — blocks ARCHIVED/PURGED entirely; allows only GET for SUSPENDED; 30s in-process cache
- [ ] BullMQ processor for tenant-lifecycle:
  - ON_SUSPEND: revoke all sessions + refresh tokens
  - ON_ARCHIVE: same + soft-delete KPIs + Dashboards (P2 dependency — stub for now)
  - ON_PURGE: redact org PII (name → `purged-org-<hash>`, slug/logo/etc. nulled); delete session/token/loginAttempt rows
- [ ] `TenantExportService.export({redactPii?, dataPointsLimit?})` — returns JSON envelope of every row tied to the org across the schema; PII redaction optional; schema label `kpi-nexus.tenant-export.v1`
- [ ] Controller:
  - `GET /organizations/current` (auth)
  - `PATCH /organizations/current` (ORG_SETTINGS)
  - `POST /organizations/:id/lifecycle/transition {status}` (platform-admin only)
  - `GET /organizations/export?redactPii=&dataPoints=` (ORG_SETTINGS)
- [ ] Unit tests: lifecycle state machine, terminology validation, export shape

### Module 7: CustomDomainModule (`apps/api/src/custom-domain/`)

- [ ] `CustomDomainService.register(domain)` — mints random 16-byte token + `_kpinexus-verify.<domain>` TXT key; persists CustomDomain row
- [ ] `CustomDomainService.verify(id)` — resolves TXT via `node:dns/promises`; constant-time compares; sets `verifiedAt + lastCheckedAt`; records `lastCheckError` on failure
- [ ] Controller: `GET/POST/DELETE /custom-domains`, `POST /custom-domains/:id/verify` (all ORG_SETTINGS)

### Module 8: UsersModule (`apps/api/src/users/`)

**Files**: `users.module.ts`, `users.controller.ts`, `users.service.ts`, `me-profile.controller.ts`, `me-sessions.controller.ts`, `services/invitation.service.ts`, `services/offboarding.service.ts`, `services/gdpr-export.service.ts`, `*.spec.ts`

- [ ] `UsersService.create({email, fullName, roleId, ...})` — mints invitation token, persists User with `status=INVITED`, sends invitation email (Mailhog in dev)
- [ ] `UsersService.resendInvitation(id)` — cycles token, consumes prior, re-sends email
- [ ] `UsersService.revokeInvitation(id)` — marks outstanding token consumed
- [ ] `UsersService.archive(userId)` — sets `status=ARCHIVED`, revokes refresh tokens, invalidates permission cache (soft-delete; 30-day restore window enforced by Retention)
- [ ] `UsersService.restore(userId)` — flips ARCHIVED → ACTIVE
- [ ] `UsersService.purge(userId)` — requires status=ARCHIVED first; PII redaction with deterministic `former-user-<sha256(orgId:userId).slice(0,12)>` handle; in transaction: overwrites email/fullName/phone/etc., anonymizes Comments (P7), nulls assignee/recordedBy refs (P2/P7), deletes all tokens/sessions; logs audit with redacted handle
- [ ] `OffboardingService.offboard(userId, {transferKpisTo?, reparentDirectReportsTo?, leaveReason?, archive?})` — single transaction: KPI ownership transfer → direct-report manager reparent → active OrgUnitMember rows closed with leaveReason → headUserId null on owning OrgUnits → open tasks unassigned (P7 dep) → optionally archive + revoke tokens. Pre-flight rejects cross-tenant + archived targets + self-reparent
- [ ] `GdprExportService.exportUser(userId)` — returns JSON envelope of every row tied to the user (orgUnitMemberships, kpiAssignments, kpiDataPoints, audit logs authored-by + about-user, comments, tasks, sessions, login attempts) with `passwordHash` redacted; logs EXPORT audit with record counts
- [ ] `MeProfileController` — `GET /me/profile`, `PATCH /me/profile` (avatar, phone, secondaryEmail, locale, timezone, customFields); validates customFields against org `userCustomFieldDefs`
- [ ] `MeSessionsController` — `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-all`
- [ ] Permissions on UsersController: List → USERS_VIEW; Create/Edit/Archive/Offboard → USERS_MANAGE; `/me/*` always self-accessible
- [ ] Unit tests:
  - invitation lifecycle (create → token → accept → ACTIVE)
  - resend cycles token, revoke consumes
  - archive → restore round trip
  - purge with PII redaction + deterministic handle stability
  - offboarding: happy path, no-target clear, archived-target reject, cross-tenant reject, self-reparent reject, PURGED reject, skip-archive opt-out
  - GDPR export shape + passwordHash redacted

### Module 9: RbacModule (`apps/api/src/rbac/`)

**Files**: `rbac.module.ts`, `permissions.guard.ts`, `decorators/require-permissions.ts`, `decorators/owner-override.ts`, `permission-cache.service.ts`, `permission-resolver.spec.ts`

- [ ] Define `Permission` enum in `packages/contracts/src/permissions.ts` with 18 values:
  ```typescript
  export const PERMISSIONS = [
    'KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DELETE', 'KPI_DATA_ENTRY',
    'DASHBOARD_VIEW', 'DASHBOARD_MANAGE',
    'USERS_VIEW', 'USERS_MANAGE', 'ROLES_MANAGE', 'POSITIONS_MANAGE',
    'GROUPS_VIEW', 'GROUPS_MANAGE',
    'ALERTS_VIEW',
    'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW',
    'ORG_SETTINGS',
  ] as const;
  export type Permission = (typeof PERMISSIONS)[number];
  ```
- [ ] `PERMISSION_PRESETS` constant with 4 curated sets: KPI Manager, Data Entry, People Manager, Auditor (used by RolesModule)
- [ ] `@RequirePermissions(...perms: Permission[])` decorator → metadata for guard (AND)
- [ ] `@RequireAnyPermission(...perms: Permission[])` decorator (OR)
- [ ] `@OwnerOverride({modelKey, paramName, ownerField})` decorator → guard falls back to owner check on denial
- [ ] `@Public()` decorator (already in AuthModule) for opting out entirely
- [ ] `PermissionCacheService.resolveForUser(userId)` — returns `Set<Permission>`:
  - if `isAdmin` → ALL_PERMISSIONS
  - layer in role direct + role inherited (BFS up RoleInheritance edges where `inheritsPermissions=true`; cycle-safe via visited Set)
  - layer in active PermissionDelegation rows (empty perms = inherit ALL of grantor)
  - DOES NOT add ResourcePermission to the cache (those are per-resource checks)
  - Redis cache with 5-min TTL keyed by userId; in-memory fallback
- [ ] `PermissionsGuard` (APP_GUARD):
  - reads `@RequirePermissions` / `@RequireAnyPermission` metadata
  - calls `resolveForUser` → checks
  - on denial: checks `@OwnerOverride` if present → loads entity by route param → checks `ownerField === ctx.userId` → allows
  - on denial: checks ResourcePermission via `ResourcePermissionsService.hasResourcePermission({userId, action, resourceType, resourceId})` → allows if granted + not expired
  - throws `ForbiddenException` otherwise
  - admin bypass (`isAdmin: true`) short-circuits everything
- [ ] **18 permissions × 4 default roles = 72 parameterized truth-table test cases** in `permissions.guard.spec.ts`
- [ ] Cache invalidation hooks: `PermissionCacheService.invalidate(userId)` called on role update / delegation create-revoke / resource permission add-remove

### Module 10: RolesModule (`apps/api/src/roles/`)

- [ ] `RolesService.create({name, permissions, isAdmin?, parentRoleIds?, ...})` — creates RoleDefinition + RoleInheritance rows for each parent
- [ ] `RolesService.update(id, patch)` — versioned: any permission change writes AuditLog with before/after
- [ ] `RolesService.delete(id)` — refuses if users assigned; refuses if it's the last Admin role
- [ ] `RolesService.applyPreset(roleId, presetKey, additive?)` — swaps in `PERMISSION_PRESETS[presetKey]`
- [ ] `RolesService.listForOrg()` + `resolveSubordinateRoleIds(roleId)` pure helper (BFS down RoleInheritance with diamond/cycle/disconnect coverage)
- [ ] Controller:
  - `GET /roles`, `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id` (ROLES_MANAGE for mutations)
  - `GET /roles/hierarchy` — BFS-built tree response
  - `GET /roles/presets/list` — returns `PERMISSION_PRESETS` for UI
  - `POST /roles/:id/apply-preset {presetKey, additive?}`
  - `GET /roles/:id/audit` — filters AuditLog for entityType=RoleDefinition + entityId
- [ ] Unit tests:
  - subordinate resolver: 8 cases (diamond inheritance, cycle, disconnect, single parent, multi-parent, self-reference rejection)
  - delete refusal when users assigned
  - delete refusal on last admin

### Module 11: PositionsModule (`apps/api/src/positions/`)

- [ ] Standard CRUD
- [ ] `applyPreset({presetKey, orgId})` — bulk-create from one of 5 industry presets (Tech/Healthcare/Finance/Retail/Non-profit); skips name collisions
- [ ] Endpoints: `GET/POST/PATCH/DELETE /positions`, `POST /positions/apply-preset` (POSITIONS_MANAGE)

### Module 12: PermissionDelegationsModule (`apps/api/src/permission-delegations/`)

- [ ] `PermissionDelegationsService.create({granteeUserId, permissions, validFrom, validTo, reason})` — validates grantor has all those perms; persists; schedules BullMQ delayed job `permission-delegation` at `validTo` to flip `revokedAt`
- [ ] `PermissionDelegationsService.revoke(id)` — flips `revokedAt = now()`
- [ ] BullMQ processor checks if delegation still exists + not yet revoked → revokes
- [ ] Resolver in PermissionCacheService layers in active delegations (validFrom ≤ now ≤ validTo, revokedAt null)
- [ ] Endpoints: `GET/POST/DELETE /permission-delegations` (USERS_MANAGE)
- [ ] Unit tests: empty perms = inherit ALL, delegation respects window, revoke immediately stops grant

### Module 13: ResourcePermissionsModule (`apps/api/src/resource-permissions/`)

- [ ] `ResourcePermissionsService.grant({subjectType, subjectId, action, resourceType, resourceId, expiresAt?})` — upsert with unique constraint
- [ ] `ResourcePermissionsService.revoke(id)`
- [ ] `ResourcePermissionsService.hasResourcePermission({userId, action, resourceType, resourceId})` — checks subject=user OR subject=role (via user.roleId); honors expiresAt
- [ ] Endpoints: `GET/POST/DELETE /resource-permissions` (USERS_MANAGE)

### Module 14: OrgUnitDimensionsModule (`apps/api/src/org-unit-dimensions/`)

- [ ] CRUD; lazy-seeds "Functional" default dimension on first list call
- [ ] Default switch: setting `isDefault=true` clears others
- [ ] Default protection: cannot delete the default
- [ ] Endpoints: `GET/POST/PATCH/DELETE /org-unit-dimensions` (GROUPS_MANAGE)

### Module 15: OrgUnitTypesModule (`apps/api/src/org-unit-types/`)

- [ ] CRUD with `allowedParentTypeIds` + `maxDepth` validation
- [ ] Endpoints: `GET/POST/PATCH/DELETE /org-unit-types` (GROUPS_MANAGE)

### Module 16: OrgUnitsModule (`apps/api/src/org-units/`)

**Files**: includes `org-units.controller.ts`, `org-units.service.ts`, plus `services/reorganization.service.ts`, `services/membership.service.ts`

- [ ] CRUD with parent-type-and-depth validation
- [ ] `moveUsers({sourceUnitId, targetUnitId, userIds[], leaveReason})` — soft-leaves source membership, upserts target with `@@unique([orgUnitId, userId])` reactivation; transaction
- [ ] `mergeUnits(sourceId, targetId, {leaveReason})` — moves all active members + archives source
- [ ] `splitUnit(sourceId, [{name, memberUserIds[]}], {archiveSource?, leaveReason?})` — creates same-typed children, distributes members
- [ ] `renameUnit(id, newName)` — writes `OrgUnitNameHistory` row in-transaction with the rename
- [ ] `listMembershipsByUser(userId)` — joins OrgUnit + OrgUnitType, sorts active-first; for `/users/[id]` page
- [ ] `descendantsVisibleToHead(rootUnitId)` BFS helper respecting `visibilityInherits=false` boundaries (used by §6 visibility filter in P2)
- [ ] Endpoints:
  - `GET/POST/PATCH/DELETE /org-units` (GROUPS_VIEW for read, GROUPS_MANAGE for mutate)
  - `POST /org-units/move-users`, `POST /org-units/:id/merge-into`, `POST /org-units/:id/split`, `POST /org-units/:id/rename`
  - `GET /org-units/:id/name-history`
  - `GET /org-units/by-user/:userId/memberships`
- [ ] Unit tests: 13 covering move/merge/split/rename happy + edge cases

### Module 17: AuditModule (`apps/api/src/audit/`)

**Files**: `audit.module.ts`, `audit.service.ts`, `audit.interceptor.ts`, `audit.controller.ts`, `cross-tenant-guard.service.ts`, `cross-tenant-audit-bridge.ts`, `*.spec.ts`

- [ ] `AuditService.log({action, entityType?, entityId?, changes?, metadata?, redactedKeys?})` — non-blocking persist
- [ ] PII redaction: deeply recursive denylist of sensitive keys (passwordHash, mfaSecret, hashedToken, encryptedTokens, etc.); stores redacted key names
- [ ] `AuditInterceptor` (APP_INTERCEPTOR) — on every successful POST/PATCH/PUT/DELETE (skip GETs, `/auth/*`, anonymous): writes a coarse audit row with method + path + statusCode
- [ ] `CrossTenantGuardService.assertScopedToContext(rowOrgId, callerLabel)` — compares row's orgId vs `RequestContextStore.get()?.organizationId`; emits WARN log on mismatch; returns violation row
- [ ] `runWithBypass(reason, fn)` — re-entrant; downgrades log to INFO; tags audit metadata `bypassReason`
- [ ] `CrossTenantAuditBridge` — routes violations to AuditLog with `metadata: {kind: "cross_tenant_violation", ...}`
- [ ] Controller: `GET /audit-logs?entityType=&entityId=&userId=&action=&from=&to=&limit=&offset=`, `GET /audit-logs/:id`
- [ ] Unit tests: 7+ covering redaction (nested), bypass stack cleanup on throw, violation routing

### Module 18: BillingModule (schema-ready, UI placeholder)

- [ ] `BillingService.seedPlansIfEmpty()` lazy seeds FREE/PRO/ENTERPRISE (FYP demos default ENTERPRISE with unlimited quotas)
- [ ] `BillingService.assertWithinQuota(key, delta, orgId?)` — throws ForbiddenException when increment would exceed limit; limit=0 = unlimited
- [ ] `BillingService.record(key, delta)` — bumps `TenantQuota.current`
- [ ] `BillingService.hasFeature(key)` — checks org FeatureFlag override → falls back to plan default
- [ ] `BillingService.setPlan(planKey)` — syncs TenantQuota.limit to new plan's quotas; preserves current
- [ ] Cost telemetry daily aggregate (BullMQ cron `15 0 * * *` UTC — wired in P5 when AI lands)
- [ ] Endpoints:
  - `GET /billing/plans` (auth)
  - `GET /billing/usage` (auth)
  - `POST /billing/plan {planKey}` (ORG_SETTINGS)
  - `GET /billing/features/:key` (auth)
  - `GET /billing/cost-telemetry?days=30` (ORG_SETTINGS)
- [ ] Unit tests: 9 covering seed, assert, record, setPlan, hasFeature, usage

### Module 19: RateLimitModule (`apps/api/src/rate-limit/`)

- [ ] `RateLimitService` — Redis ZSET sliding window with in-memory deque fallback
- [ ] `RateLimitGuard` (APP_GUARD between TenantLifecycleGuard and PermissionsGuard):
  - `/auth/*` → 10 hits/60s by IP
  - all other authed routes → 600 hits/60s by orgId
  - 429 with `retryAfter` seconds
- [ ] Unit tests: allow/reject, window slide, key scoping, resetSeconds

### Module 20: HealthModule (extended from P0)

- [ ] `HealthDetailsService.snapshot()` returns `{status, uptimeSeconds, components: [{name, ok, latencyMs, detail?}], process: {nodeVersion, rss, heapTotal, heapUsed}}`
- [ ] Treats db + redis as required (down → overall DOWN); ml-sidecar as optional (down → DEGRADED)
- [ ] `GET /health` (public, simple 200/503)
- [ ] `GET /health/details` (public, detailed)

## Frontend (Next.js App Router)

### App shell
- [ ] `apps/web/src/app/(app)/layout.tsx` — server-rendered layout with sidebar + header, requires authenticated session
- [ ] `apps/web/src/components/AppSidebar.tsx` — permission-filtered nav, org switcher, impersonation banner, user menu
- [ ] `apps/web/src/components/AppHeader.tsx` — page title, breadcrumb, search (⌘K stub), alerts bell (badge stub), theme toggle
- [ ] `apps/web/src/components/OrgSwitcher.tsx` — server component reading auth context, dropdown if user has >1 org
- [ ] `apps/web/src/components/ImpersonationBanner.tsx` — amber banner shown when `impersonate_token` cookie present

### Auth flow
- [ ] `apps/web/src/lib/auth.ts` — auth context provider; reads token + permissions from server-side cookies; 5-min refresh interval
- [ ] `apps/web/src/components/auth/LoginForm.tsx` — multi-step: email → org pick (if multi) → password (+ MFA if enabled); "Remember me" toggle
- [ ] `apps/web/src/components/auth/RegisterForm.tsx` — org name + admin email/password
- [ ] `apps/web/src/components/auth/PasswordResetForm.tsx` — request + confirm pages
- [ ] `apps/web/src/components/auth/MfaEnrollmentForm.tsx` — QR + verify
- [ ] Auth pages (no app shell):
  - `apps/web/src/app/(auth)/login/page.tsx`
  - `apps/web/src/app/(auth)/register/page.tsx`
  - `apps/web/src/app/(auth)/password/request/page.tsx`
  - `apps/web/src/app/(auth)/password/confirm/[token]/page.tsx`
  - `apps/web/src/app/(auth)/accept-invitation/[token]/page.tsx`
  - `apps/web/src/app/(auth)/mfa-required/page.tsx`
  - `apps/web/src/app/(auth)/unauthorized/page.tsx`

### Route guards (client + server)
- [ ] `<ProtectedRoute>` — server-side check via getServerSession; redirects to /login
- [ ] `<RequirePermission permission="X">` — checks user permission array; redirects to /unauthorized
- [ ] `<RequireAnyPermission permissions={["X","Y"]}>` — or-guard
- [ ] `<PermissionGuard permission="X" fallback={null}>` — soft fallback (hide element)

### Pages
- [ ] `/` — placeholder home (real adaptive home lands in P2 when KPIs exist)
- [ ] `/settings` — tab layout with sub-routes: organization / branding / custom-domain / locale / fiscal / terminology / password-policy
- [ ] `/settings/organization` — name, logo, type, industry, sizeTier
- [ ] `/settings/branding` — colors, favicon
- [ ] `/settings/custom-domain` — DNS TXT verification flow + last-checked diagnostics
- [ ] `/settings/locale` — timezone, currency, locale, formats
- [ ] `/settings/fiscal` — fiscal calendar editor (JSON UI)
- [ ] `/settings/terminology` — 8 label fields with live preview
- [ ] `/settings/password-policy` — minLength, complexity toggles
- [ ] `/users` — DataTable with status filter, role assignment, position assignment; inline create sheet
- [ ] `/users/[id]` — profile, memberships side panel, audit timeline, custom fields editor, "Reset password" / "Resend invite" / "Archive" / "Offboard" actions
- [ ] `/users/[id]/offboard` — server-action page with active-user pickers for transfer/reparent
- [ ] `/me` — identity / contact / locale / custom fields editor; theme toggle; password change; MFA enroll
- [ ] `/me/sessions` — list active sessions with revoke
- [ ] `/me/preferences` — notification settings (digest mode placeholder for P4)
- [ ] `/roles` — role list + permission count + "Used by N users"
- [ ] `/roles/new` — form (name + permissions + parent roles + isAdmin + color)
- [ ] `/roles/[id]` — detail + permission matrix + members list
- [ ] `/roles/[id]/audit` — permission change timeline with green/red diff lines
- [ ] `/roles/matrix` — `<RoleMatrix>` client component: permissions × roles grid with per-row bulk all/none, admin cells disabled, ringed-highlight on changed cells, pending-changes side panel, save sends only PATCH'd roles
- [ ] `/roles/hierarchy` — SVG visualization (blue=permission-stacking edges, dashed=reports-to-only)
- [ ] `/roles/presets` — preset cards with badges + apply form
- [ ] `/positions` — CRUD
- [ ] `/positions/presets` — industry preset cards + apply
- [ ] `/org-units` — tree view + flat table
- [ ] `/org-units/chart` — SVG layered tree with print stylesheet
- [ ] `/org-units/dimensions` — dimension CRUD + default switch
- [ ] `/org-units/reorganize` — Move / Merge / Rename / Split server-action forms
- [ ] `/audit` — log viewer with filters (entityType/action/date/user) + JSON change diff drill-in
- [ ] `/billing` — placeholder: plan card + usage bars + "Upgrade" details popover
- [ ] `/admin/impersonate` — UUID-paste start form (platform admin only)
- [ ] `/status` — public health page with per-component dots + latency
- [ ] **`/signup/wizard` — basic onboarding wizard stub** (5 routes: organization, structure, roles, kpis, team); just forms posting to `/onboarding/*` endpoints; AI + templates + drafts come in P6

### Custom-terminology rendering
- [ ] `apps/web/src/lib/terminology.ts` — in-memory 30s cache; smart pluralization (regex rules + irregular dict); reads from current org
- [ ] Wire into AppSidebar nav, /kpis page header, /users page header, /roles page header

## Cross-tenant fuzz harness (P1 deliverable)

**File**: `apps/api/test/cross-tenant.e2e.spec.ts`

- [ ] Parameterized over `[resource, verb]` matrix (8 resources × 4 verbs):
  - Resources: user, role, position, orgUnit, orgUnitType, orgUnitDimension, customDomain, auditLog
  - Verbs: GET (single), LIST, PATCH, DELETE
- [ ] Setup: creates two orgs (orgA, orgB), each with admin + sample data
- [ ] Test: for every cell, attempts to access orgB's resource using orgA's JWT → must receive 404 or 403 (NEVER 200)
- [ ] Bonus: audit log isolation — orgA's audit log must not contain orgB events
- [ ] Bonus: JWT-guard check — request without auth → 401 for every endpoint
- [ ] Runs in CI on every PR via `apps/api/test/`

## 12-case visibility helper test (P1 deliverable, even though KPI is P2)

**File**: `apps/api/src/rbac/visibility-helper.spec.ts`

Even before P2 builds the KPI module, write the visibility helper test infrastructure so P2 can fill in the assertions:

- [ ] Mock setup: 3 KPI scope values (ORG_WIDE, PER_UNIT, PER_USER) × 4 role types (Admin, Manager, Employee, Viewer) = 12 cases
- [ ] For each: assert `buildKpiVisibilityWhere(ctx)` returns the correct Prisma `where` fragment shape
- [ ] Stub the helper return shape; P2 fills in the actual logic
- [ ] This test must NOT pass during P1 (since helper doesn't exist yet) — it's a placeholder ensuring P2 implements it

Alternatively, defer this entire test to P2 — but it's listed here because the spec §6 says it's required for the visibility model.

## e2e tests

- [ ] `apps/web/e2e/uc01-login.spec.ts` — anon redirect to login, successful login, bad-password error, sign out
- [ ] `apps/web/e2e/uc02-roles.spec.ts` — permission matrix renders, role create + delete via UI
- [ ] `apps/web/e2e/uc11-org-settings.spec.ts` — name + timezone/currency/locale + role/kpi label updates with reload-persistence
- [ ] `apps/web/e2e/full-happy-path.spec.ts` — register via API → skip onboarding → invite via UI → audit visible → role-gating verified

## Acceptance checklist

```bash
# 1. All unit tests pass
pnpm test
# Expect: AuthService ≥95%, RBAC guard 72 cases, refresh rotation, MFA TOTP, audit redaction, etc.

# 2. Integration tests pass
pnpm test:int
# Expect: full registration → user creation → role assignment → permission check works against real Postgres

# 3. Cross-tenant fuzz green
pnpm --filter @kpi-nexus/api test:e2e -- cross-tenant.e2e.spec.ts
# Expect: 8 resources × 4 verbs = 32 isolation cases pass

# 4. e2e Playwright
pnpm --filter @kpi-nexus/web test:e2e
# Expect: UC-01, UC-02, UC-11, full-happy-path all green

# 5. Manual smoke
# a. Register a new org via UI
# b. Receive invitation email in Mailhog (:8025)
# c. Accept invitation → set password → login
# d. Enroll MFA → logout → login with MFA code → succeeds
# e. Edit org terminology (roleLabel="Crew") → sidebar shows "Crew"
# f. Create a custom role → permission matrix → assign to user → user sees correct nav items
# g. Impersonate another org as platform admin → see amber banner → end → return to own org

# 6. Postgres RLS verification
psql ... -c "SET app.current_org = 'orgA'; SELECT * FROM \"User\" WHERE organization_id = 'orgB';"
# Expect: 0 rows (RLS blocks even when WHERE explicitly targets orgB)

# 7. CI green on push
# All matrix jobs pass
```

Tag `git tag p1-complete` when all 7 steps verify.

## Gotchas + notes

- **Bcrypt rounds**: use 12 in prod, 10 in tests for speed
- **JWT secret rotation**: kid in header so multi-key support is possible later
- **Cookie security**: httpOnly + secure (prod only) + sameSite=lax + domain set to apex
- **CSRF**: SameSite=lax + double-submit cookie pattern for sensitive mutations; or use Auth.js
- **Cross-tenant fuzz**: use fast-check for property-based variant later; for P1, parameterized table-driven test is sufficient
- **RLS performance**: setting GUC per query has a small overhead; use connection pool with prepared statements to minimize
- **Prisma + RLS**: Prisma 6 supports RLS but you must explicitly SET LOCAL each query — middleware handles this
- **Multi-org login**: if email exists in multiple orgs, UI shows picker before password step; don't pre-resolve org during email step (avoids enumeration)
- **MFA recovery codes**: show plaintext ONCE; never store plaintext after enrollment confirms
- **Custom-terminology cache invalidation**: when org settings update, broadcast SSE `org_settings_updated` event so client cache rebuilds

## Out of scope for P1

- KPI engine (P2)
- Dashboards (P3)
- Alerts (P4)
- AI features (P5)
- Full onboarding wizard with AI co-pilot (P6 — P1 only has a basic stub)
- Comments, Tasks, OKRs (P7)
- Integrations (P8)
- SSO/SCIM (P9)
- The actual KPI visibility helper logic (the 12-case test infrastructure lands here, but the helper itself ships in P2)

## What comes next

Once P1 is tagged complete, open `docs/superpowers/plans/P2-kpi-engine.md`. P2 is the biggest phase (~5 weeks) — it builds the actual KPI engine with formulas, cascades, targets, thresholds, and the TimescaleDB hypertable.
