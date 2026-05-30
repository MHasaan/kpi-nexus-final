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

@Injectable()
export class MentionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { unreadOnly?: boolean; limit?: number }): Promise<PublicMention[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.mention.findMany({
      where: {
        organizationId: ctx.organizationId,
        mentionedUserId: ctx.userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      select: mentionSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: opts.limit ?? 50,
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
