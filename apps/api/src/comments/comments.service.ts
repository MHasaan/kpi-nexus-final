import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type TenantRefModel, assertSameTenant } from '../tenancy/assert-same-tenant.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { dedupeMentionTargets } from './comment-mentions.js';
import type {
  CreateCommentDto,
  ListCommentsQuery,
  UpdateCommentDto,
} from './dto/comment.dto.js';

/** Prisma model behind each commentable entity type. */
const ENTITY_MODEL: Record<CreateCommentDto['entityType'], TenantRefModel> = {
  kpi: 'kPI',
  dashboard: 'dashboard',
  alert: 'alert',
  task: 'task',
  objective: 'objective',
};

const commentSelect = {
  id: true,
  organizationId: true,
  entityType: true,
  entityId: true,
  parentCommentId: true,
  authorId: true,
  body: true,
  mentionedUserIds: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CommentSelect;

export type PublicComment = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

/** How many colleagues one look-up offers. */
const MENTIONABLE_LIMIT = 8;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCommentsQuery): Promise<PublicComment[]> {
    const ctx = RequestContextStore.require();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    return this.prisma.comment.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: query.entityType,
        entityId: query.entityId,
        deletedAt: null,
      },
      select: commentSelect,
      orderBy: [{ createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  /**
   * Create a comment plus one Mention row per resolved, org-member mentioned
   * user — atomically. Self-mentions and non-members are stripped first.
   */
  async create(dto: CreateCommentDto): Promise<PublicComment> {
    const ctx = RequestContextStore.require();
    // BE-021: the commented entity (and a reply's parent) must be in this tenant.
    await assertSameTenant(this.prisma, ENTITY_MODEL[dto.entityType], dto.entityId, ctx.organizationId, 'entityId');
    if (dto.parentCommentId) {
      await assertSameTenant(this.prisma, 'comment', dto.parentCommentId, ctx.organizationId, 'parentCommentId');
    }
    const targets = await this.resolveMentionTargets(dto.mentionedUserIds ?? [], ctx.userId, ctx.organizationId);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          organizationId: ctx.organizationId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          parentCommentId: dto.parentCommentId,
          authorId: ctx.userId,
          body: dto.body,
          mentionedUserIds: targets,
        },
        select: commentSelect,
      });
      for (const mentionedUserId of targets) {
        await tx.mention.create({
          data: { organizationId: ctx.organizationId, commentId: created.id, mentionedUserId },
        });
      }
      return created;
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'Comment',
      entityId: comment.id,
      metadata: { entity: `${dto.entityType}:${dto.entityId}`, mentions: targets.length },
    });
    return comment;
  }

  async update(id: string, dto: UpdateCommentDto): Promise<PublicComment> {
    const ctx = RequestContextStore.require();
    const existing = await this.loadInOrg(id);
    if (existing.authorId !== ctx.userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the author can edit this comment' });
    }
    const updated = await this.prisma.comment.update({
      where: { id },
      data: { body: dto.body },
      select: commentSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Comment', entityId: id });
    return updated;
  }

  async remove(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.loadInOrg(id);
    if (existing.authorId !== ctx.userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the author can delete this comment' });
    }
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ action: 'DELETE', entityType: 'Comment', entityId: id });
  }

  private async loadInOrg(id: string): Promise<PublicComment> {
    const ctx = RequestContextStore.require();
    const comment = await this.prisma.comment.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: null },
      select: commentSelect,
    });
    if (!comment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Comment not found' });
    return comment;
  }

  /**
   * Colleagues to mention, by name (owner decision 2026-11-19: names only).
   *
   * Someone who may comment but may not list people was offered only those who
   * had already commented on the item, so a first mention reached nobody. This
   * answers what they type after "@": a name and an id — never an email, a
   * role or a status — for active members of their own organisation whose
   * first or any later name starts with it. It is a look-up, not a list:
   * nothing typed finds nobody, and one answer holds a handful of names.
   */
  async mentionable(query: string): Promise<Array<{ id: string; fullName: string }>> {
    const typed = query.trim();
    if (!typed) return [];
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: 'ACTIVE',
        id: { not: ctx.userId },
        OR: [
          { fullName: { startsWith: typed, mode: 'insensitive' } },
          { fullName: { contains: ` ${typed}`, mode: 'insensitive' } },
        ],
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
      take: MENTIONABLE_LIMIT,
    });
    return rows.map((row) => ({ id: row.id, fullName: row.fullName }));
  }

  /** Dedupe + strip self, then keep only ids that are members of the org. */
  private async resolveMentionTargets(
    mentionedUserIds: readonly string[],
    authorId: string,
    organizationId: string,
  ): Promise<string[]> {
    const candidates = dedupeMentionTargets(mentionedUserIds, authorId);
    if (candidates.length === 0) return [];
    const members = await this.prisma.user.findMany({
      where: { organizationId, id: { in: candidates } },
      select: { id: true },
    });
    const memberSet = new Set(members.map((m) => m.id));
    return candidates.filter((id) => memberSet.has(id));
  }
}
