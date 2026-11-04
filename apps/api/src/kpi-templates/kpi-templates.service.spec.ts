import { describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { KpisService } from '../kpis/kpis.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GLOBAL_TEMPLATES } from './global-templates.js';
import { KpiTemplatesService } from './kpi-templates.service.js';

function makeService(builtinCount: number) {
  const prisma = {
    kPITemplate: {
      count: vi.fn(async () => builtinCount),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const service = new KpiTemplatesService(
    prisma as unknown as PrismaService,
    {} as AuditService,
    {} as KpisService,
  );
  return { service, prisma };
}

describe('KpiTemplatesService.seedGlobalIfEmpty', () => {
  it('seeds the builtin catalog even when other (non-builtin) global templates exist', async () => {
    // The demo seed adds 2 global templates; the old check (any global > 0)
    // then skipped all builtins and the gallery showed only those 2.
    const { service, prisma } = makeService(0);
    await service.seedGlobalIfEmpty();
    expect(prisma.kPITemplate.count).toHaveBeenCalledWith({
      where: { organizationId: null, isGlobal: true, isBuiltin: true },
    });
    expect(prisma.kPITemplate.createMany).toHaveBeenCalledTimes(1);
  });

  it('adds builtins that are missing (new entries ship), skipping existing slugs', async () => {
    const { service, prisma } = makeService(GLOBAL_TEMPLATES.length - 1);
    await service.seedGlobalIfEmpty();
    const [arg] = prisma.kPITemplate.createMany.mock.calls[0] as unknown as [{ skipDuplicates: boolean }];
    expect(arg.skipDuplicates).toBe(true);
  });

  it('does nothing once every builtin is present, and checks only once per process', async () => {
    const { service, prisma } = makeService(GLOBAL_TEMPLATES.length);
    await service.seedGlobalIfEmpty();
    await service.seedGlobalIfEmpty();
    expect(prisma.kPITemplate.createMany).not.toHaveBeenCalled();
    expect(prisma.kPITemplate.count).toHaveBeenCalledTimes(1);
  });
});
