import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { PlatformAdminService } from './platform-admin.service.js';

/**
 * Allows the request only when the caller is a platform admin. Applied to the
 * platform-admin management endpoints.
 *
 * Bootstrap: the first admin normally comes from the seed (or a direct DB grant).
 * Letting ANY authenticated user through while the table is empty would hand the
 * global role to whoever registers an org first, so that path is opt-in via
 * PLATFORM_ADMIN_BOOTSTRAP_OPEN=true (and only while the table is empty).
 *
 * Guards run BEFORE the tenancy interceptor, so RequestContextStore is still
 * empty here: the principal comes from `req.user` (set by JwtAuthGuard) and the
 * DB reads run inside a context built from it, as PermissionsGuard does. Reading
 * the empty store used to reject every caller, admins included (BE-006).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const principal = context.switchToHttp().getRequest<{ user?: RequestContext }>().user;
    if (!principal?.userId) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    const allowed = await RequestContextStore.run(principal, async () => {
      if (await this.platformAdmin.isPlatformAdmin(principal.userId)) return true;
      if (process.env.PLATFORM_ADMIN_BOOTSTRAP_OPEN !== 'true') return false;
      return (await this.platformAdmin.count()) === 0; // opt-in bootstrap of the first admin
    });
    if (allowed) return true;
    throw new ForbiddenException({ code: 'NOT_PLATFORM_ADMIN', message: 'Platform admin privileges required' });
  }
}
