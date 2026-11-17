/**
 * Plan 2.5: resend / cancel an invitation, restore an archived person, and a
 * manager on the invitation. Rules only — the flows run against a real API in
 * test/integration/invite-lifecycle.spec.ts.
 */
import { describe, expect, test, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import type { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { UsersService } from './users.service.js';

const ORG = 'org-1';
const ctx = { organizationId: ORG, userId: 'caller' } as RequestContext;

interface Row {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  status: string;
  passwordHash: string | null;
  managerId: string | null;
}

function make(rows: Array<Partial<Row> & { id: string }>, visible: string[] | null = null) {
  const users: Row[] = rows.map((r) => ({
    organizationId: ORG,
    email: `${r.id}@example.test`,
    fullName: r.id,
    status: 'INVITED',
    passwordHash: null,
    managerId: null,
    ...r,
  }));
  const tokens: Array<{ userId: string; hashedToken: string }> = [];
  const sent: string[] = [];
  const find = ({ where }: { where: { id: string; organizationId: string } }) =>
    users.find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null;
  const prisma = {
    user: {
      findFirst: vi.fn(async (args: { where: { id: string; organizationId: string } }) => find(args)),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { managerId: string }; data: Partial<Row> }) => {
        const hit = users.filter((u) => u.managerId === where.managerId);
        hit.forEach((u) => Object.assign(u, data));
        return { count: hit.length };
      }),
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const row = { id: 'u-new', ...data } as Row;
        users.push(row);
        return row;
      }),
    },
    emailVerificationToken: {
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i]!.userId === where.userId) tokens.splice(i, 1);
        return { count: 0 };
      }),
      create: vi.fn(async ({ data }: { data: { userId: string; hashedToken: string } }) => {
        tokens.push(data);
        return data;
      }),
    },
    kPIAssignmentUser: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    orgUnitMember: { updateMany: vi.fn(async () => ({ count: 0 })) },
    orgUnit: { updateMany: vi.fn(async () => ({ count: 0 })) },
    kPI: { updateMany: vi.fn(async () => ({ count: 0 })) },
    organization: { findUnique: vi.fn(async () => ({ name: 'Org' })) },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const accessContext = {
    isPersonVisible: vi.fn(async (id: string) => visible === null || visible.includes(id)),
    resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: true })),
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    { record: vi.fn(async () => undefined) } as unknown as AuditService,
    {} as PermissionResolverService,
    accessContext as unknown as AccessContextService,
    {
      send: vi.fn(async ({ to }: { to: string }) => {
        sent.push(to);
      }),
    } as never,
    { assertWithinQuota: async () => undefined } as never,
  );
  return { service, users, tokens, sent };
}

const run = async <T,>(fn: () => Promise<T>) => RequestContextStore.run(ctx, fn);
const code = (err: unknown) => ((err as BadRequestException).getResponse() as { code: string }).code;

describe('UsersService.resendInvite', () => {
  test('replaces the token and emails the invited address', async () => {
    const { service, tokens, sent } = make([{ id: 'inv' }]);
    tokens.push({ userId: 'inv', hashedToken: 'old' });
    const result = await run(() => service.resendInvite('inv'));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.hashedToken).not.toBe('old');
    expect(sent).toEqual(['inv@example.test']);
    expect(result.emailSent).toBe(true);
  });

  test('refuses someone who already accepted', async () => {
    const { service, sent } = make([{ id: 'active', status: 'ACTIVE' }]);
    const err = await run(() => service.resendInvite('active')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(code(err)).toBe('NOT_INVITED');
    expect(sent).toEqual([]);
  });

  test('someone outside the caller\'s PEOPLE scope is a 404', async () => {
    const { service } = make([{ id: 'inv' }], ['caller']);
    await expect(run(() => service.resendInvite('inv'))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.cancelInvite', () => {
  test('frees the address, kills the link and unhooks anyone reporting to them', async () => {
    const { service, users, tokens } = make([{ id: 'inv' }, { id: 'report', status: 'ACTIVE', managerId: 'inv' }]);
    tokens.push({ userId: 'inv', hashedToken: 'old' });
    await run(() => service.cancelInvite('inv'));
    const row = users.find((u) => u.id === 'inv')!;
    expect(row.status).toBe('PURGED');
    expect(row.email).toMatch(/@purged\.local$/);
    expect(row.fullName).toBe('Former User');
    expect(tokens).toEqual([]);
    expect(users.find((u) => u.id === 'report')!.managerId).toBeNull();
  });

  test('refuses anyone who is not merely invited', async () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PURGED']) {
      const { service, users } = make([{ id: 'u', status }]);
      const err = await run(() => service.cancelInvite('u')).catch((e: unknown) => e);
      expect(code(err), status).toBe('NOT_INVITED');
      expect(users[0]!.status).toBe(status);
    }
  });
});

describe('UsersService.restore', () => {
  test('someone who had signed in comes back ACTIVE', async () => {
    const { service, users } = make([{ id: 'u', status: 'ARCHIVED', passwordHash: 'hash' }]);
    await run(() => service.restore('u'));
    expect(users[0]!.status).toBe('ACTIVE');
  });

  test('someone who never accepted comes back INVITED', async () => {
    const { service, users } = make([{ id: 'u', status: 'ARCHIVED' }]);
    await run(() => service.restore('u'));
    expect(users[0]!.status).toBe('INVITED');
  });

  test('refuses anyone who is not archived — a purged person stays gone', async () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'INVITED', 'PURGED', 'DELETED']) {
      const { service, users } = make([{ id: 'u', status }]);
      const err = await run(() => service.restore('u')).catch((e: unknown) => e);
      expect(code(err), status).toBe('NOT_ARCHIVED');
      expect(users[0]!.status).toBe(status);
    }
  });
});

describe('UsersService.invite — managerId', () => {
  const invite = (service: UsersService, managerId: string) =>
    run(() => service.invite({ email: 'new@example.test', fullName: 'New Person', managerId }));

  test('stores the manager', async () => {
    const { service, users } = make([{ id: 'boss', status: 'ACTIVE' }]);
    await invite(service, 'boss');
    expect(users.find((u) => u.id === 'u-new')!.managerId).toBe('boss');
  });

  test('refuses a manager who is unknown, archived, or outside the caller\'s scope', async () => {
    const unknown = make([]);
    await expect(invite(unknown.service, 'nobody')).rejects.toBeInstanceOf(BadRequestException);
    const archived = make([{ id: 'boss', status: 'ARCHIVED' }]);
    await expect(invite(archived.service, 'boss')).rejects.toBeInstanceOf(BadRequestException);
    const hidden = make([{ id: 'boss', status: 'ACTIVE' }], ['caller']);
    await expect(invite(hidden.service, 'boss')).rejects.toBeInstanceOf(BadRequestException);
  });
});
