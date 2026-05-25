import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { RequestContext } from '../tenancy/request-context.js';

export interface JwtPayload {
  /** subject = userId */
  sub: string;
  /** organizationId */
  org: string;
  /** roleId or null */
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
  constructor(config: ConfigService) {
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
   */
  validate(payload: JwtPayload): RequestContext {
    if (!payload.sub || !payload.org) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Malformed JWT' });
    }
    return {
      userId: payload.sub,
      organizationId: payload.org,
      roleId: payload.rid,
      sessionId: payload.sid,
      principalType: 'user',
    };
  }
}
