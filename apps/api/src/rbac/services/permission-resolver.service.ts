import { Injectable, Logger } from '@nestjs/common';
import type { PermissionKey } from '@kpi-nexus/contracts';
import { PermissionKey as PermissionKeyEnum } from '@kpi-nexus/contracts';

import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';

interface ResolvedPermissions {
  isAdmin: boolean;
  permissions: ReadonlySet<PermissionKey>;
  resolvedAt: number;
}

/**
 * Resolves the union of permissions for the current principal. Initial P1
 * implementation handles steps (1) isAdmin bypass and (3) role direct from
 * spec §5.4; ResourcePermission, role inheritance, PermissionDelegation, and
 * owner-override land with their own modules later in P1.
 *
 * Caching: per-process in-memory map keyed by `${orgId}:${userId}`, 5 min
 * TTL. The plan calls for Redis 5-min TTL + in-memory fallback; the in-memory
 * tier is enough for the initial commit and will be wrapped in Redis later
 * without changing the call signature.
 */
@Injectable()
export class PermissionResolverService {
  private readonly logger = new Logger(PermissionResolverService.name);
  private readonly cache = new Map<string, ResolvedPermissions>();
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async resolveForCurrentPrincipal(): Promise<ResolvedPermissions> {
    const ctx = RequestContextStore.require();
    return this.resolveForUser(ctx.organizationId, ctx.userId, ctx.roleId);
  }

  async resolveForUser(
    organizationId: string,
    userId: string,
    roleId: string | null,
  ): Promise<ResolvedPermissions> {
    const cacheKey = `${organizationId}:${userId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.resolvedAt < this.ttlMs) {
      return cached;
    }

    let permissions: ReadonlySet<PermissionKey> = new Set();
    let isAdmin = false;

    if (roleId) {
      const role = await this.prisma.roleDefinition.findUnique({
        where: { id: roleId },
        select: { isAdmin: true, permissions: true, organizationId: true },
      });
      if (role && role.organizationId === organizationId) {
        isAdmin = role.isAdmin;
        permissions = new Set(role.permissions as PermissionKey[]);
      }
    }

    const resolved: ResolvedPermissions = {
      isAdmin,
      permissions,
      resolvedAt: Date.now(),
    };
    this.cache.set(cacheKey, resolved);
    return resolved;
  }

  /** Invalidate cache for a specific user (call on role assignment changes). */
  invalidate(organizationId: string, userId: string): void {
    this.cache.delete(`${organizationId}:${userId}`);
  }

  /** Invalidate everything (call on role-definition edits). */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Re-export the enum so callers don't need to import from contracts directly. */
  readonly PermissionKey = PermissionKeyEnum;
}
