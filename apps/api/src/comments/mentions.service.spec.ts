/**
 * MentionsService unit tests. Per-user inbox over an in-memory fake. Covers:
 * list (org + user scoped, unreadOnly filter), unreadCount, markRead (own only),
 * markAllRead.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { MentionsService, excerptOf } from './mentions.service.js';

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
  comments: Array<{ id: string; organizationId: string; authorId: string; body: string; entityType: string; entityId: string; deletedAt: Date | null }> = [];
  users: Array<{ id: string; organizationId: string; fullName: string }> = [];

  comment = {
    findMany: vi.fn(async ({ where }: { where: { organizationId: string; id: { in: string[] } } }) =>
      this.comments.filter((c) => c.organizationId === where.organizationId && where.id.in.includes(c.id)),
    ),
  };
  user = {
    findMany: vi.fn(async ({ where }: { where: { organizationId: string; id: { in: string[] } } }) =>
      this.users.filter((u) => u.organizationId === where.organizationId && where.id.in.includes(u.id)),
    ),
  };

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

// Plan 7.7: a mention said "You were mentioned" and a date — not who, where or what.
describe('MentionsService.list — who, where and what', () => {
  const mention = (id: string, commentId: string): FakeMention => ({ id, organizationId: ORG, commentId, mentionedUserId: 'me', readAt: null, createdAt: new Date() });

  test('a row carries the author, the start of the comment and the thing it is on', async () => {
    const prisma = new FakePrisma();
    prisma.mentions.push(mention('m1', 'c1'));
    prisma.comments.push({ id: 'c1', organizationId: ORG, authorId: 'ada', body: 'Can you look at   this?\n@me', entityType: 'kpi', entityId: 'k1', deletedAt: null });
    prisma.users.push({ id: 'ada', organizationId: ORG, fullName: 'Ada Admin' });
    const service = new MentionsService(prisma as unknown as PrismaService);

    const [row] = await withCtx({ userId: 'me' }, () => service.list({}));

    expect(row).toMatchObject({ id: 'm1', authorName: 'Ada Admin', excerpt: 'Can you look at this? @me', entityType: 'kpi', entityId: 'k1' });
  });

  test('a deleted comment keeps its place but not its text', async () => {
    const prisma = new FakePrisma();
    prisma.mentions.push(mention('m1', 'c1'));
    prisma.comments.push({ id: 'c1', organizationId: ORG, authorId: 'ada', body: 'secret', entityType: 'task', entityId: 't1', deletedAt: new Date() });
    prisma.users.push({ id: 'ada', organizationId: ORG, fullName: 'Ada Admin' });
    const service = new MentionsService(prisma as unknown as PrismaService);

    const [row] = await withCtx({ userId: 'me' }, () => service.list({}));

    expect(row).toMatchObject({ authorName: 'Ada Admin', excerpt: null, entityType: 'task' });
    expect(JSON.stringify(row)).not.toContain('secret');
  });

  test("a comment or an author from another organisation is not read", async () => {
    const prisma = new FakePrisma();
    prisma.mentions.push(mention('m1', 'c_theirs'));
    prisma.comments.push({ id: 'c_theirs', organizationId: 'org_other', authorId: 'x', body: 'theirs', entityType: 'kpi', entityId: 'k9', deletedAt: null });
    const service = new MentionsService(prisma as unknown as PrismaService);

    const [row] = await withCtx({ userId: 'me' }, () => service.list({}));

    expect(row).toMatchObject({ authorName: null, excerpt: null, entityType: null, entityId: null });
  });

  test('no mentions, no lookups', async () => {
    const prisma = new FakePrisma();
    const service = new MentionsService(prisma as unknown as PrismaService);
    expect(await withCtx({ userId: 'me' }, () => service.list({}))).toEqual([]);
    expect(prisma.comment.findMany).not.toHaveBeenCalled();
  });

  test('a long comment is cut with an ellipsis', () => {
    const cut = excerptOf('word '.repeat(100));
    expect(cut.length).toBeLessThanOrEqual(240);
    expect(cut.endsWith('…')).toBe(true);
    expect(excerptOf('short')).toBe('short');
  });
});
