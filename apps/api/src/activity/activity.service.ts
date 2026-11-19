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
  /** What the row is about, so a reader is not left with "created a KPI value". */
  subject: ActivitySubject;
  createdAt: Date;
}

export interface ActivitySubject {
  /** The name the row itself recorded: a KPI's or dashboard's name, a task's title. */
  name: string | null;
  /** The KPI the row is about, when it is about one that still exists here. */
  kpiId: string | null;
  kpiName: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const fields = (metadata: unknown): Record<string, unknown> =>
  metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};

/** The KPI a row points at: itself when it is a KPI row, else the one its details name. */
function kpiIdOf(row: { entityType: string | null; entityId: string | null; metadata: unknown }): string | null {
  return row.entityType?.toLowerCase() === 'kpi' ? row.entityId : text(fields(row.metadata).kpiId);
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
    // Typed into a free-text box: "kpi" must find KPI rows.
    if (filter.entityType) where.entityType = { equals: filter.entityType, mode: 'insensitive' };
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

    // Side-load the names of the people who acted, and of the people the rows are about (an
    // invitation, a role change): this organisation's only. Only names: a person's email is not
    // given out here.
    const personIds = page.filter((r) => r.entityType?.toLowerCase() === 'user' && r.entityId).map((r) => r.entityId!);
    const userIds = [...new Set([...page.map((r) => r.userId), ...personIds].filter((id): id is string => !!id))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { organizationId: ctx.organizationId, id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));

    // Side-load the names of the KPIs the rows are about: this organisation's, and only those not deleted.
    const kpiIds = [...new Set(page.map(kpiIdOf).filter((id): id is string => !!id))];
    const kpis = kpiIds.length
      ? await this.prisma.kPI.findMany({
          where: { organizationId: ctx.organizationId, id: { in: kpiIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : [];
    const kpiNames = new Map(kpis.map((k) => [k.id, k.name]));
    const subjectOf = (row: (typeof page)[number]): ActivitySubject => {
      const meta = fields(row.metadata);
      const kpiId = kpiIdOf(row);
      const kpiName = kpiId ? (kpiNames.get(kpiId) ?? null) : null;
      const person = row.entityType?.toLowerCase() === 'user' && row.entityId ? (names.get(row.entityId) ?? null) : null;
      return { name: person ?? text(meta.name) ?? text(meta.title), kpiId: kpiName ? kpiId : null, kpiName };
    };

    return {
      items: page.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userId ? (names.get(r.userId) ?? null) : null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        subject: subjectOf(r),
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
