# Seed task progress (Northwind Software)

## Goal
Write idempotent `packages/db/prisma/seed.ts` seeding org `northwind`, run + verify it.
Spec: `docs/design-reference/SAMPLE-ORG-SPEC.md` (read in full). Write result to
`docs/design-reference/SAMPLE-ORG-RESULT.md`. Branch: feat/frontend-design (stay, don't touch apps/web).

## Schema facts CONFIRMED (from schema.prisma lines 118-1354)
- Organization: name, slug@unique, sizeTier(OrgSizeTier: SMALL/MEDIUM/LARGE/ENTERPRISE), industry?, type?,
  timezone, currency, locale, weekStartsOn Int (Mon=1), planKey STRING default "ENTERPRISE" (NOT enum!),
  terminology labels have defaults. tenantStatus default TRIAL -> set ACTIVE.
- RoleDefinition: organizationId, name, permissions String[], isAdmin, level Int, color?, @@unique([org,name])
- Position: organizationId, name, level, track(PositionTrack: IC/MANAGEMENT/EXECUTIVE), @@unique([org,name])
- OrgUnitDimension: org, name, isDefault, @@unique([org,name])
- OrgUnitType: org, dimensionId?, name, namePlural(REQUIRED), icon?, color?, sortOrder, @@unique([org,name])
- OrgUnit: org, orgUnitTypeId(REQ), parentUnitId?, name, code?, headUserId?, status(OrgUnitStatus ACTIVE), @@unique NONE on name (use find)
- OrgUnitMember: org, orgUnitId, userId, memberRole(OrgUnitMemberRole MEMBER/MANAGER/LEAD/DEPUTY), @@unique([orgUnitId,userId])
- User: org, email, fullName, passwordHash?, status(UserStatus ACTIVE), roleId?, managerId?, positionId?, isActive. @@unique([org,email])
- KPICategory: org, name, color?, icon?, sortOrder, @@unique([org,name])
- KPI: org, categoryId?, name, unit?, scope(KPIScope ORG_WIDE/PER_UNIT/PER_USER), type(KPIType NUMBER/PERCENTAGE/CURRENCY/DURATION/COUNT/RATING/BOOLEAN),
  direction(KPIDirection HIGHER_IS_BETTER/LOWER_IS_BETTER/TARGET_IS_BEST/NEUTRAL), frequency(KPIFrequency MONTHLY),
  aggregationMethod(AggregationMethod SUM/AVG/LAST/COUNT...), status(KPIStatus ACTIVE), targetValue?, warningThreshold?, criticalThreshold?,
  ownerUserId?, createdById?, @@unique([org,name])
- KPIAssignmentOrgUnit: org, kpiId, orgUnitId, targetValue?, currentValue?, status?(String), @@unique([kpiId,orgUnitId])
- KPIAssignmentUser: org, kpiId, userId, targetValue?, currentValue?, status?(String), @@unique([kpiId,userId])
- KPIDataPoint: COMPOSITE PK @@id([recordedAt,id]); fields: id(default cuid), organizationId, kpiId, orgUnitId?, userId?,
  value Float(REQ), unit?, periodStart(REQ), periodEnd(REQ), recordedAt(default now), recordedById?, sourceType(DataPointSourceType MANUAL/INGESTION/COMPUTED/INTEGRATION),
  qualityFlag(DataPointQualityFlag HIGH/MEDIUM/LOW), note?, isOutlier. Scope routing: ORG_WIDE both null; PER_UNIT orgUnitId; PER_USER userId.
- KPITarget: org, kpiId, type(KPITargetType STATIC...), value?, createdById(REQ String), effectiveFrom?
- KPIThresholdBand: org, kpiId, name, lower?, upper?, color(REQ), order(REQ Int), createdById(REQ)
- Dashboard: org, name, ownerUserId?, isShared, isDefault, layout? ; DashboardWidget: org, dashboardId, widgetType, title?, config Json(REQ), position Json(REQ), sortOrder

## STILL NEED TO CONFIRM (next session - DO FIRST)
1. Password hashing: check `apps/api/src/auth/**` for bcrypt vs bcryptjs vs argon2 + rounds. Reuse EXACT lib+params.
   Check root + packages/db package.json for which lib is installed (so seed can import it).
2. demo-data.service.ts datapoint create shape (sourceType field name etc.) - read it.
3. permissions.ts: the 18 PermissionKey enum string values (need exact strings for role.permissions arrays).
4. Existing seed.ts content + packages/db/package.json scripts (prisma:seed = tsx prisma/seed.ts?) + import style (@prisma/client).
5. DATABASE_URL location (apps/api/.env or root .env or packages/db/.env).

## Run steps
- docker compose up -d (start Docker Desktop if needed: Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe")
- pnpm --filter @kpi-nexus/db prisma:generate ; cd packages/db && npx prisma migrate deploy (NO reset)
- typecheck: pnpm --filter @kpi-nexus/db typecheck OR cd packages/db && npx tsc --noEmit
- run: cd packages/db && npx tsx prisma/seed.ts  ; run AGAIN to confirm idempotent no-op
- login: admin@northwind.io / Password123!

## Deviations noted so far
- planKey is a STRING (default ENTERPRISE), not a PlanKey enum. Spec said PlanKey enum -> use string "PRO" or "BUSINESS" (check Plan table keys; spec fallback FREE). Will use "PRO".
- weekStartsOn is Int; Monday = 1.
