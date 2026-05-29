import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@kpi-nexus/contracts';

import type { RequestContext } from '../../tenancy/request-context.js';
import {
  OWNER_OVERRIDE_KEY,
  type OwnerOverrideConfig,
} from '../decorators/owner-override.decorator.js';
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

    // NestJS guards run BEFORE interceptors, so we can't rely on
    // RequestContextStore yet — read req.user directly (populated by
    // JwtAuthGuard a step earlier in the chain).
    const request = context.switchToHttp().getRequest<{
      user?: RequestContext;
      params?: Record<string, string>;
    }>();
    const principal = request.user;
    if (!principal) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    // API-key principals are checked against their explicit scopes — no admin
    // bypass, no owner-override. Scopes are PermissionKey strings.
    if (principal.principalType === 'api_key') {
      const scopes = new Set(principal.apiKeyScopes ?? []);
      if (requireAll && requireAll.length > 0) {
        const missing = requireAll.filter((p) => !scopes.has(p));
        if (missing.length > 0) {
          throw new ForbiddenException({
            code: 'FORBIDDEN',
            message: 'API key missing required scope',
            details: { missing },
          });
        }
      }
      if (requireAny && requireAny.length > 0) {
        const any = requireAny.some((p) => scopes.has(p));
        if (!any) {
          throw new ForbiddenException({
            code: 'FORBIDDEN',
            message: 'API key missing required scope',
            details: { requireAny },
          });
        }
      }
      return true;
    }

    const resolved = await this.resolver.resolveForUser(
      principal.organizationId,
      principal.userId,
      principal.roleId,
    );
    if (resolved.isAdmin) {
      return true;
    }

    // Resolver step 6 — owner override. If the principal IS the owner of the
    // resource being accessed, the permission check is bypassed.
    const ownerConfig = this.reflector.getAllAndOverride<OwnerOverrideConfig | undefined>(
      OWNER_OVERRIDE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (ownerConfig) {
      const resourceId = request.params?.[ownerConfig.paramKey];
      if (resourceId) {
        const ownerId = ownerConfig.resolveOwnerId
          ? await ownerConfig.resolveOwnerId(resourceId)
          : resourceId; // identity — the param IS the owner user id
        if (ownerId === principal.userId) {
          return true;
        }
      }
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
