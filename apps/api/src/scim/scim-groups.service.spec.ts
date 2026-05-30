/**
 * ScimGroupsService unit tests. Groups are backed by RoleDefinition; membership
 * maps to User.roleId. Covers: list + displayName filter, get with members,
 * PATCH add members (assigns roleId), PATCH remove member (clears), remove-all,
 * cross-tenant member IDs silently dropped, cross-tenant 404.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ScimGroupsService } from './scim-groups.service.js';

interface FakeRole { id: string; organizationId: string; name: string }
interface FakeUser { id: string; organizationId: string; email: string; roleId: string | null }

class FakePrisma {
  roles: FakeRole[] = [];
  users: FakeUser[] = [];

  roleDefinition = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.roles.filter((r) => r.organizationId === where.organizationId && (where.name === undefined ? true : r.name === where.name)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.roles.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
    ),
  };

  user = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.users.filter((u) => u.organizationId === where.organizationId && (where.roleId === undefined ? true : u.roleId === where.roleId)),
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: { roleId: string | null } }) => {
      let count = 0;
      const ids = (where.id as { in: string[] } | undefined)?.in;
      for (const u of this.users) {
        const matchOrg = u.organizationId === where.organizationId;
        const matchId = ids ? ids.includes(u.id) : true;
        const matchRole = where.roleId === undefined ? true : u.roleId === where.roleId;
        if (matchOrg && matchId && matchRole) {
          u.roleId = data.roleId;
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
    { userId: 'scim', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'api_key', ...ctx },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  prisma.roles.push({ id: 'role_mgr', organizationId: ORG, name: 'Manager' }, { id: 'role_emp', organizationId: ORG, name: 'Employee' });
  prisma.users.push(
    { id: 'u1', organizationId: ORG, email: 'u1@x', roleId: null },
    { id: 'u2', organizationId: ORG, email: 'u2@x', roleId: 'role_mgr' },
    { id: 'uX', organizationId: 'other', email: 'x@y', roleId: null },
  );
  return { service: new ScimGroupsService(prisma as unknown as PrismaService), prisma };
}

describe('ScimGroupsService', () => {
  test('list returns roles as groups', async () => {
    const { service } = makeService();
    const list = await withCtx({}, () => service.list());
    expect(list.totalResults).toBe(2);
    expect(list.Resources.map((g) => g.displayName).sort()).toEqual(['Employee', 'Manager']);
  });

  test('list with displayName filter', async () => {
    const { service } = makeService();
    const list = await withCtx({}, () => service.list('displayName eq "Manager"'));
    expect(list.totalResults).toBe(1);
    expect(list.Resources[0]!.displayName).toBe('Manager');
  });

  test('getById includes current members', async () => {
    const { service } = makeService();
    const g = await withCtx({}, () => service.getById('role_mgr'));
    expect(g.displayName).toBe('Manager');
    expect(g.members.map((m) => m.value)).toEqual(['u2']);
  });

  test('PATCH add members assigns roleId', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.patch('role_emp', { Operations: [{ op: 'add', path: 'members', value: [{ value: 'u1' }] }] }));
    expect(prisma.users.find((u) => u.id === 'u1')!.roleId).toBe('role_emp');
  });

  test('PATCH add silently drops cross-tenant member IDs', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.patch('role_emp', { Operations: [{ op: 'add', path: 'members', value: [{ value: 'uX' }, { value: 'u1' }] }] }));
    expect(prisma.users.find((u) => u.id === 'uX')!.roleId).toBeNull(); // other tenant untouched
    expect(prisma.users.find((u) => u.id === 'u1')!.roleId).toBe('role_emp');
  });

  test('PATCH remove a specific member clears their roleId', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.patch('role_mgr', { Operations: [{ op: 'remove', path: 'members[value eq "u2"]' }] }));
    expect(prisma.users.find((u) => u.id === 'u2')!.roleId).toBeNull();
  });

  test('PATCH remove all members (path=members) clears the whole group', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.patch('role_mgr', { Operations: [{ op: 'remove', path: 'members' }] }));
    expect(prisma.users.filter((u) => u.roleId === 'role_mgr')).toHaveLength(0);
  });

  test('getById cross-tenant → 404', async () => {
    const { service } = makeService();
    await expect(withCtx({ organizationId: 'other' }, () => service.getById('role_mgr'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
