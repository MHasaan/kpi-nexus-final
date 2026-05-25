import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@kpi-nexus/contracts';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import {
  REQUIRE_ANY_PERMISSION_KEY,
  REQUIRE_PERMISSIONS_KEY,
} from '../decorators/require-permissions.decorator.js';
import { PermissionResolverService } from '../services/permission-resolver.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const requireAll = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requireAny = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      REQUIRE_ANY_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if ((!requireAll || requireAll.length === 0) && (!requireAny || requireAny.length === 0)) {
      // No permission metadata on this route — assume authenticated-only.
      return true;
    }

    const resolved = await this.resolver.resolveForCurrentPrincipal();
    if (resolved.isAdmin) {
      return true;
    }

    if (requireAll && requireAll.length > 0) {
      const missing = requireAll.filter((p) => !resolved.permissions.has(p));
      if (missing.length > 0) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          details: { missing },
        });
      }
    }
    if (requireAny && requireAny.length > 0) {
      const any = requireAny.some((p) => resolved.permissions.has(p));
      if (!any) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          details: { requireAny },
        });
      }
    }

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
