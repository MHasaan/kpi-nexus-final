import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';

export interface JwtPayload {
  /** subject = userId */
  sub: string;
  /** organizationId */
  org: string;
  /** roleId or null, as it was when the token was issued. Not what requests are answered under: see `validate`. */
  rid: string | null;
  /** is admin (denormalized for fast guard checks) */
  adm: boolean;
  /** session id (optional, used for token revocation by session) */
  sid?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET must be set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Passport sets the return value on `req.user`. We shape it as the
   * `RequestContext` consumed by TenancyInterceptor.
   *
   * The role is the one the person holds now, read from the database, not the
   * copy in the token. A token lives 15 minutes; with its copy, someone demoted
   * kept their old rights until it was renewed. By the owner's decision
   * (2026-11-19) a changed role takes effect at once: one small read per
   * request, and everything that asks "what role is this?" gets the true answer.
   */
  async validate(payload: JwtPayload): Promise<RequestContext> {
    if (!payload.sub || !payload.org) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Malformed JWT' });
    }
    return {
      userId: payload.sub,
      organizationId: payload.org,
      roleId: await this.currentRoleId(payload),
      sessionId: payload.sid,
      principalType: 'user',
    };
  }

  /** The person's role as it is now; the token's own copy only if they cannot be found. */
  private async currentRoleId(payload: JwtPayload): Promise<string | null> {
    // No request context exists yet (this is what creates it), so the read is made as the platform.
    const user = await RequestContextStore.runWithBypass('jwt-current-role', () =>
      this.prisma.user.findFirst({
        where: { id: payload.sub, organizationId: payload.org },
        select: { roleId: true },
      }),
    );
    return user ? user.roleId : payload.rid;
  }
}
