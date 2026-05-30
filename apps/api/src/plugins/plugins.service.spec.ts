/**
 * PluginsService unit tests. P8 catalogs installs (sandbox execution is P9).
 * Covers: install, org-scoped list + type filter, enable/disable, remove,
 * cross-tenant 404.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { PluginsService } from './plugins.service.js';

interface FakePlugin {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  version: string;
  entryUrl: string;
  isEnabled: boolean;
  installedById: string;
}

class FakePrisma {
  private n = 1;
  plugins: FakePlugin[] = [];

  plugin = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.plugins.filter((p) => p.organizationId === where.organizationId && (where.type === undefined || p.type === where.type)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.plugins.find((p) => p.id === where.id && p.organizationId === where.organizationId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const p: FakePlugin = {
        id: `plg_${this.n++}`,
        organizationId: data.organizationId as string,
        name: data.name as string,
        type: data.type as string,
        version: data.version as string,
        entryUrl: data.entryUrl as string,
        isEnabled: (data.isEnabled as boolean) ?? true,
        installedById: data.installedById as string,
      };
      this.plugins.push(p);
      return p;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const p = this.plugins.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) if (data[k] !== undefined) (p as unknown as Record<string, unknown>)[k] = data[k];
      return p;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.plugins = this.plugins.filter((p) => p.id !== where.id);
      return {};
    }),
  };
}

const ORG = 'org_alpha';
function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'admin', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const audit = { record: vi.fn(async () => {}) };
  return { service: new PluginsService(prisma as unknown as PrismaService, audit as unknown as AuditService), prisma };
}

describe('PluginsService', () => {
  test('install + list org-scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.install({ name: 'Burndown', type: 'WIDGET', version: '1.0.0', entryUrl: 'https://cdn/x.html' }));
    await withCtx({ organizationId: 'other' }, () => service.install({ name: 'X', type: 'WIDGET', version: '1.0.0', entryUrl: 'https://cdn/y.html' }));
    const rows = await withCtx({}, () => service.list());
    expect(rows.map((r) => r.name)).toEqual(['Burndown']);
  });

  test('list filters by type', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.install({ name: 'W', type: 'WIDGET', version: '1', entryUrl: 'https://cdn/w' }));
    await withCtx({}, () => service.install({ name: 'F', type: 'FORMULA_FN', version: '1', entryUrl: 'https://cdn/f' }));
    const widgets = await withCtx({}, () => service.list('WIDGET'));
    expect(widgets.map((r) => r.name)).toEqual(['W']);
  });

  test('enable / disable toggles isEnabled', async () => {
    const { service, prisma } = makeService();
    const p = await withCtx({}, () => service.install({ name: 'W', type: 'WIDGET', version: '1', entryUrl: 'https://cdn/w' }));
    await withCtx({}, () => service.setEnabled(p.id, false));
    expect(prisma.plugins[0]!.isEnabled).toBe(false);
    await withCtx({}, () => service.setEnabled(p.id, true));
    expect(prisma.plugins[0]!.isEnabled).toBe(true);
  });

  test('remove deletes', async () => {
    const { service, prisma } = makeService();
    const p = await withCtx({}, () => service.install({ name: 'W', type: 'WIDGET', version: '1', entryUrl: 'https://cdn/w' }));
    await withCtx({}, () => service.remove(p.id));
    expect(prisma.plugins).toHaveLength(0);
  });

  test('cross-tenant getById → 404', async () => {
    const { service } = makeService();
    const p = await withCtx({ organizationId: 'a' }, () => service.install({ name: 'W', type: 'WIDGET', version: '1', entryUrl: 'https://cdn/w' }));
    await expect(withCtx({ organizationId: 'b' }, () => service.setEnabled(p.id, false))).rejects.toBeInstanceOf(NotFoundException);
  });
});
