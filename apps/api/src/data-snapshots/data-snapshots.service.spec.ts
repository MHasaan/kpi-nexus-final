/**
 * KPI snapshots (DataSnapshot, spec §4): freeze a KPI's definition and the
 * values its taker can read, with a reason. Because the payload holds the
 * taker's readable values, a snapshot is visible only to its taker and to
 * admins; anyone else gets 404.
 */
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { KpiDataService } from '../kpis/kpi-data.service.js';
import type { KpisService } from '../kpis/kpis.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { DataSnapshotsService } from './data-snapshots.service.js';

const ORG = 'org_1';
const as = <T>(userId: string, fn: () => Promise<T>) =>
  RequestContextStore.run({ userId, organizationId: ORG, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;

function make(opts: { admins?: string[] } = {}) {
  const rows: Array<Record<string, unknown>> = [];
  const matches = (r: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r[k] === v);
  const prisma = {
    dataSnapshot: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `s${rows.length + 1}`, takenAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => matches(r, where)) ?? null),
    },
  };
  const kpis = { getById: vi.fn(async (id: string) => ({ id, name: 'Calls', scope: 'PER_USER', version: 3, targetValue: 50, unit: null })) };
  const kpiData = {
    listForKpi: vi.fn(async () => [
      { id: 'p2', periodStart: new Date('2026-11-01'), value: 18, userId: 'me', orgUnitId: null },
      { id: 'p1', periodStart: new Date('2026-10-01'), value: 17, userId: 'me', orgUnitId: null },
    ]),
  };
  const accessContext = {
    resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: (opts.admins ?? []).includes(RequestContextStore.get()!.userId) })),
  };
  const svc = new DataSnapshotsService(
    prisma as unknown as PrismaService,
    kpis as unknown as KpisService,
    kpiData as unknown as KpiDataService,
    accessContext as unknown as AccessContextService,
  );
  return { svc, rows, kpis, kpiData };
}

describe('DataSnapshotsService', () => {
  it('captures the KPI definition and the taker\'s readable values, with the reason', async () => {
    const { svc, rows, kpiData } = make();
    const snap = await as('me', () => svc.takeKpiSnapshot('k1', 'Before the Q4 target change'));
    expect(kpiData.listForKpi).toHaveBeenCalledWith('k1', { limit: 1000 });
    expect(rows[0]).toMatchObject({ organizationId: ORG, entityType: 'KPI', entityId: 'k1', reason: 'Before the Q4 target change', takenById: 'me' });
    expect(rows[0]!.payload).toMatchObject({
      kpi: { id: 'k1', name: 'Calls', version: 3, targetValue: 50 },
      points: [{ period: '2026-11-01', value: 18, userId: 'me', orgUnitId: null }, { period: '2026-10-01', value: 17, userId: 'me', orgUnitId: null }],
    });
    expect(snap).toMatchObject({ id: 's1', pointCount: 2, reason: 'Before the Q4 target change' });
  });

  it('a KPI the taker cannot see cannot be snapshotted', async () => {
    const { svc, kpis } = make();
    kpis.getById.mockRejectedValueOnce(new NotFoundException());
    await expect(as('me', () => svc.takeKpiSnapshot('k1'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lists only the caller's snapshots (all of them for an admin), without payloads", async () => {
    const { svc } = make({ admins: ['boss'] });
    await as('me', () => svc.takeKpiSnapshot('k1', 'mine'));
    await as('other', () => svc.takeKpiSnapshot('k1', 'theirs'));
    const mine = await as('me', () => svc.listKpiSnapshots('k1'));
    expect(mine.map((s) => s.reason)).toEqual(['mine']);
    expect(mine[0]).not.toHaveProperty('payload');
    const all = await as('boss', () => svc.listKpiSnapshots('k1'));
    expect(all.map((s) => s.reason).sort()).toEqual(['mine', 'theirs']);
  });

  it("someone else's snapshot is 404 (its values are the taker's); an admin may open it", async () => {
    const { svc } = make({ admins: ['boss'] });
    const theirs = await as('other', () => svc.takeKpiSnapshot('k1', 'theirs'));
    await expect(as('me', () => svc.getKpiSnapshot('k1', theirs.id))).rejects.toBeInstanceOf(NotFoundException);
    await expect(as('boss', () => svc.getKpiSnapshot('k1', theirs.id))).resolves.toMatchObject({ id: theirs.id, payload: { kpi: { id: 'k1' } } });
    await expect(as('other', () => svc.getKpiSnapshot('k2', theirs.id))).rejects.toBeInstanceOf(NotFoundException);
  });
});
