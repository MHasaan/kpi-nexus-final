/**
 * Manual QA (2026-11-20, F-071): the Lineage tab read "kpi:cmwmyjra CASCADE_ROLLUP" — a raw id, not a name.
 * A hop that is one of this organisation's KPIs now carries its name.
 */
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { LineageService } from './lineage.service.js';

const ORG = 'org_1';
const inCtx = <T>(fn: () => Promise<T>) =>
  RequestContextStore.run({ userId: 'me', organizationId: ORG, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;

function setup() {
  const prisma = {
    lineageEdge: {
      findMany: vi.fn(async () => [
        { id: 'e1', sourceType: 'kpi', sourceId: 'bookings', targetType: 'kpi', targetId: 'mrr', transformType: 'CASCADE_ROLLUP' },
        { id: 'e2', sourceType: 'connector', sourceId: 'hubspot', targetType: 'kpi', targetId: 'bookings', transformType: 'INGEST' },
      ]),
    },
    kPI: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; organizationId: string } }) =>
        [{ id: 'bookings', name: 'New Bookings' }, { id: 'mrr', name: 'MRR' }].filter((k) => where.id.in.includes(k.id) && where.organizationId === ORG),
      ),
    },
  };
  return { svc: new LineageService(prisma as unknown as PrismaService), prisma };
}

describe('LineageService names the KPIs in a hop', () => {
  it('an upstream KPI carries its name; a node that is not a KPI carries none', async () => {
    const { svc } = setup();
    const hops = await inCtx(() => svc.getUpstream('kpi', 'mrr', 2));
    expect(hops.find((h) => h.id === 'bookings')).toMatchObject({ type: 'kpi', via: 'CASCADE_ROLLUP', name: 'New Bookings' });
    expect(hops.find((h) => h.id === 'hubspot')).toMatchObject({ type: 'connector', via: 'INGEST' });
    expect(hops.find((h) => h.id === 'hubspot')).not.toHaveProperty('name');
  });

  it('a downstream KPI carries its name too', async () => {
    const { svc } = setup();
    const hops = await inCtx(() => svc.getDownstream('kpi', 'bookings', 1));
    expect(hops).toEqual([expect.objectContaining({ id: 'mrr', name: 'MRR', via: 'CASCADE_ROLLUP' })]);
  });
});
