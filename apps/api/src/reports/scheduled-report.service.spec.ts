/**
 * P3.7 — ScheduledReportService unit tests.
 *
 * Queue is mocked; Prisma is an in-memory fake; AuditService is a no-op spy.
 *
 * Coverage:
 *   1. create() — persists row + registers repeatable job with correct jobId
 *   2. trigger() — enqueues a one-off job (no repeat option)
 *   3. update() with changed cron — removes old repeatable job + adds new one
 *   4. update() toggling isActive=false — removes repeatable job; no new add
 *   5. update() toggling isActive=true — re-adds repeatable job
 *   6. get() — cross-org lookup returns 404
 *   7. remove() — deletes row + removes repeatable job
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ScheduledReportService } from './scheduled-report.service.js';

// ── Fake Prisma ───────────────────────────────────────────────────────────────

interface FakeReport {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  description: string | null;
  dashboardId: string | null;
  kpiIds: string[];
  cron: string;
  format: string;
  recipients: string[];
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

class FakePrisma {
  private nextId = 1;
  store: FakeReport[] = [];

  scheduledReport = {
    create: vi.fn(async ({ data }: { data: Partial<FakeReport> }) => {
      const row: FakeReport = {
        id: `sr_${this.nextId++}`,
        organizationId: data.organizationId!,
        createdById: data.createdById!,
        name: data.name!,
        description: data.description ?? null,
        dashboardId: data.dashboardId ?? null,
        kpiIds: data.kpiIds ?? [],
        cron: data.cron!,
        format: data.format!,
        recipients: data.recipients ?? [],
        isActive: data.isActive ?? true,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.store.push(row);
      return row;
    }),

    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return this.store.filter((r) => r.organizationId === where.organizationId);
    }),

    findFirst: vi.fn(
      async ({ where, include }: { where: Record<string, unknown>; include?: unknown }) => {
        const row = this.store.find(
          (r) => r.id === where.id && r.organizationId === where.organizationId,
        );
        if (!row) return null;
        // Simulate include.runs as empty array when requested.
        if (include) return { ...row, runs: [] };
        return row;
      },
    ),

    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeReport> }) => {
      const idx = this.store.findIndex((r) => r.id === where.id);
      if (idx === -1) throw new Error('not found');
      const updated = { ...this.store[idx]!, ...data, updatedAt: new Date() };
      this.store[idx] = updated;
      return updated;
    }),

    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const idx = this.store.findIndex((r) => r.id === where.id);
      if (idx !== -1) this.store.splice(idx, 1);
    }),
  };
}

// ── Fake BullMQ queue ─────────────────────────────────────────────────────────

class FakeQueue {
  addCalls: Array<{
    name: string;
    data: unknown;
    opts: Record<string, unknown>;
  }> = [];
  repeatableJobs: Array<{ id: string; key: string; pattern: string }> = [];
  removedKeys: string[] = [];

  add = vi.fn(async (name: string, data: unknown, opts: Record<string, unknown> = {}) => {
    this.addCalls.push({ name, data, opts });
    // Simulate a repeatable job being registered.
    const repeat = opts.repeat as { pattern?: string } | undefined;
    if (repeat?.pattern) {
      const id = opts.jobId as string;
      this.repeatableJobs.push({
        id,
        key: `bull:scheduled-report:repeat:${id}:${repeat.pattern}`,
        pattern: repeat.pattern,
      });
    }
    return { id: `job_${Date.now()}` };
  });

  getRepeatableJobs = vi.fn(async () => {
    return this.repeatableJobs;
  });

  removeRepeatableByKey = vi.fn(async (key: string) => {
    this.removedKeys.push(key);
    const idx = this.repeatableJobs.findIndex((j) => j.key === key);
    if (idx !== -1) this.repeatableJobs.splice(idx, 1);
  });
}

// ── No-op audit ───────────────────────────────────────────────────────────────

const fakeAudit: Pick<AuditService, 'record'> = {
  record: vi.fn(async () => undefined),
};

// ── Request context helper ────────────────────────────────────────────────────

const ORG_A = 'org_a';
const ORG_B = 'org_b';
const USER_A = 'user_a';

function runAs(orgId: string, userId: string, fn: () => Promise<void>): Promise<void> {
  const ctx: RequestContext = {
    userId,
    organizationId: orgId,
    roleId: null,
    principalType: 'user',
  };
  return RequestContextStore.run(ctx, fn) as Promise<void>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScheduledReportService', () => {
  let prisma: FakePrisma;
  let queue: FakeQueue;
  let service: ScheduledReportService;

  beforeEach(() => {
    prisma = new FakePrisma();
    queue = new FakeQueue();
    service = new ScheduledReportService(
      prisma as unknown as PrismaService,
      fakeAudit as unknown as AuditService,
      queue as never, // Queue<ScheduledReportJobData>
    );
    vi.clearAllMocks();
    // Reset internal state
    prisma.store = [];
    queue.addCalls = [];
    queue.repeatableJobs = [];
    queue.removedKeys = [];
  });

  // 1. create() — repeatable job registered
  test('create() persists row and registers repeatable job with correct jobId', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Weekly Sales',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['ceo@example.com'],
      });

      expect(row.id).toBeTruthy();
      expect(row.organizationId).toBe(ORG_A);
      expect(row.name).toBe('Weekly Sales');

      // Queue.add should have been called with repeat + deterministic jobId.
      expect(queue.add).toHaveBeenCalledOnce();
      const [jobName, _jobData, opts] = queue.add.mock.calls[0]!;
      expect(jobName).toBe('run');
      expect((opts as Record<string, unknown>).jobId).toBe(`scheduled-report:${row.id}`);
      expect(((opts as Record<string, unknown>).repeat as { pattern: string }).pattern).toBe('0 9 * * 1');
    });
  });

  // 2. trigger() — one-off job, no repeat
  test('trigger() enqueues a one-off job without repeat option', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Trigger Test',
        cron: '0 8 * * *',
        format: 'PDF',
        recipients: ['a@b.com'],
      });

      // Reset after create.
      queue.add.mockClear();

      await service.trigger(row.id);

      expect(queue.add).toHaveBeenCalledOnce();
      const [jobName, _data, opts] = queue.add.mock.calls[0]!;
      expect(jobName).toBe('run');
      // Manual trigger should NOT have repeat.
      expect((opts as Record<string, unknown> | undefined)?.repeat).toBeUndefined();
    });
  });

  // 3. update() with changed cron — remove + re-add
  test('update() with changed cron removes old repeatable job and adds new one', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Cron Change Test',
        cron: '0 9 * * 1',
        format: 'EXCEL',
        recipients: ['x@y.com'],
      });

      queue.add.mockClear();

      await service.update(row.id, { cron: '0 10 * * 2' });

      // Should have removed the old key and added a new job.
      expect(queue.removeRepeatableByKey).toHaveBeenCalledOnce();
      expect(queue.add).toHaveBeenCalledOnce();
      const [, , newOpts] = queue.add.mock.calls[0]!;
      expect(
        ((newOpts as Record<string, unknown>).repeat as { pattern: string }).pattern,
      ).toBe('0 10 * * 2');
    });
  });

  // 4. update() toggling isActive=false — remove job
  test('update() toggling isActive=false removes repeatable job and does not re-add', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Deactivate Test',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['x@y.com'],
      });

      queue.add.mockClear();

      await service.update(row.id, { isActive: false });

      expect(queue.removeRepeatableByKey).toHaveBeenCalledOnce();
      // Should NOT add a new job since it's now inactive.
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  // 5. update() toggling isActive=true — re-add job
  test('update() toggling isActive=true re-adds the repeatable job', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Reactivate Test',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['x@y.com'],
      });

      // First, deactivate.
      await service.update(row.id, { isActive: false });
      queue.add.mockClear();
      queue.removeRepeatableByKey.mockClear();

      // Then, reactivate.
      await service.update(row.id, { isActive: true });

      // Should add the repeatable job again.
      expect(queue.add).toHaveBeenCalledOnce();
      const [, , opts] = queue.add.mock.calls[0]!;
      expect(((opts as Record<string, unknown>).repeat as { pattern: string }).pattern).toBe(
        '0 9 * * 1',
      );
    });
  });

  // 6. get() — cross-org lookup returns 404
  test('get() returns 404 for a report owned by a different org', async () => {
    let reportId: string;

    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Org A Report',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['a@b.com'],
      });
      reportId = row.id;
    });

    await runAs(ORG_B, 'user_b', async () => {
      await expect(service.get(reportId!)).rejects.toThrow(NotFoundException);
    });
  });

  // 7. remove() — deletes row + removes repeatable job
  test('remove() deletes the row and removes the repeatable job', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Delete Test',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['a@b.com'],
      });

      queue.removeRepeatableByKey.mockClear();

      await service.remove(row.id);

      expect(queue.removeRepeatableByKey).toHaveBeenCalledOnce();
      expect(prisma.store.find((r) => r.id === row.id)).toBeUndefined();
    });
  });
});
