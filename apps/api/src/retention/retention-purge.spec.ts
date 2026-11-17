/**
 * Retention purging (plan 6.7). The owner's decision of 2026-11-18: a policy
 * purges only after an administrator turns purging on for it. Policies saved
 * while the setting did nothing — and the seeded ones — stay off.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { RetentionService } from './retention.service.js';

interface Policy {
  id: string;
  organizationId: string;
  entityType: string;
  days: number;
  isActive: boolean;
  purgeEnabledAt: Date | null;
  lastRunAt: Date | null;
  lastRunDeleted: number | null;
}

const NOW = new Date('2026-11-18T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function make(policies: Policy[], auditAges: number[] = [400, 200, 10]) {
  // One table is enough to see what is deleted: the audit log, rows aged in days.
  let rows = auditAges.map((age, i) => ({ id: `a${i}`, organizationId: 'org-a', createdAt: daysAgo(age) }));
  const older = (where: { organizationId: string; createdAt: { lt: Date } }) =>
    rows.filter((r) => r.organizationId === where.organizationId && r.createdAt < where.createdAt.lt);
  const table = {
    count: vi.fn(async ({ where }: { where: never }) => older(where).length),
    findMany: vi.fn(async ({ where, take }: { where: never; take: number }) => older(where).slice(0, take).map((r) => ({ id: r.id }))),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      const before = rows.length;
      rows = rows.filter((r) => !where.id.in.includes(r.id));
      return { count: before - rows.length };
    }),
  };
  const empty = { count: vi.fn(async () => 0), findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })) };
  const prisma = {
    retentionPolicy: {
      findMany: vi.fn(async ({ where }: { where: Partial<Policy> & { purgeEnabledAt?: unknown } }) =>
        policies.filter(
          (p) =>
            (where.organizationId === undefined || p.organizationId === where.organizationId) &&
            (where.isActive === undefined || p.isActive === where.isActive) &&
            (where.purgeEnabledAt === undefined || p.purgeEnabledAt !== null),
        ),
      ),
      findUnique: vi.fn(async ({ where }: { where: { organizationId_entityType: { organizationId: string; entityType: string } } }) =>
        policies.find((p) => p.organizationId === where.organizationId_entityType.organizationId && p.entityType === where.organizationId_entityType.entityType) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Policy> }) => Object.assign(policies.find((p) => p.id === where.id)!, data)),
      upsert: vi.fn(async ({ where, create, update }: { where: { organizationId_entityType: { organizationId: string; entityType: string } }; create: Partial<Policy>; update: Partial<Policy> }) => {
        const key = where.organizationId_entityType;
        const existing = policies.find((p) => p.organizationId === key.organizationId && p.entityType === key.entityType);
        if (existing) return Object.assign(existing, update);
        const made = { id: `p${policies.length}`, isActive: true, purgeEnabledAt: null, lastRunAt: null, lastRunDeleted: null, ...create } as Policy;
        policies.push(made);
        return made;
      }),
    },
    auditLog: table,
    kPIDataPoint: empty,
    kPIDataPointHistory: empty,
    notificationDelivery: empty,
    reportRun: empty,
    ingestionJob: empty,
  };
  const audit = { record: vi.fn(async (_input: unknown) => undefined) };
  const service = new RetentionService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { service, prisma, audit, table, remaining: () => rows.map((r) => r.id) };
}

const policy = (over: Partial<Policy> = {}): Policy => ({
  id: 'p0',
  organizationId: 'org-a',
  entityType: 'audit_log',
  days: 90,
  isActive: true,
  purgeEnabledAt: null,
  lastRunAt: null,
  lastRunDeleted: null,
  ...over,
});
const asAdmin = <T>(fn: () => Promise<T>) => RequestContextStore.run({ userId: 'admin', organizationId: 'org-a', roleId: null, principalType: 'user' }, fn) as Promise<T>;

describe('RetentionService.purgeAll — the daily job', () => {
  test('a policy that was never turned on deletes nothing, however old the rows are', async () => {
    const { service, table, remaining } = make([policy()]);
    await expect(service.purgeAll(NOW)).resolves.toEqual({ policies: 0, deleted: 0 });
    expect(table.deleteMany).not.toHaveBeenCalled();
    expect(remaining()).toEqual(['a0', 'a1', 'a2']);
  });

  test('a policy that is turned on deletes the rows older than its days, and records the run', async () => {
    const p = policy({ purgeEnabledAt: daysAgo(1) });
    const { service, audit, remaining } = make([p]);
    await expect(service.purgeAll(NOW)).resolves.toEqual({ policies: 1, deleted: 2 });
    expect(remaining()).toEqual(['a2']);
    expect(p.lastRunAt).toEqual(NOW);
    expect(p.lastRunDeleted).toBe(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entityType: 'RetentionPurge', organizationId: 'org-a', metadata: { entityType: 'audit_log', days: 90, deleted: 2 } }),
    );
  });

  test('a policy that is switched off (isActive false) deletes nothing even with purging on', async () => {
    const { service, remaining } = make([policy({ purgeEnabledAt: daysAgo(1), isActive: false })]);
    await service.purgeAll(NOW);
    expect(remaining()).toHaveLength(3);
  });

  test('only the organisation of the policy is touched', async () => {
    const { service, table } = make([policy({ purgeEnabledAt: daysAgo(1) })]);
    await service.purgeAll(NOW);
    for (const call of table.findMany.mock.calls) expect((call[0] as { where: { organizationId: string } }).where.organizationId).toBe('org-a');
  });
});

describe('RetentionService — preview and turning purging on', () => {
  test('the preview counts what each policy would delete and deletes nothing', async () => {
    const { service, table, remaining } = make([policy()]);
    const preview = await asAdmin(() => service.preview(NOW));
    expect(preview).toEqual([{ entityType: 'audit_log', days: 90, purging: false, rows: 2 }]);
    expect(table.deleteMany).not.toHaveBeenCalled();
    expect(remaining()).toHaveLength(3);
  });

  test('turning purging on stamps the policy; turning it off clears the stamp', async () => {
    const p = policy();
    const { service, audit } = make([p]);
    await asAdmin(() => service.setPurging('audit_log', true, NOW));
    expect(p.purgeEnabledAt).toEqual(NOW);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'RetentionPolicy', metadata: { entityType: 'audit_log', purging: true } }));
    await asAdmin(() => service.setPurging('audit_log', false, NOW));
    expect(p.purgeEnabledAt).toBeNull();
  });

  test('changing the days turns purging off again — a shorter period must be previewed before it deletes', async () => {
    const p = policy({ purgeEnabledAt: daysAgo(5), days: 365 });
    const { service } = make([p]);
    await asAdmin(() => service.setDays('audit_log', 30));
    expect(p.days).toBe(30);
    expect(p.purgeEnabledAt).toBeNull();
  });

  test('saving the same days leaves purging as it was', async () => {
    const on = daysAgo(5);
    const p = policy({ purgeEnabledAt: on, days: 365 });
    const { service } = make([p]);
    await asAdmin(() => service.setDays('audit_log', 365));
    expect(p.purgeEnabledAt).toEqual(on);
  });

  test('applying a tier turns purging off on every policy whose days it changes', async () => {
    const p = policy({ purgeEnabledAt: daysAgo(5), days: 365 });
    const { service } = make([p]);
    await asAdmin(() => service.applyTier('FREE'));
    expect(p.days).toBe(90);
    expect(p.purgeEnabledAt).toBeNull();
  });

  test('an entity type that is not one of the five is refused', async () => {
    const { service } = make([]);
    await expect(asAdmin(() => service.setDays('users', 30))).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});
