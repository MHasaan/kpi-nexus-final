import { Injectable } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export interface ActivityItem {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

export interface ActivityFilter {
  userId?: string;
  entityType?: string;
  action?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PermissionResolverService,
  ) {}

  async list(filter: ActivityFilter): Promise<ActivityPage> {
    const ctx = RequestContextStore.require();
    const resolved = await this.resolver.resolveForCurrentPrincipal();
    const limit = Math.min(100, Math.max(1, filter.limit ?? 25));

    const where: Prisma.AuditLogWhereInput = { organizationId: ctx.organizationId };
    // Non-admins only see their own activity.
    where.userId = resolved.isAdmin ? filter.userId : ctx.userId;
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.action) where.action = filter.action as Prisma.AuditLogWhereInput['action'];
    if (filter.from || filter.to) {
      where.createdAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
    }

    // Peek one extra row to compute nextCursor.
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Side-load user names.
    const userIds = [...new Set(page.map((r) => r.userId).filter((id): id is string => !!id))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      items: page.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userId ? (names.get(r.userId) ?? null) : null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
