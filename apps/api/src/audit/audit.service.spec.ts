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

describe('AuditService.list / exportCsv (plan 6.13)', () => {
  const tenant = { userId: 'u1', organizationId: 'org-a', roleId: null, principalType: 'user' as const };
  const row = {
    id: 'a1',
    action: 'UPDATE',
    entityType: 'KPI',
    entityId: 'k1',
    changes: null,
    userId: 'u1',
    userEmail: '=cmd@example.test',
    metadata: null,
    redactedKeys: ['passwordHash'],
    createdAt: new Date('2026-11-10T08:30:00.000Z'),
  };
  function makeList() {
    const findMany = vi.fn(async (_args: unknown) => [row]);
    return { findMany, service: new AuditService({ auditLog: { findMany } } as unknown as PrismaService) };
  }

  test('a date range limits the rows, newest first with a stable order', async () => {
    const { service, findMany } = makeList();
    const from = new Date('2026-11-01T00:00:00.000Z');
    const to = new Date('2026-11-10T23:59:59.999Z');
    await RequestContextStore.run(tenant, () => service.list({ from, to }));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a', createdAt: { gte: from, lte: to } }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  test('the entity type filter ignores case — the page has a free-text box for it (plan 7.7)', async () => {
    const { service, findMany } = makeList();
    await RequestContextStore.run(tenant, () => service.list({ entityType: 'kpi' }));
    expect((findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where.entityType).toEqual({ equals: 'kpi', mode: 'insensitive' });
    await RequestContextStore.run(tenant, () => service.list({}));
    expect((findMany.mock.calls[1]![0] as { where: Record<string, unknown> }).where.entityType).toBeUndefined();
  });

  test('with no dates, no date condition is sent', async () => {
    const { service, findMany } = makeList();
    await RequestContextStore.run(tenant, () => service.list({}));
    expect((findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where.createdAt).toBeUndefined();
  });

  test('the export is a CSV of the same rows; a cell that could run as a formula is made text', async () => {
    const { service, findMany } = makeList();
    const csv = await RequestContextStore.run(tenant, () => service.exportCsv({ action: 'UPDATE' as never }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5000 }));
    expect(csv.split('\r\n')).toEqual([
      'Time (UTC),Action,Entity type,Entity id,Person,Redacted fields',
      "2026-11-10T08:30:00.000Z,UPDATE,KPI,k1,'=cmd@example.test,passwordHash",
      '',
    ]);
  });
});
