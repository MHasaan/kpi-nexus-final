import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { AuthService, type AuthPair } from '../auth/auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export interface VerifiedSsoProfile {
  orgSlug: string;
  email: string;
  fullName: string;
}

/**
 * SSO login completion. The SAML assertion / OIDC code exchange is handled by
 * the IdP integration (WorkOS-backed) and yields a verified profile; this
 * service maps it to a tenant user — logging in an existing user or JIT-
 * provisioning a new one — and issues the JWT pair. No raw assertion parsing
 * here keeps the security-sensitive crypto in the managed provider.
 */
@Injectable()
export class SsoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async handleVerifiedLogin(profile: VerifiedSsoProfile): Promise<AuthPair> {
    // Pre-auth: the org is resolved from the IdP profile (by slug) and the user
    // looked up / JIT-provisioned before any session exists — run under the
    // RLS bypass, like password login (OT-014).
    return RequestContextStore.runWithBypass('sso-login', () => this.loginVerified(profile));
  }

  private async loginVerified(profile: VerifiedSsoProfile): Promise<AuthPair> {
    const org = await this.prisma.organization.findFirst({ where: { slug: profile.orgSlug }, select: { id: true } });
    if (!org) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Organization not found' });

    const config = await this.prisma.ssoConfig.findUnique({
      where: { organizationId: org.id },
      select: { isActive: true, allowJitProvisioning: true, defaultRoleId: true },
    });
    if (!config || !config.isActive) {
      throw new ForbiddenException({ code: 'SSO_INACTIVE', message: 'SSO is not enabled for this organization' });
    }

    let user = await this.prisma.user.findFirst({
      where: { organizationId: org.id, email: profile.email.toLowerCase() },
      select: { id: true, roleId: true },
    });

    if (!user) {
      if (!config.allowJitProvisioning) {
        throw new UnauthorizedException({ code: 'NO_JIT', message: 'User not provisioned and JIT provisioning is disabled' });
      }
      user = await this.prisma.user.create({
        data: {
          organizationId: org.id,
          email: profile.email.toLowerCase(),
          fullName: profile.fullName,
          status: 'ACTIVE',
          roleId: config.defaultRoleId,
          emailVerifiedAt: new Date(),
        },
        select: { id: true, roleId: true },
      });
    }

    const isAdmin = user.roleId
      ? Boolean((await this.prisma.roleDefinition.findFirst({ where: { id: user.roleId }, select: { isAdmin: true } }))?.isAdmin)
      : false;

    return this.auth.issueTokensForUser({ userId: user.id, organizationId: org.id, roleId: user.roleId ?? '', isAdmin });
  }
}
