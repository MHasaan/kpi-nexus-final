import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const mentionSelect = {
  id: true,
  organizationId: true,
  commentId: true,
  mentionedUserId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.MentionSelect;

export type PublicMention = Prisma.MentionGetPayload<{ select: typeof mentionSelect }>;

/** How much of a comment a mention row carries. */
const EXCERPT_LENGTH = 240;

/**
 * A mention as its reader needs it: who wrote, what they wrote, and where.
 * The page used to say only "You were mentioned" and a date. The row carries
 * the comment addressed to this reader and the kind and id of the thing it is
 * on — not that thing's name, which the reader may or may not be allowed to see.
 */
export interface MentionView extends PublicMention {
  authorName: string | null;
  /** The start of the comment; null when the comment has since been deleted. */
  excerpt: string | null;
  entityType: string | null;
  entityId: string | null;
}

export function excerptOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= EXCERPT_LENGTH ? flat : `${flat.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
}

@Injectable()
export class MentionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { unreadOnly?: boolean; limit?: number }): Promise<MentionView[]> {
    const ctx = RequestContextStore.require();
    const mentions = await this.prisma.mention.findMany({
      where: {
        organizationId: ctx.organizationId,
        mentionedUserId: ctx.userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      select: mentionSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: opts.limit ?? 50,
    });
    if (mentions.length === 0) return [];

    const comments = await this.prisma.comment.findMany({
      where: { organizationId: ctx.organizationId, id: { in: [...new Set(mentions.map((m) => m.commentId))] } },
      select: { id: true, authorId: true, body: true, entityType: true, entityId: true, deletedAt: true },
    });
    const authors = await this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId, id: { in: [...new Set(comments.map((c) => c.authorId))] } },
      select: { id: true, fullName: true },
    });
    const commentById = new Map(comments.map((c) => [c.id, c]));
    const nameById = new Map(authors.map((u) => [u.id, u.fullName]));

    return mentions.map((mention) => {
      const comment = commentById.get(mention.commentId);
      return {
        ...mention,
        authorName: comment ? (nameById.get(comment.authorId) ?? null) : null,
        // A deleted comment's text is gone for everyone, its reader included.
        excerpt: comment && !comment.deletedAt ? excerptOf(comment.body) : null,
        entityType: comment?.entityType ?? null,
        entityId: comment?.entityId ?? null,
      };
    });
  }

  async unreadCount(): Promise<number> {
    const ctx = RequestContextStore.require();
    return this.prisma.mention.count({
      where: { organizationId: ctx.organizationId, mentionedUserId: ctx.userId, readAt: null },
    });
  }

  async markRead(id: string): Promise<PublicMention> {
    const ctx = RequestContextStore.require();
    const mention = await this.prisma.mention.findFirst({
      where: { id, organizationId: ctx.organizationId, mentionedUserId: ctx.userId },
      select: mentionSelect,
    });
    if (!mention) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Mention not found' });
    return this.prisma.mention.update({ where: { id }, data: { readAt: new Date() }, select: mentionSelect });
  }

  async markAllRead(): Promise<{ count: number }> {
    const ctx = RequestContextStore.require();
    return this.prisma.mention.updateMany({
      where: { organizationId: ctx.organizationId, mentionedUserId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
