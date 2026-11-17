/**
 * BE-044: POST /users (invite) took any roleId, so someone who can manage users
 * but is not an administrator could invite a brand-new administrator. Same rule
 * as PATCH /users/:id: only an administrator hands out an administrator role.
 */
import { describe, expect, test, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import type { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { UsersService } from './users.service.js';

const ORG = 'org-1';
const ctx = { organizationId: ORG, userId: 'caller' } as RequestContext;

function make(callerIsAdmin: boolean) {
  const roles = [
    { id: 'role-admin', organizationId: ORG, isAdmin: true },
    { id: 'role-member', organizationId: ORG, isAdmin: false },
  ];
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    user: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `u-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
    },
    emailVerificationToken: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    roleDefinition: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        roles.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
      ),
    },
    position: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) },
    organization: { findUnique: vi.fn(async () => ({ name: 'Org' })) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const accessContext = { resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: callerIsAdmin })) };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    { record: vi.fn(async () => undefined) } as unknown as AuditService,
    {} as PermissionResolverService,
    accessContext as unknown as AccessContextService,
    { send: vi.fn(async () => undefined) } as never,
  );
  return { service, created };
}

const invite = async (service: UsersService, roleId?: string) =>
  RequestContextStore.run(ctx, () =>
    service.invite({ email: 'new@example.test', fullName: 'New Person', ...(roleId ? { roleId } : {}) }),
  );

describe('UsersService.invite — administrator role', () => {
  test('a non-administrator cannot invite someone into an administrator role', async () => {
    const { service, created } = make(false);
    const err = await invite(service, 'role-admin').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'ADMIN_ROLE_REQUIRES_ADMIN' });
    expect(created).toHaveLength(0);
  });

  test('a non-administrator can still invite into an ordinary role, or with no role', async () => {
    const { service, created } = make(false);
    await invite(service, 'role-member');
    await invite(service);
    expect(created.map((u) => u.roleId)).toEqual(['role-member', undefined]);
  });

  test('an administrator can invite another administrator', async () => {
    const { service, created } = make(true);
    await invite(service, 'role-admin');
    expect(created[0]?.roleId).toBe('role-admin');
  });
});
