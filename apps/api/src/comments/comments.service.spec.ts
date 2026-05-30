/**
 * CommentsService unit tests. In-memory Prisma fake with a real $transaction
 * that creates the Comment + Mention rows atomically. Covers: mention rows
 * created in the same transaction, self-mention stripped, non-org mentions
 * dropped, transaction rollback (mention failure → no comment), org-scoped list
 * (excludes soft-deleted), author-only edit/delete.
 */
import { describe, expect, test, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { CommentsService } from './comments.service.js';

interface FakeComment {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  parentCommentId: string | null;
  authorId: string;
  body: string;
  mentionedUserIds: string[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
interface FakeMention {
  id: string;
  organizationId: string;
  commentId: string;
  mentionedUserId: string;
  readAt: Date | null;
  createdAt: Date;
}
interface FakeUser {
  id: string;
  organizationId: string;
}

class FakePrisma {
  private cn = 1;
  private mn = 1;
  comments: FakeComment[] = [];
  mentions: FakeMention[] = [];
  users: FakeUser[] = [];
  failMentionCreate = false;

  user = {
    findMany: vi.fn(async ({ where }: { where: { organizationId: string; id: { in: string[] } } }) =>
      this.users.filter((u) => u.organizationId === where.organizationId && where.id.in.includes(u.id)).map((u) => ({ id: u.id })),
    ),
  };

  comment = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const c: FakeComment = {
        id: `cmt_${this.cn++}`,
        organizationId: data.organizationId as string,
        entityType: data.entityType as string,
        entityId: data.entityId as string,
        parentCommentId: (data.parentCommentId as string) ?? null,
        authorId: data.authorId as string,
        body: data.body as string,
        mentionedUserIds: (data.mentionedUserIds as string[]) ?? [],
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.comments.push(c);
      return c;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        this.comments.find(
          (c) =>
            c.id === where.id &&
            c.organizationId === where.organizationId &&
            (where.deletedAt === null ? c.deletedAt === null : true),
        ) ?? null
      );
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.comments
        .filter(
          (c) =>
            c.organizationId === where.organizationId &&
            c.entityType === where.entityType &&
            c.entityId === where.entityId &&
            c.deletedAt === null,
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const c = this.comments.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) (c as unknown as Record<string, unknown>)[k] = data[k];
      c.updatedAt = new Date();
      return c;
    }),
  };

  mention = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (this.failMentionCreate) throw new Error('mention insert failed');
      const m: FakeMention = {
        id: `men_${this.mn++}`,
        organizationId: data.organizationId as string,
        commentId: data.commentId as string,
        mentionedUserId: data.mentionedUserId as string,
        readAt: null,
        createdAt: new Date(),
      };
      this.mentions.push(m);
      return m;
    }),
  };

  // Real atomic-ish transaction: snapshot, run, roll back on throw.
  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    const snapC = [...this.comments];
    const snapM = [...this.mentions];
    try {
      return await fn(this);
    } catch (e) {
      this.comments = snapC;
      this.mentions = snapM;
      throw e;
    }
  }
}

class FakeAudit {
  record = vi.fn(async () => {});
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'author', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  // seed org members
  prisma.users.push({ id: 'author', organizationId: ORG }, { id: 'alice', organizationId: ORG }, { id: 'bob', organizationId: ORG });
  const service = new CommentsService(prisma as unknown as PrismaService, new FakeAudit() as unknown as AuditService);
  return { service, prisma };
}

describe('CommentsService.create', () => {
  test('creates the comment and a Mention row per mentioned user in one transaction', async () => {
    const { service, prisma } = makeService();
    const c = await withCtx({ userId: 'author' }, () =>
      service.create({ entityType: 'kpi', entityId: 'kpi_1', body: 'great @alice @bob', mentionedUserIds: ['alice', 'bob'] }),
    );
    expect(c.mentionedUserIds.sort()).toEqual(['alice', 'bob']);
    expect(prisma.mentions.map((m) => m.mentionedUserId).sort()).toEqual(['alice', 'bob']);
    expect(prisma.mentions.every((m) => m.commentId === c.id)).toBe(true);
  });

  test('strips self-mention', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'author' }, () =>
      service.create({ entityType: 'kpi', entityId: 'k', body: 'note to self @author and @alice', mentionedUserIds: ['author', 'alice'] }),
    );
    expect(prisma.mentions.map((m) => m.mentionedUserId)).toEqual(['alice']);
  });

  test('drops mentioned ids that are not members of the org', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'author' }, () =>
      service.create({ entityType: 'kpi', entityId: 'k', body: 'hi @ghost', mentionedUserIds: ['ghost', 'alice'] }),
    );
    expect(prisma.mentions.map((m) => m.mentionedUserId)).toEqual(['alice']);
  });

  test('rolls back the comment if a mention insert fails (atomicity)', async () => {
    const { service, prisma } = makeService();
    prisma.failMentionCreate = true;
    await expect(
      withCtx({ userId: 'author' }, () =>
        service.create({ entityType: 'kpi', entityId: 'k', body: '@alice', mentionedUserIds: ['alice'] }),
      ),
    ).rejects.toThrow();
    expect(prisma.comments).toHaveLength(0);
    expect(prisma.mentions).toHaveLength(0);
  });

  test('comment with no mentions creates zero Mention rows', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'author' }, () => service.create({ entityType: 'kpi', entityId: 'k', body: 'plain comment' }));
    expect(prisma.comments).toHaveLength(1);
    expect(prisma.mentions).toHaveLength(0);
  });
});

describe('CommentsService list / edit / delete', () => {
  test('list is org + entity scoped and excludes soft-deleted', async () => {
    const { service } = makeService();
    const a = await withCtx({ userId: 'author' }, () => service.create({ entityType: 'kpi', entityId: 'k1', body: 'one' }));
    await withCtx({ userId: 'author' }, () => service.create({ entityType: 'kpi', entityId: 'k1', body: 'two' }));
    await withCtx({ userId: 'author' }, () => service.create({ entityType: 'kpi', entityId: 'k2', body: 'other entity' }));
    await withCtx({ userId: 'author' }, () => service.remove(a.id));
    const rows = await withCtx({ userId: 'author' }, () => service.list({ entityType: 'kpi', entityId: 'k1' }));
    expect(rows.map((r) => r.body)).toEqual(['two']);
  });

  test('edit is author-only', async () => {
    const { service } = makeService();
    const c = await withCtx({ userId: 'author' }, () => service.create({ entityType: 'kpi', entityId: 'k', body: 'mine' }));
    await expect(withCtx({ userId: 'bob' }, () => service.update(c.id, { body: 'hacked' }))).rejects.toBeInstanceOf(ForbiddenException);
    const u = await withCtx({ userId: 'author' }, () => service.update(c.id, { body: 'edited' }));
    expect(u.body).toBe('edited');
  });

  test('delete is author-only and soft', async () => {
    const { service, prisma } = makeService();
    const c = await withCtx({ userId: 'author' }, () => service.create({ entityType: 'kpi', entityId: 'k', body: 'mine' }));
    await expect(withCtx({ userId: 'bob' }, () => service.remove(c.id))).rejects.toBeInstanceOf(ForbiddenException);
    await withCtx({ userId: 'author' }, () => service.remove(c.id));
    expect(prisma.comments[0]!.deletedAt).not.toBeNull();
  });

  test('cross-tenant getById → 404', async () => {
    const { service } = makeService();
    const c = await withCtx({ organizationId: 'org_a', userId: 'author' }, () => service.create({ entityType: 'kpi', entityId: 'k', body: 'x' }));
    await expect(withCtx({ organizationId: 'org_b', userId: 'author' }, () => service.update(c.id, { body: 'y' }))).rejects.toBeInstanceOf(NotFoundException);
  });
});
