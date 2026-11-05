import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { Prisma } from '@kpi-nexus/db';
import type {
  AccessProfile,
  DataLimitsConfig,
  DataTypeConfig,
  PageAccessConfig,
  PermissionKey,
  ScopeConfig,
  UserAccessOverride,
} from '@kpi-nexus/contracts';

import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../email/email.service.js';
import { escapeHtml } from '../email/escape-html.js';
import { webAppUrl } from '../email/web-app-url.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { InviteUserDto } from './dto/invite-user.dto.js';
import { purgedHandle } from './services/purge-handle.js';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roleId: string | null;
  managerId: string | null;
  positionId: string | null;
  createdAt: Date;
}

export interface InviteResult {
  user: PublicUser;
  /** Plaintext token — only included when NODE_ENV !== 'production'. */
  inviteToken?: string;
  /** Frontend accept-invitation URL — only when NODE_ENV !== 'production'. */
  acceptUrl?: string;
  /** Whether the invitation email was handed to the mail server. */
  emailSent: boolean;
}

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  roleId: true,
  managerId: true,
  positionId: true,
  createdAt: true,
} as const;

/** Public projection of a user's access override (Phase 5). */
export interface PublicAccessOverride {
  userId: string;
  grantCapabilities: string[];
  revokeCapabilities: string[];
  scopeConfig: ScopeConfig | null;
  dataTypeConfig: DataTypeConfig | null;
  dataLimits: DataLimitsConfig | null;
  pageAccess: PageAccessConfig | null;
  updatedById: string | null;
  updatedAt: Date;
}

const accessOverrideSelect = {
  userId: true,
  grantCapabilities: true,
  revokeCapabilities: true,
  scopeConfig: true,
  dataTypeConfig: true,
  dataLimits: true,
  pageAccess: true,
  updatedById: true,
  updatedAt: true,
} as const;

type AccessOverrideRow = Prisma.UserAccessOverrideGetPayload<{ select: typeof accessOverrideSelect }>;

/** Narrow Prisma's JsonValue config columns to their typed contract shapes. */
function toPublicAccessOverride(row: AccessOverrideRow): PublicAccessOverride {
  return {
    ...row,
    scopeConfig: (row.scopeConfig as ScopeConfig | null) ?? null,
    dataTypeConfig: (row.dataTypeConfig as DataTypeConfig | null) ?? null,
    dataLimits: (row.dataLimits as DataLimitsConfig | null) ?? null,
    pageAccess: (row.pageAccess as PageAccessConfig | null) ?? null,
  };
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PermissionResolverService,
    private readonly accessContext: AccessContextService,
    private readonly email: EmailService,
  ) {}

  /** People the caller may see (PEOPLE scope, BE-004); everyone at the ORG default. */
  async list(): Promise<PublicUser[]> {
    const ctx = RequestContextStore.require();
    const visible = await this.accessContext.visiblePeopleIds();
    return this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId, ...(visible ? { id: { in: visible } } : {}) },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string): Promise<PublicUser> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: userSelect,
    });
    // Out-of-scope people are a 404, as if absent (BE-004). Self is always visible.
    if (!user || !(await this.accessContext.isPersonVisible(id))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    return user;
  }

  /**
   * 404 unless `userId` is a user in the caller's org that the caller may see
   * (PEOPLE scope). Guards every per-user management action, so a scoped
   * USERS_MANAGE holder manages only the people they can see (BE-004).
   */
  async assertPersonVisible(userId: string): Promise<void> {
    await this.requireUserInTenant(userId);
  }

  // ---------------------------------------------------------------------------
  // Per-user access override (Phase 5) + resolved-access preview (Phase 6)
  // ---------------------------------------------------------------------------

  /**
   * Resolve a TARGET user's full effective AccessProfile ("what can this user see?").
   * Runs the resolver under the target's request context (same pattern as embed/
   * share-link/scheduled-report). USERS_MANAGE-gated at the controller — it exposes
   * another user's effective permissions/scope/limits.
   */
  async getAccessProfile(userId: string): Promise<AccessProfile> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { roleId: true },
    });
    if (!user || !(await this.accessContext.isPersonVisible(userId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    return RequestContextStore.run(
      { userId, organizationId: ctx.organizationId, roleId: user.roleId, principalType: 'user' },
      () => this.accessContext.resolveForCurrentPrincipal(),
    ) as Promise<AccessProfile>;
  }

  /** The user's access override, or null when none is set. Org-scoped. */
  async getAccessOverride(userId: string): Promise<PublicAccessOverride | null> {
    const ctx = RequestContextStore.require();
    await this.requireUserInTenant(userId);
    const ov = await this.prisma.userAccessOverride.findFirst({
      where: { organizationId: ctx.organizationId, userId },
      select: accessOverrideSelect,
    });
    return ov ? toPublicAccessOverride(ov) : null;
  }

  /**
   * Upsert a user's access override (USERS_MANAGE). Tenant-validates any category ids,
   * persists, audits, and invalidates BOTH the permission + access caches for that user
   * so the new grant/revoke + scope/limits take effect immediately.
   */
  async upsertAccessOverride(
    userId: string,
    dto: UserAccessOverride,
  ): Promise<PublicAccessOverride> {
    const ctx = RequestContextStore.require();
    await this.requireUserInTenant(userId);

    // Privilege-escalation guard: a non-admin manager may only GRANT capabilities they
    // themselves hold (admins hold everything). Prevents a USERS_MANAGE holder from
    // minting a higher privilege (e.g. BILLING_MANAGE) onto another user via the override.
    if (dto.grantCapabilities.length > 0) {
      const caller = await this.resolver.resolveForUser(
        ctx.organizationId,
        ctx.userId,
        ctx.roleId,
      );
      if (!caller.isAdmin) {
        const escalated = dto.grantCapabilities.filter(
          (c) => !caller.permissions.has(c as PermissionKey),
        );
        if (escalated.length > 0) {
          throw new ForbiddenException({
            code: 'FORBIDDEN',
            message: `Cannot grant capabilities you do not hold: ${escalated.join(', ')}`,
          });
        }
      }
    }

    // Tenant-validate the override's KPI category allowlist (mirrors RolesService).
    const categoryIds = dto.dataTypeConfig?.kpiCategoryIds;
    if (categoryIds && categoryIds.length > 0) {
      const found = await this.prisma.kPICategory.findMany({
        where: { id: { in: categoryIds }, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (found.length !== new Set(categoryIds).size) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'dataTypeConfig.kpiCategoryIds contains unknown categories',
        });
      }
    }

    const data = {
      grantCapabilities: dto.grantCapabilities,
      revokeCapabilities: dto.revokeCapabilities,
      scopeConfig: dto.scopeConfig ?? undefined,
      dataTypeConfig: dto.dataTypeConfig ?? undefined,
      dataLimits: dto.dataLimits ?? undefined,
      pageAccess: dto.pageAccess ?? undefined,
      updatedById: ctx.userId,
    };
    const ov = await this.prisma.userAccessOverride.upsert({
      // Composite selector ⇒ the org is part of the unique key (DB-level tenant safety).
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
      create: { organizationId: ctx.organizationId, userId, ...data },
      update: data,
      select: accessOverrideSelect,
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'UserAccessOverride',
      entityId: userId,
      changes: { grant: dto.grantCapabilities, revoke: dto.revokeCapabilities },
    });
    this.invalidateAccessCaches(ctx.organizationId, userId);
    return toPublicAccessOverride(ov);
  }

  /** Clear a user's access override (revert to pure role access). Org-scoped. */
  async deleteAccessOverride(userId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.requireUserInTenant(userId);
    await this.prisma.userAccessOverride.deleteMany({
      where: { organizationId: ctx.organizationId, userId },
    });
    this.invalidateAccessCaches(ctx.organizationId, userId);
  }

  private async requireUserInTenant(userId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!user || !(await this.accessContext.isPersonVisible(userId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
  }

  /** Both caches key on org:user — invalidate per-user so the override applies at once. */
  private invalidateAccessCaches(organizationId: string, userId: string): void {
    this.resolver.invalidate(organizationId, userId);
    this.accessContext.invalidate(organizationId, userId);
  }

  /**
   * Suspend an ACTIVE/INVITED user — blocks sign-in without losing their data
   * or org links (reversible via reactivate). Refuses self-suspension and any
   * user already in a terminal/offboarded state (ARCHIVED/DELETED/PURGED).
   */
  async suspend(userId: string): Promise<PublicUser> {
    const ctx = RequestContextStore.require();
    if (userId === ctx.userId) {
      throw new BadRequestException({ code: 'SELF_SUSPEND', message: 'You cannot suspend yourself' });
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!user || !(await this.accessContext.isPersonVisible(userId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    if (user.status === 'ARCHIVED' || user.status === 'DELETED' || user.status === 'PURGED') {
      throw new BadRequestException({
        code: 'NOT_SUSPENDABLE',
        message: `User is ${user.status} and cannot be suspended`,
        details: { status: user.status },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { status: 'SUSPENDED' },
        select: userSelect,
      });
      await tx.refreshToken.deleteMany({ where: { userId } });
      return u;
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'User',
      entityId: userId,
      metadata: { suspend: true, fromStatus: user.status },
    });
    return updated;
  }

  /**
   * Reactivate a SUSPENDED user — restores status to ACTIVE. NotFound if the
   * user isn't in the org; BadRequest if the user isn't currently SUSPENDED.
   */
  async reactivate(userId: string): Promise<PublicUser> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!user || !(await this.accessContext.isPersonVisible(userId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    if (user.status !== 'SUSPENDED') {
      throw new BadRequestException({
        code: 'NOT_SUSPENDED',
        message: `User is ${user.status}, not SUSPENDED`,
        details: { status: user.status },
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
      select: userSelect,
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'User',
      entityId: userId,
      metadata: { reactivate: true },
    });
    return updated;
  }

  /**
   * GDPR hard-purge: requires the user already be ARCHIVED (offboard first).
   * Redacts PII to a deterministic, non-reversible handle, drops all auth
   * tokens, and nulls the user's recorded-by data-point references. Audited
   * with the redacted handle only — no PII in the log.
   */
  async purge(userId: string): Promise<{ handle: string }> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!user || !(await this.accessContext.isPersonVisible(userId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    if (user.status !== 'ARCHIVED') {
      throw new UnprocessableEntityException({
        code: 'NOT_ARCHIVED',
        message: 'User must be ARCHIVED (offboarded) before it can be purged',
        details: { status: user.status },
      });
    }

    const handle = purgedHandle(ctx.organizationId, userId);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `${handle}@purged.local`,
          fullName: 'Former User',
          phone: null,
          secondaryEmail: null,
          passwordHash: null,
          mfaSecret: null,
          status: 'PURGED',
          managerId: null,
        },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.kPIDataPoint.updateMany({ where: { organizationId: ctx.organizationId, recordedById: userId }, data: { recordedById: null } }),
    ]);

    await this.audit.record({
      action: 'DELETE',
      entityType: 'User',
      entityId: userId,
      metadata: { gdprPurge: true, handle },
      redactedKeys: ['email', 'fullName', 'phone'],
    });
    return { handle };
  }

  /**
   * Invite a user — creates the User in INVITED status (no passwordHash yet)
   * and mints a single-use EmailVerificationToken. In non-production env we
   * return the plaintext token + accept URL on the response so the FE / e2e
   * can drive the accept flow without scraping the api log. Production omits
   * those fields; the email handoff goes through EmailService when that
   * module lands.
   */
  async invite(dto: InviteUserDto): Promise<InviteResult> {
    const ctx = RequestContextStore.require();

    if (dto.roleId) {
      const role = await this.prisma.roleDefinition.findFirst({
        where: { id: dto.roleId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!role) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'roleId is invalid or belongs to another tenant',
        });
      }
    }
    if (dto.positionId) {
      const position = await this.prisma.position.findFirst({
        where: { id: dto.positionId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!position) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'positionId is invalid or belongs to another tenant',
        });
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: ctx.organizationId, email: dto.email } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A user with this email already exists in this organization',
      });
    }

    const plaintext = randomBytes(32).toString('base64url');
    const hashedToken = this.hash(plaintext);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const { user } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: ctx.organizationId,
          email: dto.email,
          fullName: dto.fullName,
          status: 'INVITED',
          roleId: dto.roleId,
          positionId: dto.positionId,
          invitedAt: new Date(),
          invitedById: ctx.userId,
        },
        select: userSelect,
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          hashedToken,
          expiresAt,
        },
      });
      return { user };
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: 'invited', email: dto.email },
    });

    const link = webAppUrl(`/accept-invitation?token=${encodeURIComponent(plaintext)}`);
    const emailSent = await this.sendInviteEmail(user.id, dto.email, link, expiresAt);

    const isDev = process.env.NODE_ENV !== 'production';
    return {
      user,
      inviteToken: isDev ? plaintext : undefined,
      acceptUrl: isDev ? link : undefined,
      emailSent,
    };
  }

  /** Emails the accept link (never logged). Returns false if delivery failed. */
  private async sendInviteEmail(userId: string, to: string, link: string, expiresAt: Date): Promise<boolean> {
    const ctx = RequestContextStore.require();
    const [org, inviter] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { name: true } }),
      ctx.userId ? this.prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true } }) : null,
    ]);
    const orgName = org?.name ?? 'your organization';
    const who = inviter?.fullName ? `${inviter.fullName} has` : "You've been";
    try {
      await this.email.send({
        to,
        subject: `You're invited to ${orgName} on KPI Nexus`,
        html:
          `<p>${escapeHtml(who)} invited you to join <strong>${escapeHtml(orgName)}</strong> on KPI Nexus.</p>` +
          `<p><a href="${escapeHtml(link)}">Accept the invitation</a></p>` +
          `<p>This link expires on ${expiresAt.toUTCString()}.</p>`,
        text: `${who} invited you to join ${orgName} on KPI Nexus.\nAccept: ${link}\nExpires: ${expiresAt.toUTCString()}`,
      });
      return true;
    } catch (err) {
      this.logger.warn(`invitation email failed (user ${userId}): ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
