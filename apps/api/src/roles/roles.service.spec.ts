/**
 * RolesService unit tests — presets, hierarchy, applyPreset, resolveSubordinateRoleIds, getAudit.
 * Pure unit: Prisma, AuditService, and PermissionResolverService are mocked; no NestJS bootstrap.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';

import { PermissionKey } from '@kpi-nexus/contracts';

import { DEFAULT_ROLES } from '../auth/services/default-roles.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { PERMISSION_PRESETS } from './permission-presets.js';
import { RolesService } from './roles.service.js';

// ---------------------------------------------------------------------------
// Minimal fake types
// ---------------------------------------------------------------------------

interface FakeRole {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isAdmin: boolean;
  level: number;
  color: string | null;
  canAccessModules: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface FakeInheritance {
  id: string;
  organizationId: string;
  parentRoleId: string;
  childRoleId: string;
  inheritsPermissions: boolean;
  createdAt: Date;
}

interface FakeAuditLog {
  id: string;
  organizationId: string | null;
  entityType: string | null;
  entityId: string | null;
  action: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// FakePrisma
// ---------------------------------------------------------------------------

class FakePrisma {
  roles: FakeRole[] = [];
  inheritances: FakeInheritance[] = [];
  auditLogs: FakeAuditLog[] = [];

  roleDefinition = {
    findFirst: vi.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) => {
      return (
        this.roles.find(
          (r) =>
            (!where.id || r.id === where.id) &&
            (!where.organizationId || r.organizationId === where.organizationId),
        ) ?? null
      );
    }),
    findMany: vi.fn(async ({ where }: { where: { organizationId?: string } }) => {
      return this.roles.filter((r) => !where.organizationId || r.organizationId === where.organizationId);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeRole> }) => {
      const idx = this.roles.findIndex((r) => r.id === where.id);
      if (idx === -1) throw new Error('role not found');
      this.roles[idx] = { ...this.roles[idx]!, ...data };
      return this.roles[idx]!;
    }),
    count: vi.fn(async () => 0),
    delete: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
  };

  roleInheritance = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId?: string; parentRoleId?: string };
      }) => {
        return this.inheritances.filter(
          (e) =>
            (!where.organizationId || e.organizationId === where.organizationId) &&
            (!where.parentRoleId || e.parentRoleId === where.parentRoleId),
        );
      },
    ),
  };

  auditLog = {
    findMany: vi.fn(
      async ({
        where,
        orderBy,
        take,
      }: {
        where: { organizationId?: string; entityType?: string; entityId?: string };
        orderBy?: { createdAt: 'desc' };
        take?: number;
      }) => {
        let rows = this.auditLogs.filter(
          (l) =>
            (!where.organizationId || l.organizationId === where.organizationId) &&
            (!where.entityType || l.entityType === where.entityType) &&
            (!where.entityId || l.entityId === where.entityId),
        );
        if (orderBy?.createdAt === 'desc') {
          rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (take !== undefined) rows = rows.slice(0, take);
        return rows;
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG = 'org_alpha';
const OTHER_ORG = 'org_beta';

const BASE_CTX: RequestContext = {
  userId: 'user_1',
  organizationId: ORG,
  roleId: 'role_1',
  principalType: 'user',
};

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      userId: ctx.userId ?? 'user_1',
      organizationId: ctx.organizationId ?? ORG,
      roleId: ctx.roleId ?? null,
      principalType: 'user',
    },
    fn,
  ) as Promise<T>;
}

function makeService() {
  const prisma = new FakePrisma();
  const audit: Pick<AuditService, 'record' | 'list'> = {
    record: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
  };
  const resolver: Pick<PermissionResolverService, 'invalidateAll'> = {
    invalidateAll: vi.fn(),
  };
  const service = new RolesService(
    prisma as unknown as PrismaService,
    resolver as unknown as PermissionResolverService,
    undefined, // approvalGate
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
}

function makeRole(overrides: Partial<FakeRole> = {}): FakeRole {
  return {
    id: 'role_1',
    organizationId: ORG,
    name: 'TestRole',
    description: null,
    permissions: [],
    isAdmin: false,
    level: 0,
    color: null,
    canAccessModules: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PERMISSION_PRESETS module
// ---------------------------------------------------------------------------

describe('PERMISSION_PRESETS', () => {
  test('derives 4 presets from DEFAULT_ROLES — one per role name', () => {
    expect(PERMISSION_PRESETS).toHaveLength(4);
    const names = PERMISSION_PRESETS.map((p) => p.key);
    expect(names).toContain('ADMIN');
    expect(names).toContain('MANAGER');
    expect(names).toContain('EMPLOYEE');
    expect(names).toContain('VIEWER');
  });

  test('VIEWER preset permissions match DEFAULT_ROLES Viewer entry exactly', () => {
    const viewerDefault = DEFAULT_ROLES.find((r) => r.name === 'Viewer')!;
    const viewerPreset = PERMISSION_PRESETS.find((p) => p.key === 'VIEWER')!;
    expect(viewerPreset.permissions).toEqual(viewerDefault.permissions);
  });

  test('ADMIN preset has isAdmin=true and empty permissions (bypass)', () => {
    const adminPreset = PERMISSION_PRESETS.find((p) => p.key === 'ADMIN')!;
    expect(adminPreset.isAdmin).toBe(true);
    expect(adminPreset.permissions).toEqual([]);
  });

  test('MANAGER preset permissions match DEFAULT_ROLES Manager entry exactly', () => {
    const mgr = DEFAULT_ROLES.find((r) => r.name === 'Manager')!;
    const mgrPreset = PERMISSION_PRESETS.find((p) => p.key === 'MANAGER')!;
    expect(mgrPreset.permissions).toEqual(mgr.permissions);
  });
});

// ---------------------------------------------------------------------------
// listPresets
// ---------------------------------------------------------------------------

describe('RolesService.listPresets', () => {
  test('returns the 4 preset catalog entries', async () => {
    const { service } = makeService();
    const presets = service.listPresets();
    expect(presets).toHaveLength(4);
    expect(presets.map((p) => p.key)).toEqual(expect.arrayContaining(['ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER']));
  });

  test('VIEWER preset perms === DEFAULT_ROLES Viewer perms', () => {
    const { service } = makeService();
    const presets = service.listPresets();
    const viewerDefault = DEFAULT_ROLES.find((r) => r.name === 'Viewer')!;
    const viewerPreset = presets.find((p) => p.key === 'VIEWER')!;
    expect(viewerPreset.permissions).toEqual(viewerDefault.permissions);
  });
});

// ---------------------------------------------------------------------------
// applyPreset
// ---------------------------------------------------------------------------

describe('RolesService.applyPreset', () => {
  test('sets role permissions to the preset and calls audit.record', async () => {
    const { service, prisma, audit } = makeService();
    const role = makeRole({ permissions: [PermissionKey.KPI_VIEW] });
    prisma.roles.push(role);

    await withCtx(BASE_CTX, () => service.applyPreset('role_1', 'VIEWER'));

    expect(prisma.roleDefinition.update).toHaveBeenCalledOnce();
    const updateCall = vi.mocked(prisma.roleDefinition.update).mock.calls[0]![0];
    const viewerPerms = DEFAULT_ROLES.find((r) => r.name === 'Viewer')!.permissions;
    expect(updateCall.data.permissions).toEqual(viewerPerms);
    expect(audit.record).toHaveBeenCalledOnce();
  });

  test('ADMIN preset sets isAdmin=true', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole({ isAdmin: false }));

    await withCtx(BASE_CTX, () => service.applyPreset('role_1', 'ADMIN'));

    const updateCall = vi.mocked(prisma.roleDefinition.update).mock.calls[0]![0];
    expect(updateCall.data.isAdmin).toBe(true);
  });

  test('non-admin preset preserves isAdmin from preset (false)', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole({ isAdmin: true }));

    await withCtx(BASE_CTX, () => service.applyPreset('role_1', 'MANAGER'));

    const updateCall = vi.mocked(prisma.roleDefinition.update).mock.calls[0]![0];
    expect(updateCall.data.isAdmin).toBe(false);
  });

  test('unknown presetKey → BadRequestException with VALIDATION_ERROR code', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole());

    await expect(
      withCtx(BASE_CTX, () => service.applyPreset('role_1', 'NONEXISTENT')),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      withCtx(BASE_CTX, () => service.applyPreset('role_1', 'NONEXISTENT')),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  test('cross-tenant role → NotFoundException', async () => {
    const { service, prisma } = makeService();
    // Role belongs to OTHER_ORG, not ORG
    prisma.roles.push(makeRole({ organizationId: OTHER_ORG }));

    await expect(
      withCtx(BASE_CTX, () => service.applyPreset('role_1', 'VIEWER')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('non-existent role → NotFoundException', async () => {
    const { service } = makeService();

    await expect(
      withCtx(BASE_CTX, () => service.applyPreset('no-such-role', 'VIEWER')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('audit record includes old and new permissions', async () => {
    const { service, prisma, audit } = makeService();
    const role = makeRole({ permissions: [PermissionKey.KPI_VIEW, PermissionKey.ALERTS_VIEW] });
    prisma.roles.push(role);

    await withCtx(BASE_CTX, () => service.applyPreset('role_1', 'EMPLOYEE'));

    const auditCall = vi.mocked(audit.record).mock.calls[0]![0];
    expect(auditCall.changes).toMatchObject({
      oldPermissions: expect.any(Array),
      newPermissions: expect.any(Array),
    });
    expect(auditCall.entityType).toBe('RoleDefinition');
    expect(auditCall.entityId).toBe('role_1');
  });
});

// ---------------------------------------------------------------------------
// resolveSubordinateRoleIds
// ---------------------------------------------------------------------------

describe('RolesService.resolveSubordinateRoleIds', () => {
  test('returns empty set when role has no children', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole({ id: 'parent' }));

    const result = await withCtx(BASE_CTX, () => service.resolveSubordinateRoleIds('parent'));

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  test('returns direct children', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole({ id: 'parent' }));
    prisma.inheritances.push({
      id: 'e1',
      organizationId: ORG,
      parentRoleId: 'parent',
      childRoleId: 'child',
      inheritsPermissions: true,
      createdAt: new Date(),
    });

    const result = await withCtx(BASE_CTX, () => service.resolveSubordinateRoleIds('parent'));

    expect(result.has('child')).toBe(true);
    expect(result.size).toBe(1);
  });

  test('returns transitive descendants (grandchild)', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole({ id: 'grandparent' }));
    prisma.inheritances.push(
      { id: 'e1', organizationId: ORG, parentRoleId: 'grandparent', childRoleId: 'parent', inheritsPermissions: true, createdAt: new Date() },
      { id: 'e2', organizationId: ORG, parentRoleId: 'parent', childRoleId: 'grandchild', inheritsPermissions: true, createdAt: new Date() },
    );

    const result = await withCtx(BASE_CTX, () => service.resolveSubordinateRoleIds('grandparent'));

    expect(result.has('parent')).toBe(true);
    expect(result.has('grandchild')).toBe(true);
    expect(result.size).toBe(2);
  });

  test('cycle-safe — a↔b cycle terminates without hanging', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole({ id: 'role_a' }));
    // a->b and b->a form a cycle
    prisma.inheritances.push(
      { id: 'e1', organizationId: ORG, parentRoleId: 'role_a', childRoleId: 'role_b', inheritsPermissions: true, createdAt: new Date() },
      { id: 'e2', organizationId: ORG, parentRoleId: 'role_b', childRoleId: 'role_a', inheritsPermissions: true, createdAt: new Date() },
    );

    const result = await withCtx(BASE_CTX, () => service.resolveSubordinateRoleIds('role_a'));

    // Should contain role_b, and terminate cleanly
    expect(result.has('role_b')).toBe(true);
    expect(result.size).toBe(1); // role_a itself is excluded (starting node)
  });

  test('tenant-scoped — edges from other orgs are excluded', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole({ id: 'parent' }));
    // Edge from OTHER_ORG should NOT appear
    prisma.inheritances.push({
      id: 'e1',
      organizationId: OTHER_ORG,
      parentRoleId: 'parent',
      childRoleId: 'foreign_child',
      inheritsPermissions: true,
      createdAt: new Date(),
    });

    const result = await withCtx(BASE_CTX, () => service.resolveSubordinateRoleIds('parent'));

    expect(result.has('foreign_child')).toBe(false);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getHierarchy
// ---------------------------------------------------------------------------

describe('RolesService.getHierarchy', () => {
  test('returns all roles and their inheritance edges for the tenant', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(
      makeRole({ id: 'r1', name: 'Admin' }),
      makeRole({ id: 'r2', name: 'Manager', organizationId: ORG }),
    );
    prisma.inheritances.push({
      id: 'e1',
      organizationId: ORG,
      parentRoleId: 'r1',
      childRoleId: 'r2',
      inheritsPermissions: true,
      createdAt: new Date(),
    });

    const result = await withCtx(BASE_CTX, () => service.getHierarchy());

    expect(result.roles).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ parentRoleId: 'r1', childRoleId: 'r2' });
  });

  test('empty org returns empty roles and edges', async () => {
    const { service } = makeService();

    const result = await withCtx(BASE_CTX, () => service.getHierarchy());

    expect(result.roles).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getAudit
// ---------------------------------------------------------------------------

describe('RolesService.getAudit', () => {
  test('returns audit rows for the role, newest first', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole());
    prisma.auditLogs.push(
      { id: 'log1', organizationId: ORG, entityType: 'RoleDefinition', entityId: 'role_1', action: 'UPDATE', createdAt: new Date('2026-01-01') },
      { id: 'log2', organizationId: ORG, entityType: 'RoleDefinition', entityId: 'role_1', action: 'CREATE', createdAt: new Date('2026-01-02') },
    );

    const result = await withCtx(BASE_CTX, () => service.getAudit('role_1'));

    expect(result).toHaveLength(2);
    // newest first
    expect((result[0] as { id: string }).id).toBe('log2');
  });

  test('cross-tenant role → NotFoundException', async () => {
    const { service, prisma } = makeService();
    // Role in OTHER_ORG
    prisma.roles.push(makeRole({ organizationId: OTHER_ORG }));

    await expect(
      withCtx(BASE_CTX, () => service.getAudit('role_1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('non-existent role → NotFoundException', async () => {
    const { service } = makeService();

    await expect(
      withCtx(BASE_CTX, () => service.getAudit('no-such-role')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('returns empty array when no audit rows exist for the role', async () => {
    const { service, prisma } = makeService();
    prisma.roles.push(makeRole());

    const result = await withCtx(BASE_CTX, () => service.getAudit('role_1'));

    expect(result).toEqual([]);
  });
});
