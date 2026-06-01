/**
 * TDD spec for the NLQ auto-reembed pipeline.
 *
 * Three test groups:
 *  1. ReembedProducer — verifies queue.add is called with the correct name,
 *     payload, and deterministic jobId.
 *  2. ReembedProcessor — verifies embedding-service methods are called under the
 *     right org context; 'reembed-org' iterates all org KPIs.
 *  3. KpisService trigger — verifies the producer is fired after create/update
 *     and that update only fires when embedding-relevant fields change.
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';

// ---------------------------------------------------------------------------
// Group 1: ReembedProducer
// ---------------------------------------------------------------------------
describe('ReembedProducer', () => {
  // Lazy import after potential implementation
  it('enqueueKpi calls queue.add with deterministic jobId and correct payload', async () => {
    const { NLQ_REEMBED_QUEUE, ReembedProducer } = await import('./reembed.producer.js');
    const mockQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const producer = new ReembedProducer(mockQueue as never);

    await producer.enqueueKpi('org-1', 'kpi-abc');

    expect(mockQueue.add).toHaveBeenCalledOnce();
    const [name, payload, opts] = mockQueue.add.mock.calls[0] as [string, unknown, Record<string, unknown>];
    expect(name).toBe('reembed-kpi');
    expect(payload).toEqual({ orgId: 'org-1', kpiId: 'kpi-abc' });
    expect(opts.jobId).toBe('reembed-kpi-abc');
    expect(opts.removeOnComplete).toBe(true);
    expect(NLQ_REEMBED_QUEUE).toBe('nlq-reembed');
  });

  it('enqueueOrg calls queue.add with deterministic org-scoped jobId', async () => {
    const { ReembedProducer } = await import('./reembed.producer.js');
    const mockQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const producer = new ReembedProducer(mockQueue as never);

    await producer.enqueueOrg('org-99');

    expect(mockQueue.add).toHaveBeenCalledOnce();
    const [name, payload, opts] = mockQueue.add.mock.calls[0] as [string, unknown, Record<string, unknown>];
    expect(name).toBe('reembed-org');
    expect(payload).toEqual({ orgId: 'org-99' });
    expect(opts.jobId).toBe('reembed-org-org-99');
    expect(opts.removeOnComplete).toBe(true);
  });

  it('enqueueKpi swallows queue errors (fire-and-forget)', async () => {
    const { ReembedProducer } = await import('./reembed.producer.js');
    const mockQueue = { add: vi.fn().mockRejectedValue(new Error('Redis down')) };
    const producer = new ReembedProducer(mockQueue as never);

    // Must not throw
    await expect(producer.enqueueKpi('org-1', 'kpi-1')).resolves.toBeUndefined();
  });

  it('enqueueOrg swallows queue errors (fire-and-forget)', async () => {
    const { ReembedProducer } = await import('./reembed.producer.js');
    const mockQueue = { add: vi.fn().mockRejectedValue(new Error('Redis down')) };
    const producer = new ReembedProducer(mockQueue as never);

    await expect(producer.enqueueOrg('org-1')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Group 2: ReembedProcessor
// ---------------------------------------------------------------------------
describe('ReembedProcessor', () => {
  it("'reembed-kpi' job calls reembedKpi under the org's RequestContext", async () => {
    const { ReembedProcessor } = await import('./reembed.processor.js');

    const mockEmbedding = {
      reembedKpi: vi.fn().mockResolvedValue(true),
      reembedAllForOrg: vi.fn().mockResolvedValue(0),
    };
    const processor = new ReembedProcessor(mockEmbedding as never);

    const job = { name: 'reembed-kpi', data: { orgId: 'org-1', kpiId: 'kpi-abc' } };

    let capturedOrgId: string | undefined;
    // Run inside a real RequestContext to verify the processor establishes one
    await processor.process(job as never);

    // The embedding service's reembedKpi should have been called
    expect(mockEmbedding.reembedKpi).toHaveBeenCalledOnce();
    expect(mockEmbedding.reembedKpi).toHaveBeenCalledWith('kpi-abc');
  });

  it("'reembed-org' job calls reembedAllForOrg under the org's RequestContext", async () => {
    const { ReembedProcessor } = await import('./reembed.processor.js');

    const mockEmbedding = {
      reembedKpi: vi.fn().mockResolvedValue(true),
      reembedAllForOrg: vi.fn().mockResolvedValue(5),
    };
    const processor = new ReembedProcessor(mockEmbedding as never);

    const job = { name: 'reembed-org', data: { orgId: 'org-2' } };
    await processor.process(job as never);

    expect(mockEmbedding.reembedAllForOrg).toHaveBeenCalledOnce();
    expect(mockEmbedding.reembedKpi).not.toHaveBeenCalled();
  });

  it("'reembed-kpi' establishes org-scoped RequestContext so embedding service sees the right org", async () => {
    const { ReembedProcessor } = await import('./reembed.processor.js');

    let capturedOrgId: string | undefined;
    const mockEmbedding = {
      reembedKpi: vi.fn().mockImplementation(async (_kpiId: string) => {
        capturedOrgId = RequestContextStore.get()?.organizationId;
        return true;
      }),
      reembedAllForOrg: vi.fn().mockResolvedValue(0),
    };
    const processor = new ReembedProcessor(mockEmbedding as never);
    const job = { name: 'reembed-kpi', data: { orgId: 'org-xyz', kpiId: 'kpi-1' } };

    await processor.process(job as never);

    expect(capturedOrgId).toBe('org-xyz');
  });

  it("'reembed-org' establishes org-scoped RequestContext so reembedAllForOrg sees the right org", async () => {
    const { ReembedProcessor } = await import('./reembed.processor.js');

    let capturedOrgId: string | undefined;
    const mockEmbedding = {
      reembedKpi: vi.fn().mockResolvedValue(true),
      reembedAllForOrg: vi.fn().mockImplementation(async () => {
        capturedOrgId = RequestContextStore.get()?.organizationId;
        return 3;
      }),
    };
    const processor = new ReembedProcessor(mockEmbedding as never);
    const job = { name: 'reembed-org', data: { orgId: 'org-batch' } };

    await processor.process(job as never);

    expect(capturedOrgId).toBe('org-batch');
  });

  it('unknown job name is handled gracefully (no throw)', async () => {
    const { ReembedProcessor } = await import('./reembed.processor.js');
    const mockEmbedding = {
      reembedKpi: vi.fn(),
      reembedAllForOrg: vi.fn(),
    };
    const processor = new ReembedProcessor(mockEmbedding as never);
    const job = { name: 'unknown-job', data: { orgId: 'org-1' } };

    await expect(processor.process(job as never)).resolves.toBeUndefined();
    expect(mockEmbedding.reembedKpi).not.toHaveBeenCalled();
    expect(mockEmbedding.reembedAllForOrg).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Group 3: KpisService trigger — create enqueues, update is selective
// ---------------------------------------------------------------------------
describe('KpisService reembed trigger', () => {
  // We build a minimal KpisService with mocked deps, then assert the
  // ReembedProducer is called / not-called.

  function buildMocks() {
    const orgId = 'org-trigger';
    const userId = 'user-1';

    const fakeKpi = {
      id: 'kpi-1',
      organizationId: orgId,
      name: 'Revenue',
      description: 'Monthly revenue',
      unit: 'USD',
      scope: 'ORG_WIDE' as const,
      type: 'NUMBER',
      direction: 'HIGHER_IS_BETTER',
      frequency: 'MONTHLY',
      aggregationMethod: 'SUM',
      status: 'ACTIVE',
      targetValue: null,
      warningThreshold: null,
      criticalThreshold: null,
      allowNegative: false,
      scorecardQuadrant: null,
      ownerUserId: null,
      tags: ['finance'],
      isActive: true,
      isArchived: false,
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: userId,
      categoryId: null,
      orgUnitAssignments: [],
      userAssignments: [],
    };

    const prisma = {
      kPI: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
          ({ id: 'kpi-1', ...data }),
        ),
        findFirst: vi.fn().mockResolvedValue(fakeKpi),
        findUniqueOrThrow: vi.fn().mockResolvedValue(fakeKpi),
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
          ({ ...fakeKpi, ...data, version: 2 }),
        ),
        count: vi.fn().mockResolvedValue(0),
      },
      kPICategory: { findFirst: vi.fn().mockResolvedValue(null) },
      kPIVersion: { create: vi.fn().mockResolvedValue(undefined) },
      orgUnit: { count: vi.fn().mockResolvedValue(0) },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      orgUnitMember: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
    };

    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const billing = { assertWithinQuota: vi.fn().mockResolvedValue(undefined) };
    const accessContext = {
      resolveForCurrentPrincipal: vi.fn().mockResolvedValue({
        isAdmin: true,
        capabilities: [],
        scopeByDomain: {},
        dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
        dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
        context: { managedOrgUnitIds: [], memberOrgUnitIds: [], directReportIds: [] },
      }),
    };
    const producer = { enqueueKpi: vi.fn().mockResolvedValue(undefined) };

    return { orgId, userId, fakeKpi, prisma, audit, billing, accessContext, producer };
  }

  it('create() enqueues reembed after successful creation', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, prisma, audit, billing, accessContext, producer } = buildMocks();

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined, // approvalGate @Optional
      producer as never, // reembedProducer
    );

    await RequestContextStore.run(
      { userId, organizationId: orgId, roleId: null, principalType: 'user' },
      async () => {
        const dto = {
          name: 'New KPI',
          scope: 'ORG_WIDE' as const,
          type: 'NUMBER' as const,
          direction: 'HIGHER_IS_BETTER' as const,
          frequency: 'MONTHLY' as const,
          aggregationMethod: 'SUM' as const,
          status: 'DRAFT' as const,
          allowNegative: false,
          tags: [] as string[],
        };
        await svc.create(dto);
      },
    );

    expect(producer.enqueueKpi).toHaveBeenCalledOnce();
    expect(producer.enqueueKpi).toHaveBeenCalledWith(orgId, expect.any(String));
  });

  it('update() enqueues reembed when name changes', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, fakeKpi, prisma, audit, billing, accessContext, producer } = buildMocks();

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined,
      producer as never,
    );

    await RequestContextStore.run(
      { userId, organizationId: orgId, roleId: null, principalType: 'user' },
      async () => {
        await svc.update(fakeKpi.id, { name: 'Updated Revenue' });
      },
    );

    expect(producer.enqueueKpi).toHaveBeenCalledOnce();
    expect(producer.enqueueKpi).toHaveBeenCalledWith(orgId, fakeKpi.id);
  });

  it('update() enqueues reembed when description changes', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, fakeKpi, prisma, audit, billing, accessContext, producer } = buildMocks();

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined,
      producer as never,
    );

    await RequestContextStore.run(
      { userId, organizationId: orgId, roleId: null, principalType: 'user' },
      async () => {
        await svc.update(fakeKpi.id, { description: 'New description' });
      },
    );

    expect(producer.enqueueKpi).toHaveBeenCalledOnce();
  });

  it('update() enqueues reembed when unit changes', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, fakeKpi, prisma, audit, billing, accessContext, producer } = buildMocks();

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined,
      producer as never,
    );

    await RequestContextStore.run(
      { userId, organizationId: orgId, roleId: null, principalType: 'user' },
      async () => {
        await svc.update(fakeKpi.id, { unit: 'EUR' });
      },
    );

    expect(producer.enqueueKpi).toHaveBeenCalledOnce();
  });

  it('update() enqueues reembed when tags change', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, fakeKpi, prisma, audit, billing, accessContext, producer } = buildMocks();

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined,
      producer as never,
    );

    await RequestContextStore.run(
      { userId, organizationId: orgId, roleId: null, principalType: 'user' },
      async () => {
        await svc.update(fakeKpi.id, { tags: ['newTag'] });
      },
    );

    expect(producer.enqueueKpi).toHaveBeenCalledOnce();
  });

  it('update() does NOT enqueue reembed when only status changes', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, fakeKpi, prisma, audit, billing, accessContext, producer } = buildMocks();

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined,
      producer as never,
    );

    await RequestContextStore.run(
      { userId, organizationId: orgId, roleId: null, principalType: 'user' },
      async () => {
        await svc.update(fakeKpi.id, { status: 'ACTIVE' });
      },
    );

    expect(producer.enqueueKpi).not.toHaveBeenCalled();
  });

  it('update() does NOT enqueue reembed when only targetValue changes', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, fakeKpi, prisma, audit, billing, accessContext, producer } = buildMocks();

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined,
      producer as never,
    );

    await RequestContextStore.run(
      { userId, organizationId: orgId, roleId: null, principalType: 'user' },
      async () => {
        await svc.update(fakeKpi.id, { targetValue: 999 });
      },
    );

    expect(producer.enqueueKpi).not.toHaveBeenCalled();
  });

  it('update() still succeeds (no throw) even when producer throws', async () => {
    const { KpisService } = await import('../kpis/kpis.service.js');
    const { orgId, userId, fakeKpi, prisma, audit, billing, accessContext } = buildMocks();
    const brokenProducer = { enqueueKpi: vi.fn().mockRejectedValue(new Error('Redis gone')) };

    const svc = new KpisService(
      prisma as never,
      audit as never,
      accessContext as never,
      billing as never,
      undefined,
      brokenProducer as never,
    );

    // Should not throw even when the producer fails
    await expect(
      RequestContextStore.run(
        { userId, organizationId: orgId, roleId: null, principalType: 'user' },
        async () => svc.update(fakeKpi.id, { name: 'Changed' }),
      ),
    ).resolves.toBeDefined();
  });
});
