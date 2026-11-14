/**
 * Saved views on the KPI list (KPISavedView, spec §4). A view stores the list's
 * filters, not KPIs: whoever opens it still sees only the KPIs visible to them,
 * so a view can be shared with the organization. Only its owner (or an admin)
 * may change or delete it; another tenant never sees it.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContextService } from '../rbac/services/access-context.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiSavedViewsService } from './kpi-saved-views.service.js';

interface Row {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  filters: unknown;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function make(opts: { isAdmin?: boolean } = {}) {
  let n = 1;
  const rows: Row[] = [];
  const matches = (r: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Array<Record<string, unknown>>).some((b) => matches(r, b));
      return (r as unknown as Record<string, unknown>)[k] === v;
    });
  const prisma = {
    kPISavedView: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).sort((a, b) => a.name.localeCompare(b.name))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => matches(r, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt'> }) => {
        if (rows.some((r) => r.organizationId === data.organizationId && r.userId === data.userId && r.name === data.name)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { id: `v${n++}`, createdAt: new Date(), updatedAt: new Date(), ...data } as Row;
        rows.push(row);
        return row;
      }),
      // Like Prisma, an undefined field is left unchanged.
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) =>
        Object.assign(rows.find((r) => r.id === where.id)!, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))),
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => rows.splice(rows.findIndex((r) => r.id === where.id), 1)[0]),
    },
  };
  const accessContext = { resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: opts.isAdmin ?? false })) };
  const svc = new KpiSavedViewsService(prisma as unknown as PrismaService, accessContext as unknown as AccessContextService);
  return { svc, rows };
}

const as = <T>(userId: string, fn: () => Promise<T>, organizationId = 'org_a') =>
  RequestContextStore.run({ userId, organizationId, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;

describe('KpiSavedViewsService', () => {
  it('lists my views and the views shared in my organization (not other people\'s private ones, not other orgs\')', async () => {
    const { svc } = make();
    await as('me', () => svc.create({ name: 'Mine', filters: { status: 'ACTIVE' }, isShared: false }));
    await as('colleague', () => svc.create({ name: 'Team', filters: { scope: 'PER_UNIT' }, isShared: true }));
    await as('colleague', () => svc.create({ name: 'Private', filters: {}, isShared: false }));
    await as('stranger', () => svc.create({ name: 'Other org', filters: {}, isShared: true }), 'org_b');

    const views = await as('me', () => svc.list());
    expect(views.map((v) => [v.name, v.mine])).toEqual([
      ['Mine', true],
      ['Team', false],
    ]);
  });

  it('a duplicate name for the same person is 409', async () => {
    const { svc } = make();
    await as('me', () => svc.create({ name: 'Active', filters: {}, isShared: false }));
    await expect(as('me', () => svc.create({ name: 'Active', filters: {}, isShared: false }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('only the owner changes or deletes a view; a shared one is 403 for others, a private one 404', async () => {
    const { svc, rows } = make();
    const shared = await as('colleague', () => svc.create({ name: 'Team', filters: {}, isShared: true }));
    const priv = await as('colleague', () => svc.create({ name: 'Private', filters: {}, isShared: false }));
    await expect(as('me', () => svc.update(shared.id, { name: 'Hijacked' }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(as('me', () => svc.remove(shared.id))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(as('me', () => svc.update(priv.id, { name: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(as('colleague', () => svc.update(shared.id, { isShared: false }))).resolves.toMatchObject({ isShared: false });
    await as('colleague', () => svc.remove(priv.id));
    expect(rows.map((r) => r.name)).toEqual(['Team']);
  });

  it('an admin may delete a shared view they do not own', async () => {
    const { svc, rows } = make({ isAdmin: true });
    const shared = await as('colleague', () => svc.create({ name: 'Team', filters: {}, isShared: true }));
    await as('admin', () => svc.remove(shared.id));
    expect(rows).toHaveLength(0);
  });

  it('another tenant gets 404 for a shared view', async () => {
    const { svc } = make();
    const shared = await as('colleague', () => svc.create({ name: 'Team', filters: {}, isShared: true }));
    await expect(as('stranger', () => svc.update(shared.id, { name: 'x' }), 'org_b')).rejects.toBeInstanceOf(NotFoundException);
  });
});
