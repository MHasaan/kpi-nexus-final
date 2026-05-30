/**
 * MentionsService unit tests. Per-user inbox over an in-memory fake. Covers:
 * list (org + user scoped, unreadOnly filter), unreadCount, markRead (own only),
 * markAllRead.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { MentionsService } from './mentions.service.js';

interface FakeMention {
  id: string;
  organizationId: string;
  commentId: string;
  mentionedUserId: string;
  readAt: Date | null;
  createdAt: Date;
}

class FakePrisma {
  mentions: FakeMention[] = [];

  mention = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.mentions
        .filter(
          (m) =>
            m.organizationId === where.organizationId &&
            m.mentionedUserId === where.mentionedUserId &&
            (where.readAt === null ? m.readAt === null : true),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    ),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.mentions.filter(
        (m) =>
          m.organizationId === where.organizationId &&
          m.mentionedUserId === where.mentionedUserId &&
          (where.readAt === null ? m.readAt === null : true),
      ).length,
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.mentions.find(
        (m) => m.id === where.id && m.organizationId === where.organizationId && m.mentionedUserId === where.mentionedUserId,
      ) ?? null,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { readAt: Date } }) => {
      const m = this.mentions.find((x) => x.id === where.id)!;
      m.readAt = data.readAt;
      return m;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: { readAt: Date } }) => {
      let count = 0;
      for (const m of this.mentions) {
        if (m.organizationId === where.organizationId && m.mentionedUserId === where.mentionedUserId && m.readAt === null) {
          m.readAt = data.readAt;
          count++;
        }
      }
      return { count };
    }),
  };
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'carol', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function seed(prisma: FakePrisma): void {
  prisma.mentions.push(
    { id: 'm1', organizationId: ORG, commentId: 'c1', mentionedUserId: 'carol', readAt: null, createdAt: new Date(1000) },
    { id: 'm2', organizationId: ORG, commentId: 'c2', mentionedUserId: 'carol', readAt: new Date(), createdAt: new Date(2000) },
    { id: 'm3', organizationId: ORG, commentId: 'c3', mentionedUserId: 'bob', readAt: null, createdAt: new Date(3000) },
    { id: 'm4', organizationId: 'other', commentId: 'c4', mentionedUserId: 'carol', readAt: null, createdAt: new Date(4000) },
  );
}

function makeService() {
  const prisma = new FakePrisma();
  seed(prisma);
  return { service: new MentionsService(prisma as unknown as PrismaService), prisma };
}

describe('MentionsService', () => {
  test('list returns current user mentions in this org only', async () => {
    const { service } = makeService();
    const rows = await withCtx({ userId: 'carol' }, () => service.list({}));
    expect(rows.map((r) => r.id).sort()).toEqual(['m1', 'm2']);
  });

  test('list unreadOnly filters out read mentions', async () => {
    const { service } = makeService();
    const rows = await withCtx({ userId: 'carol' }, () => service.list({ unreadOnly: true }));
    expect(rows.map((r) => r.id)).toEqual(['m1']);
  });

  test('unreadCount counts only unread mentions for the user', async () => {
    const { service } = makeService();
    expect(await withCtx({ userId: 'carol' }, () => service.unreadCount())).toBe(1);
    expect(await withCtx({ userId: 'bob' }, () => service.unreadCount())).toBe(1);
  });

  test('markRead sets readAt for own mention', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'carol' }, () => service.markRead('m1'));
    expect(prisma.mentions.find((m) => m.id === 'm1')!.readAt).not.toBeNull();
  });

  test('markRead on another user mention → 404', async () => {
    const { service } = makeService();
    await expect(withCtx({ userId: 'carol' }, () => service.markRead('m3'))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('markAllRead clears all unread for the user and returns count', async () => {
    const { service, prisma } = makeService();
    const res = await withCtx({ userId: 'carol' }, () => service.markAllRead());
    expect(res.count).toBe(1);
    expect(prisma.mentions.filter((m) => m.mentionedUserId === 'carol' && m.organizationId === ORG && m.readAt === null)).toHaveLength(0);
  });
});
