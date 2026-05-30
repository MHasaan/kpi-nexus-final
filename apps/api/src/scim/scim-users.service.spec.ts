/**
 * ScimUsersService unit tests (RFC 7644 Users). In-memory user table. Covers:
 * provision (INVITED), userName filter, get, PATCH flat + PatchOp active flip
 * (→ SUSPENDED / ACTIVE), displayName update, PUT replace, DELETE (→ ARCHIVED),
 * duplicate userName 409, cross-tenant 404, SCIM resource shape.
 */
import { describe, expect, test, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ScimUsersService } from './scim-users.service.js';

interface FakeUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  status: string;
  roleId: string | null;
  archivedAt: Date | null;
}

class UniqueError extends Error {
  code = 'P2002';
}

class FakePrisma {
  private n = 1;
  users: FakeUser[] = [];

  user = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.users.filter((u) => u.organizationId === where.organizationId && (where.email === undefined ? true : u.email === where.email)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.users.find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (this.users.some((u) => u.organizationId === data.organizationId && u.email === data.email)) {
        throw new UniqueError('dup');
      }
      const u: FakeUser = {
        id: `user_${this.n++}`,
        organizationId: data.organizationId as string,
        email: data.email as string,
        fullName: data.fullName as string,
        status: (data.status as string) ?? 'ACTIVE',
        roleId: (data.roleId as string) ?? null,
        archivedAt: null,
      };
      this.users.push(u);
      return u;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const u = this.users.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) if (data[k] !== undefined) (u as unknown as Record<string, unknown>)[k] = data[k];
      return u;
    }),
  };
}

const ORG = 'org_alpha';
function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: 'scim', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'api_key', ...ctx },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  return { service: new ScimUsersService(prisma as unknown as PrismaService), prisma };
}

describe('ScimUsersService', () => {
  test('create provisions an INVITED user and returns a SCIM resource', async () => {
    const { service, prisma } = makeService();
    const res = await withCtx({}, () => service.create({ userName: 'ada@x.test', name: { givenName: 'Ada', familyName: 'L' } }));
    expect(prisma.users[0]!.status).toBe('INVITED');
    expect(res.userName).toBe('ada@x.test');
    expect(res.active).toBe(true);
    expect(res.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    expect(res.meta.resourceType).toBe('User');
  });

  test('duplicate userName → 409', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ userName: 'dup@x.test' }));
    await expect(withCtx({}, () => service.create({ userName: 'dup@x.test' }))).rejects.toBeInstanceOf(ConflictException);
  });

  test('list with userName filter returns the matching resource', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ userName: 'a@x.test' }));
    await withCtx({}, () => service.create({ userName: 'b@x.test' }));
    const list = await withCtx({}, () => service.list('userName eq "a@x.test"'));
    expect(list.totalResults).toBe(1);
    expect(list.Resources[0]!.userName).toBe('a@x.test');
  });

  test('list without filter returns all org users', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ userName: 'a@x.test' }));
    await withCtx({}, () => service.create({ userName: 'b@x.test' }));
    const list = await withCtx({}, () => service.list());
    expect(list.totalResults).toBe(2);
  });

  test('PATCH flat active:false → SUSPENDED; active:true → ACTIVE', async () => {
    const { service, prisma } = makeService();
    const u = await withCtx({}, () => service.create({ userName: 'c@x.test' }));
    await withCtx({}, () => service.patch(u.id, { active: false }));
    expect(prisma.users[0]!.status).toBe('SUSPENDED');
    await withCtx({}, () => service.patch(u.id, { active: true }));
    expect(prisma.users[0]!.status).toBe('ACTIVE');
  });

  test('PATCH PatchOp envelope active:false → SUSPENDED', async () => {
    const { service, prisma } = makeService();
    const u = await withCtx({}, () => service.create({ userName: 'd@x.test' }));
    await withCtx({}, () => service.patch(u.id, { Operations: [{ op: 'replace', path: 'active', value: false }] }));
    expect(prisma.users[0]!.status).toBe('SUSPENDED');
  });

  test('PATCH displayName updates fullName', async () => {
    const { service, prisma } = makeService();
    const u = await withCtx({}, () => service.create({ userName: 'e@x.test' }));
    await withCtx({}, () => service.patch(u.id, { displayName: 'Renamed Person' }));
    expect(prisma.users[0]!.fullName).toBe('Renamed Person');
  });

  test('PUT replace updates active + name', async () => {
    const { service, prisma } = makeService();
    const u = await withCtx({}, () => service.create({ userName: 'f@x.test' }));
    await withCtx({}, () => service.replace(u.id, { userName: 'f@x.test', active: false, displayName: 'F G' }));
    expect(prisma.users[0]!.status).toBe('SUSPENDED');
    expect(prisma.users[0]!.fullName).toBe('F G');
  });

  test('DELETE archives the user (ARCHIVED)', async () => {
    const { service, prisma } = makeService();
    const u = await withCtx({}, () => service.create({ userName: 'g@x.test' }));
    await withCtx({}, () => service.archive(u.id));
    expect(prisma.users[0]!.status).toBe('ARCHIVED');
    expect(prisma.users[0]!.archivedAt).not.toBeNull();
  });

  test('SCIM active reflects status (SUSPENDED → active:false)', async () => {
    const { service } = makeService();
    const u = await withCtx({}, () => service.create({ userName: 'h@x.test' }));
    await withCtx({}, () => service.patch(u.id, { active: false }));
    const got = await withCtx({}, () => service.getById(u.id));
    expect(got.active).toBe(false);
  });

  test('getById cross-tenant → 404', async () => {
    const { service } = makeService();
    const u = await withCtx({ organizationId: 'a' }, () => service.create({ userName: 'i@x.test' }));
    await expect(withCtx({ organizationId: 'b' }, () => service.getById(u.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('getById missing → 404', async () => {
    const { service } = makeService();
    await expect(withCtx({}, () => service.getById('nope'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
