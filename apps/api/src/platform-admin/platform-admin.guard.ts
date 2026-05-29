import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { RequestContextStore } from '../tenancy/request-context.js';
import { PlatformAdminService } from './platform-admin.service.js';

/**
 * Allows the request only when the caller is a platform admin — OR when no
 * platform admins exist yet (bootstrap of the first one). Applied to the
 * platform-admin management endpoints.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const ctx = RequestContextStore.get();
    if (!ctx?.userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authentication required' });

    if (await this.platformAdmin.isPlatformAdmin(ctx.userId)) return true;
    if ((await this.platformAdmin.count()) === 0) return true; // bootstrap first admin
    throw new ForbiddenException({ code: 'NOT_PLATFORM_ADMIN', message: 'Platform admin privileges required' });
  }
}
