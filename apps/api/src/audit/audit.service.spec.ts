import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { AuditService } from './audit.service.js';

function make() {
  const prisma = {
    user: { findUnique: vi.fn(async () => ({ email: 'ada@example.test' })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { service: new AuditService(prisma as unknown as PrismaService), prisma };
}

describe('AuditService.record — identity resolution', () => {
  test('inside a tenant request: org + user come from the context', async () => {
    const { service, prisma } = make();
    await RequestContextStore.run({ userId: 'u1', organizationId: 'org_a', roleId: null, principalType: 'user' }, () =>
      service.record({ action: 'UPDATE', entityType: 'KPI', entityId: 'k1' }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org_a', userId: 'u1', userEmail: 'ada@example.test' }),
    });
  });

  // Under runWithBypass with no outer request, the context holds the
  // 'platform-bypass' placeholder. Writing it as organizationId violates the
  // AuditLog → Organization FK, and the error was swallowed: every such event
  // (e.g. password resets) was silently lost.
  test('bypass placeholder is never written as an org/user id — the event is kept as platform-level', async () => {
    const { service, prisma } = make();
    await RequestContextStore.runWithBypass('test', () => service.record({ action: 'UPDATE', entityType: 'X', entityId: 'x1' }));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: null, userId: undefined }),
    });
  });

  test('an explicit organizationId/userId (pre-auth flows) wins over the placeholder', async () => {
    const { service, prisma } = make();
    await RequestContextStore.runWithBypass('test', () =>
      service.record({ action: 'UPDATE', entityType: 'User', entityId: 'u9', organizationId: 'org_b', userId: 'u9' }),
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u9' }, select: { email: true } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org_b', userId: 'u9', userEmail: 'ada@example.test' }),
    });
  });
});
