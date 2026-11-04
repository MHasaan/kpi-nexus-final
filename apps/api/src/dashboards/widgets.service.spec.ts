import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { DashboardsService } from './dashboards.service.js';
import { WidgetsService } from './widgets.service.js';

// BE-021: a widget's config.kpiId (and config.kpiIds) used to be stored
// verbatim, so org B could point its widget at org A's KPI.
const ORG = 'org_a';
const position = { x: 0, y: 0, w: 4, h: 3 };

function make() {
  const kpiFindFirst = vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
    where.id.startsWith('foreign_') ? null : { id: where.id },
  );
  const prisma = {
    kPI: { findFirst: kpiFindFirst },
    dashboardWidget: {
      aggregate: vi.fn(async () => ({ _max: { sortOrder: 0 } })),
      findFirst: vi.fn(async () => ({ id: 'w1', dashboardId: 'd1', organizationId: ORG })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'w_new', ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'w1', ...data })),
    },
  };
  const dashboards = { getById: vi.fn(async () => ({ id: 'd1' })) };
  const service = new WidgetsService(
    prisma as unknown as PrismaService,
    { record: vi.fn(async () => undefined) } as unknown as AuditService,
    dashboards as unknown as DashboardsService,
  );
  return { service, prisma };
}

const inOrg = <T>(fn: () => Promise<T>) =>
  RequestContextStore.run({ userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' }, fn) as Promise<T>;

describe('WidgetsService — config KPI ids must belong to the tenant (BE-021)', () => {
  test("add rejects config.kpiId from another tenant and creates nothing", async () => {
    const { service, prisma } = make();
    await expect(
      inOrg(() => service.add('d1', { widgetType: 'KPI_CARD', config: { kpiId: 'foreign_k' }, position } as never)),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR', message: 'config.kpiId is invalid or belongs to another tenant' } });
    expect(prisma.dashboardWidget.create).not.toHaveBeenCalled();
  });

  test('add rejects a foreign id inside config.kpiIds', async () => {
    const { service, prisma } = make();
    await expect(
      inOrg(() => service.add('d1', { widgetType: 'KPI_TABLE', config: { kpiIds: ['k1', 'foreign_k'] }, position } as never)),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.dashboardWidget.create).not.toHaveBeenCalled();
  });

  test('update rejects a foreign config.kpiId', async () => {
    const { service, prisma } = make();
    await expect(inOrg(() => service.update('d1', 'w1', { config: { kpiId: 'foreign_k' } } as never))).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.dashboardWidget.update).not.toHaveBeenCalled();
  });

  test('same-tenant KPI ids (and configs without KPI refs) are accepted', async () => {
    const { service, prisma } = make();
    await inOrg(() => service.add('d1', { widgetType: 'KPI_CARD', config: { kpiId: 'k1' }, position } as never));
    await inOrg(() => service.add('d1', { widgetType: 'TEXT', config: { text: 'hello' }, position } as never));
    expect(prisma.dashboardWidget.create).toHaveBeenCalledTimes(2);
    expect(prisma.kPI.findFirst).toHaveBeenCalledWith({ where: { id: 'k1', organizationId: ORG }, select: { id: true } });
  });
});
