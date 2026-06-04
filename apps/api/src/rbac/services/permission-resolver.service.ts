import { Injectable, Logger } from '@nestjs/common';
import type { PermissionKey } from '@kpi-nexus/contracts';
import { PermissionKey as PermissionKeyEnum } from '@kpi-nexus/contracts';

import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';

interface ResolvedPermissions {
  isAdmin: boolean;
  permissions: ReadonlySet<PermissionKey>;
  resolvedAt: number;
  /** Set when delegations contributed to the permission union — used by audit. */
  fromDelegations: ReadonlyArray<{ delegationId: string; grantorUserId: string }>;
}

/**
 * Resolves the union of permissions for the current principal per spec §5.4:
 *
 *   1. `isAdmin` bypass         ✓ implemented
 *   2. ResourcePermission       — resource-specific, checked via
 *                                 hasResourcePermission() not in this union
 *   3. Role direct permissions  ✓ implemented
 *   4. Inherited role           ✓ implemented (BFS up RoleInheritance edges,
 *                                 cycle-safe; admin ancestor short-circuits)
 *   5. PermissionDelegation     ✓ implemented (explicit permissions only;
 *                                 "inherit ALL of grantor's" deferred)
 *   6. Owner-override           — resource-specific via @OwnerOverride decorator,
 *                                 checked at the guard layer, not in this union
 *
 * Caching: per-process in-memory map keyed by `${orgId}:${userId}`, 5-min TTL.
 * Redis tier comes later (call signature stays stable).
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

    const permissions = new Set<PermissionKey>();
    let isAdmin = false;

    // Step 3 — role direct permissions
    if (roleId) {
      const role = await this.prisma.roleDefinition.findUnique({
        where: { id: roleId },
        select: { isAdmin: true, permissions: true, organizationId: true },
      });
      if (role && role.organizationId === organizationId) {
        isAdmin = role.isAdmin;
        for (const p of role.permissions as PermissionKey[]) {
          permissions.add(p);
        }

        // Step 4 — inherited role permissions via BFS up RoleInheritance.
        // Cycle-safe via visited set; an admin ancestor flips isAdmin true
        // and short-circuits the rest of the BFS.
        if (!isAdmin) {
          const visited = new Set<string>([roleId]);
          const queue: string[] = [roleId];
          bfs: while (queue.length > 0) {
            const current = queue.shift();
            if (!current) break;
            const edges = await this.prisma.roleInheritance.findMany({
              where: {
                organizationId,
                childRoleId: current,
                inheritsPermissions: true,
              },
              select: {
                parentRoleId: true,
                parentRole: { select: { isAdmin: true, permissions: true } },
              },
            });
            for (const edge of edges) {
              if (visited.has(edge.parentRoleId)) continue;
              visited.add(edge.parentRoleId);
              if (edge.parentRole.isAdmin) {
                isAdmin = true;
                break bfs;
              }
              for (const p of edge.parentRole.permissions as PermissionKey[]) {
                permissions.add(p);
              }
              queue.push(edge.parentRoleId);
            }
          }
        }
      }
    }

    // Step 5 — active PermissionDelegations as grantee
    // Admin already has everything; skip delegation lookup.
    const fromDelegations: Array<{ delegationId: string; grantorUserId: string }> = [];
    if (!isAdmin) {
      const now = new Date();
      const delegations = await this.prisma.permissionDelegation.findMany({
        where: {
          organizationId,
          granteeUserId: userId,
          revokedAt: null,
          validFrom: { lte: now },
          validTo: { gte: now },
        },
        select: {
          id: true,
          grantorUserId: true,
          permissions: true,
        },
      });
      for (const d of delegations) {
        if (d.permissions.length === 0) {
          // Empty array → "inherit ALL of grantor's permissions" per spec §5.8.
          // Deferred: would need a recursive resolveForUser(grantorUserId) which
          // adds cache-coherency complexity. For P1 initial wire-up, treat empty
          // as a no-op and surface a warning to the operator.
          this.logger.warn(
            `Skipping inherit-all delegation ${d.id} (grantor=${d.grantorUserId}) — recursive grantor resolution not yet implemented`,
          );
          continue;
        }
        fromDelegations.push({ delegationId: d.id, grantorUserId: d.grantorUserId });
        for (const p of d.permissions as PermissionKey[]) {
          permissions.add(p);
        }
      }
    }

    // Step 3 (spec §3) — per-user UserAccessOverride. Capability deltas: grant adds,
    // revoke removes. Applied LAST (after role/inheritance/delegations) so a per-user
    // revoke is authoritative — most-restrictive wins. Done HERE (not only in
    // AccessContextService) because PermissionsGuard checks this resolved set directly,
    // so a capability override applied elsewhere would not gate endpoints. Admins skip.
    if (!isAdmin) {
      const override = await this.prisma.userAccessOverride.findFirst({
        where: { organizationId, userId },
        select: { grantCapabilities: true, revokeCapabilities: true },
      });
      if (override) {
        for (const p of override.grantCapabilities as PermissionKey[]) permissions.add(p);
        for (const p of override.revokeCapabilities as PermissionKey[]) permissions.delete(p);
      }
    }

    const resolved: ResolvedPermissions = {
      isAdmin,
      permissions,
      resolvedAt: Date.now(),
      fromDelegations,
    };
    this.cache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Per-resource check — spec §5.4 step 2 + step 6.
   *
   *   - Admin short-circuits to true.
   *   - Otherwise looks up an active ResourcePermission for the user (subject=
   *     user) OR for the user's role (subject=role). expiresAt honored.
   *   - Owner-override (step 6) is **not yet** checked here — when the
   *     `@OwnerOverride` decorator lands, that branch is added.
   */
  async hasResourcePermission(
    action: string,
    resourceType: string,
    resourceId: string,
  ): Promise<boolean> {
    const ctx = RequestContextStore.require();
    const resolved = await this.resolveForCurrentPrincipal();
    if (resolved.isAdmin) return true;

    return this.hasResourceGrant(
      ctx.organizationId,
      { userId: ctx.userId, roleId: ctx.roleId },
      action,
      resourceType,
      resourceId,
    );
  }

  /** Guard-safe (no RequestContextStore): does the user or their role hold a
   *  non-expired ResourcePermission grant for this exact (action, resourceType,
   *  resourceId)? No admin bypass here — callers handle admin separately. */
  async hasResourceGrant(
    organizationId: string,
    principal: { userId: string; roleId: string | null },
    action: string,
    resourceType: string,
    resourceId: string,
  ): Promise<boolean> {
    const now = new Date();
    const expiry = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };

    const userGrant = await this.prisma.resourcePermission.findFirst({
      where: {
        organizationId,
        subjectType: 'user',
        subjectId: principal.userId,
        action,
        resourceType,
        resourceId,
        ...expiry,
      },
      select: { id: true },
    });
    if (userGrant) return true;

    if (principal.roleId) {
      const roleGrant = await this.prisma.resourcePermission.findFirst({
        where: {
          organizationId,
          subjectType: 'role',
          subjectId: principal.roleId,
          action,
          resourceType,
          resourceId,
          ...expiry,
        },
        select: { id: true },
      });
      if (roleGrant) return true;
    }

    return false;
  }

  /** Invalidate cache for a specific user (call on role assignment changes). */
  invalidate(organizationId: string, userId: string): void {
    this.cache.delete(`${organizationId}:${userId}`);
  }

  /** Invalidate everything (call on role-definition edits or delegation changes). */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Re-export the enum so callers don't need to import from contracts directly. */
  readonly PermissionKey = PermissionKeyEnum;
}
