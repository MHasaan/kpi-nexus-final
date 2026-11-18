import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { ALL_PERMISSIONS } from '@kpi-nexus/contracts';

import { AuditService } from '../../audit/audit.service.js';
import {
  checkPasswordPolicy,
  resolvePasswordPolicy,
} from '../../password/password-policy.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionResolverService } from '../../rbac/services/permission-resolver.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { RefreshTokenService } from './refresh-token.service.js';

/**
 * Public user shape returned by self-service endpoints — mirrors the `user`
 * object of `GET /auth/me` (identity + status + resolved permissions).
 */
export interface SelfUser {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  roleId: string | null;
  mfaEnabled: boolean;
  status: string;
  notificationSettings: unknown;
  /** When this person finished (or skipped) the first-login tour; null until then. */
  onboardingCompletedAt: Date | null;
  permissions: string[];
}

const selfUserSelect = {
  id: true,
  email: true,
  fullName: true,
  organizationId: true,
  roleId: true,
  mfaEnabled: true,
  status: true,
  notificationSettings: true,
  onboardingCompletedAt: true,
  language: true,
  timezone: true,
} as const;

/**
 * Self-service account operations for the current authenticated principal.
 *
 * Every method operates strictly on `ctx.userId` within `ctx.organizationId`
 * — a user can only act on themselves. No `@RequirePermissions` gating; these
 * are intentionally available to any authenticated user.
 */
@Injectable()
export class AccountService {
  private readonly bcryptRounds = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Update what a person may change about themself: their display name, and
   * the mark that they have seen the first-login tour (kept on the account so
   * it follows them across browsers and is not shared with whoever signs in
   * next on the same one), and the language the app is shown in for them.
   */
  async updateProfile(input: { fullName?: string; tourCompleted?: true; language?: string; timezone?: string | null }): Promise<SelfUser> {
    const ctx = RequestContextStore.require();

    const updated = await this.prisma.user.update({
      where: { id: ctx.userId, organizationId: ctx.organizationId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.tourCompleted ? { onboardingCompletedAt: new Date() } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        // null clears it: times go back to the organisation's timezone.
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
      select: selfUserSelect,
    });

    if (input.fullName !== undefined) {
      await this.audit.record({
        action: 'UPDATE',
        entityType: 'User',
        entityId: ctx.userId,
        changes: { fullName: input.fullName },
      });
    }

    return this.withPermissions(updated);
  }

  /**
   * Change the current user's password.
   *
   * Verifies `currentPassword` against the stored bcrypt hash (same primitive
   * login uses), validates `newPassword` against the org password policy
   * (same as the reset-confirm flow), re-hashes, and revokes every other
   * session — forcing re-login on all devices.
   */
  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const ctx = RequestContextStore.require();

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId, organizationId: ctx.organizationId },
      select: {
        id: true,
        passwordHash: true,
        organization: { select: { passwordPolicy: true } },
      },
    });

    // No local password (SSO-only) → cannot "change" one here.
    if (!user.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
      });
    }

    const currentOk = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
      });
    }

    const policy = resolvePasswordPolicy(user.organization.passwordPolicy);
    const violations = checkPasswordPolicy(input.newPassword, policy);
    if (violations.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Password does not meet policy',
        details: { violations },
      });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, this.bcryptRounds);

    await this.prisma.user.update({
      where: { id: ctx.userId, organizationId: ctx.organizationId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    // Force re-login on every device after a credential change.
    await this.refreshTokens.revokeAllForUser(ctx.userId);

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'User',
      entityId: ctx.userId,
      metadata: { passwordChanged: true },
    });
  }

  private async withPermissions(user: Omit<SelfUser, 'permissions'>): Promise<SelfUser> {
    const resolved = await this.permissionResolver.resolveForCurrentPrincipal();
    const permissions: string[] = resolved.isAdmin
      ? [...ALL_PERMISSIONS]
      : [...resolved.permissions];
    return { ...user, permissions };
  }
}
