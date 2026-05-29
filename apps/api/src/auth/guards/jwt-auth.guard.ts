import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../../rbac/decorators/public.decorator.js';
import type { RequestContext } from '../../tenancy/request-context.js';
import { ApiKeysService } from '../../api-keys/api-keys.service.js';

const API_KEY_BEARER_PREFIX = 'Bearer kpinx_';

/**
 * Global auth gate. `@Public()` opts out. After validation, `req.user` holds
 * the RequestContext that TenancyInterceptor reads.
 *
 * Two principal types are supported:
 *   - JWT bearer (passport 'jwt' strategy) → principalType 'user'
 *   - API key bearer (`Authorization: Bearer kpinx_...`) → principalType
 *     'api_key'; verified via ApiKeysService and short-circuits passport.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | undefined>;
      user?: RequestContext;
    }>();
    const authz = request.headers?.authorization ?? '';
    if (authz.startsWith(API_KEY_BEARER_PREFIX)) {
      const plaintext = authz.slice('Bearer '.length);
      const verified = await this.apiKeys.verify(plaintext);
      if (!verified) {
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Invalid or expired API key',
        });
      }
      request.user = {
        userId: verified.apiKeyId,
        organizationId: verified.organizationId,
        roleId: null,
        principalType: 'api_key',
        apiKeyId: verified.apiKeyId,
        apiKeyScopes: verified.scopes,
      };
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  override handleRequest<T>(err: unknown, user: T): T {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}
