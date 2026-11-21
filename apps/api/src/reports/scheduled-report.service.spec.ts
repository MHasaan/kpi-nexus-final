/**
 * P3.7 — ScheduledReportService unit tests.
 *
 * Queue is mocked; Prisma is an in-memory fake; AuditService is a no-op spy.
 *
 * Coverage:
 *   1. create() — persists the row and puts the report on a schedule of its own
 *   2. trigger() — enqueues a one-off job (no repeat option)
 *   3. update() with a changed time — the schedule is replaced; the old time does not stay behind
 *   4. update() pausing — the report leaves its schedule
 *   5. update() resuming — the report is back on its schedule, once
 *   6. get() — cross-org lookup returns 404
 *   7. remove() — deletes the row and its schedule
 *   8. on start-up, the schedules are made to match the active reports
 *
 * The fake queue behaves as BullMQ 5.77 does. Until 2026-11-20 it gave every
 * repeatable job an `id`, which the real one does not: removal looked jobs up by
 * that id, found nothing in production, and these tests could not tell.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { Scope } from '@kpi-nexus/contracts';

import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
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
  /** What the organisation's settings say; UTC unless a test changes it. */
  organizationTimezone = 'UTC';
  organization = { findUnique: vi.fn(async () => ({ timezone: this.organizationTimezone })) };

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
      return this.store.filter((r) => {
        if (where.organizationId !== undefined && r.organizationId !== where.organizationId) return false;
        if (where.isActive !== undefined && r.isActive !== where.isActive) return false;
        const cond = where.createdById;
        if (cond !== undefined) {
          if (cond && typeof cond === 'object' && 'in' in (cond as Record<string, unknown>)) {
            if (!(cond as { in: string[] }).in.includes(r.createdById)) return false;
          } else if (r.createdById !== cond) {
            return false;
          }
        }
        return true;
      });
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

// ── Fake BullMQ queue, as BullMQ 5.77 behaves ─────────────────────────────────
// A job scheduler is found by its id, which is also its key. A schedule made by
// `add(name, data, { repeat, jobId })` — how reports were scheduled before
// 2026-11-20 — is a scheduler with a hashed key and no id; `legacy()` seeds one.

interface FakeScheduler {
  key: string;
  name: string;
  pattern: string;
  tz?: string;
  data?: { scheduledReportId?: string; organizationId?: string };
}

class FakeQueue {
  addCalls: Array<{
    name: string;
    data: unknown;
    opts: Record<string, unknown>;
  }> = [];
  schedulers = new Map<string, FakeScheduler>();

  add = vi.fn(async (name: string, data: unknown, opts: Record<string, unknown> = {}) => {
    this.addCalls.push({ name, data, opts });
    return { id: `job_${this.addCalls.length}` };
  });

  upsertJobScheduler = vi.fn(
    async (id: string, repeat: { pattern: string; tz?: string }, template: { name?: string; data?: FakeScheduler['data'] } = {}) => {
      this.schedulers.set(id, { key: id, name: template.name ?? id, pattern: repeat.pattern, tz: repeat.tz, data: template.data });
      return { id: `next:${id}` };
    },
  );

  removeJobScheduler = vi.fn(async (id: string) => this.schedulers.delete(id));

  getJobSchedulers = vi.fn(async () => [...this.schedulers.values()]);

  /** A schedule the old code left: a hashed key, no id, nothing to say whose it is. */
  legacy(key: string, pattern: string): void {
    this.schedulers.set(key, { key, name: 'run', pattern });
  }

  /** The schedules that run one report. */
  of(reportId: string): FakeScheduler[] {
    return [...this.schedulers.values()].filter((s) => s.data?.scheduledReportId === reportId);
  }
}

// ── No-op audit ───────────────────────────────────────────────────────────────

const fakeAudit: Pick<AuditService, 'record'> = {
  record: vi.fn(async () => undefined),
};

// ── Fake AccessContext ──────────────────────────────────────────────────────────

class FakeAccessContext {
  isAdmin = false;
  reportsScope: Scope = 'ORG';
  directReportIds: string[] = [];
  unitMemberIds: string[] = [];
  resolveForCurrentPrincipal = vi.fn(async () => ({
    isAdmin: this.isAdmin,
    capabilities: [],
    scopeByDomain: { REPORTS: this.reportsScope },
    dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
    dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
    context: { managedOrgUnitIds: [], memberOrgUnitIds: [], directReportIds: this.directReportIds },
  }));
  unitMemberUserIds = vi.fn(async () => this.unitMemberIds);
}

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
  let accessContext: FakeAccessContext;
  let service: ScheduledReportService;

  beforeEach(() => {
    prisma = new FakePrisma();
    queue = new FakeQueue();
    accessContext = new FakeAccessContext();
    service = new ScheduledReportService(
      prisma as unknown as PrismaService,
      fakeAudit as unknown as AuditService,
      queue as never, // Queue<ScheduledReportJobData>
      accessContext as unknown as AccessContextService,
      { assertFeature: async () => undefined } as never,
    );
    vi.clearAllMocks();
    // Reset internal state
    prisma.store = [];
    queue.addCalls = [];
    queue.schedulers.clear();
  });

  // 1. create() — on a schedule of its own
  test('create() persists the row and puts the report on a schedule of its own, named for it', async () => {
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

      // One scheduler, named for the report, so it can be found again to move or remove it.
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `scheduled-report-${row.id}`,
        { pattern: '0 9 * * 1', tz: 'UTC' },
        { name: 'run', data: { scheduledReportId: row.id, organizationId: ORG_A } },
      );
      expect(queue.of(row.id)).toHaveLength(1);
    });
  });

  test("the schedule runs on the organisation's clock: the job carries its timezone (plan 6.1)", async () => {
    prisma.organizationTimezone = 'Asia/Karachi';
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({ name: 'Morning numbers', cron: '0 8 * * *', format: 'CSV', recipients: ['ceo@example.com'] });
      expect(queue.of(row.id)).toEqual([expect.objectContaining({ pattern: '0 8 * * *', tz: 'Asia/Karachi' })]);
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

  // 3. update() with a changed time — the bug: the new time was added and the old one left
  //    running, so the report went out at both.
  test('update() with a changed time replaces the schedule: the old time does not stay behind', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Cron Change Test',
        cron: '0 9 * * 1',
        format: 'EXCEL',
        recipients: ['x@y.com'],
      });

      await service.update(row.id, { cron: '0 10 * * 2' });

      expect(queue.of(row.id).map((s) => s.pattern)).toEqual(['0 10 * * 2']);
    });
  });

  // 4. update() pausing — off its schedule
  test('update() pausing takes the report off its schedule and puts it on no other', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Deactivate Test',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['x@y.com'],
      });

      await service.update(row.id, { isActive: false });

      expect(queue.of(row.id)).toEqual([]);
    });
  });

  // 5. update() resuming — back on its schedule, once
  test('update() resuming puts the report back on its schedule, once', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Reactivate Test',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['x@y.com'],
      });

      await service.update(row.id, { isActive: false });
      await service.update(row.id, { isActive: true });

      expect(queue.of(row.id).map((s) => s.pattern)).toEqual(['0 9 * * 1']);
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

  // 7. remove() — the row and its schedule
  test('remove() deletes the row and its schedule', async () => {
    await runAs(ORG_A, USER_A, async () => {
      const row = await service.create({
        name: 'Delete Test',
        cron: '0 9 * * 1',
        format: 'CSV',
        recipients: ['a@b.com'],
      });

      await service.remove(row.id);

      expect(queue.of(row.id)).toEqual([]);
      expect(prisma.store.find((r) => r.id === row.id)).toBeUndefined();
    });
  });

  // 8. list() default ORG scope — no createdById narrowing (parity)
  test('list() default ORG ⇒ createdById unfiltered (parity)', async () => {
    await runAs(ORG_A, USER_A, async () => {
      await service.create({ name: 'R', cron: '0 9 * * 1', format: 'CSV', recipients: ['a@b.com'] });
      await service.list();
      const where = prisma.scheduledReport.findMany.mock.calls.at(-1)![0]!.where as Record<string, unknown>;
      expect(where.createdById).toBeUndefined();
    });
  });

  // 9. list() SELF scope — createdById narrowed to self
  test('list() SELF ⇒ createdById IN {me}', async () => {
    accessContext.reportsScope = 'SELF';
    await runAs(ORG_A, 'me', async () => {
      await service.list();
      const where = prisma.scheduledReport.findMany.mock.calls.at(-1)![0]!.where as Record<string, unknown>;
      expect(where.createdById).toEqual({ in: ['me'] });
    });
  });

  // 10. get() SELF scope — own report visible; another creator ⇒ 404
  test('get() SELF ⇒ own report visible; another creator ⇒ 404', async () => {
    accessContext.reportsScope = 'SELF';
    let mineId = '';
    let theirsId = '';
    await runAs(ORG_A, 'me', async () => {
      const r = await service.create({ name: 'Mine', cron: '0 9 * * 1', format: 'CSV', recipients: ['a@b.com'] });
      mineId = r.id;
    });
    await runAs(ORG_A, 'other', async () => {
      const r = await service.create({ name: 'Theirs', cron: '0 9 * * 1', format: 'CSV', recipients: ['a@b.com'] });
      theirsId = r.id;
    });
    await runAs(ORG_A, 'me', async () => {
      const got = await service.get(mineId);
      expect(got.id).toBe(mineId);
      await expect(service.get(theirsId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // 11. update() SELF scope — another creator's report ⇒ 404 (no mutation, no queue churn)
  test('update() SELF ⇒ another creator report throws 404', async () => {
    accessContext.reportsScope = 'SELF';
    let theirsId = '';
    await runAs(ORG_A, 'other', async () => {
      const r = await service.create({ name: 'Theirs', cron: '0 9 * * 1', format: 'CSV', recipients: ['a@b.com'] });
      theirsId = r.id;
    });
    await runAs(ORG_A, 'me', async () => {
      queue.upsertJobScheduler.mockClear();
      queue.removeJobScheduler.mockClear();
      await expect(service.update(theirsId, { cron: '0 10 * * 2' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // No schedule changes and the stored cron is untouched.
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
      expect(queue.removeJobScheduler).not.toHaveBeenCalled();
    });
    expect(prisma.store.find((r) => r.id === theirsId)!.cron).toBe('0 9 * * 1');
  });

  // 12. remove() SELF scope — another creator's report ⇒ 404 (no delete)
  test('remove() SELF ⇒ another creator report throws 404 (no delete)', async () => {
    accessContext.reportsScope = 'SELF';
    let theirsId = '';
    await runAs(ORG_A, 'other', async () => {
      const r = await service.create({ name: 'Theirs', cron: '0 9 * * 1', format: 'CSV', recipients: ['a@b.com'] });
      theirsId = r.id;
    });
    await runAs(ORG_A, 'me', async () => {
      queue.removeJobScheduler.mockClear();
      await expect(service.remove(theirsId)).rejects.toBeInstanceOf(NotFoundException);
      expect(queue.removeJobScheduler).not.toHaveBeenCalled();
    });
    // Row must still exist.
    expect(prisma.store.find((r) => r.id === theirsId)).toBeDefined();
  });

  // 13. trigger() SELF scope — another creator's report ⇒ 404 (no enqueue)
  test('trigger() SELF ⇒ another creator report throws 404 (no enqueue)', async () => {
    accessContext.reportsScope = 'SELF';
    let theirsId = '';
    await runAs(ORG_A, 'other', async () => {
      const r = await service.create({ name: 'Theirs', cron: '0 9 * * 1', format: 'CSV', recipients: ['a@b.com'] });
      theirsId = r.id;
    });
    await runAs(ORG_A, 'me', async () => {
      queue.add.mockClear();
      await expect(service.trigger(theirsId)).rejects.toBeInstanceOf(NotFoundException);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  // 14. update()/remove()/trigger() SELF scope — own report still succeeds (parity)
  test('update()/remove()/trigger() SELF ⇒ own report succeeds', async () => {
    accessContext.reportsScope = 'SELF';
    await runAs(ORG_A, 'me', async () => {
      const r = await service.create({ name: 'Mine', cron: '0 9 * * 1', format: 'CSV', recipients: ['a@b.com'] });
      // update
      const updated = await service.update(r.id, { name: 'Mine v2' });
      expect(updated.name).toBe('Mine v2');
      // trigger
      queue.add.mockClear();
      await service.trigger(r.id);
      expect(queue.add).toHaveBeenCalledOnce();
      // remove
      await service.remove(r.id);
      expect(prisma.store.find((x) => x.id === r.id)).toBeUndefined();
    });
  });

  // 8. On start-up. Until 2026-11-20 no schedule could be removed (see the fake queue), so every paused,
  //    deleted or re-timed report left one behind — 629 of them on one test stack — and a re-timed report
  //    went out at both times. Start-up removes what no active report owns and gives each its own.
  describe('on start-up, the schedules match the active reports', () => {
    const report = (over: Partial<FakeReport> & Pick<FakeReport, 'id' | 'organizationId' | 'cron'>): FakeReport => ({
      createdById: USER_A,
      name: over.id,
      description: null,
      dashboardId: null,
      kpiIds: [],
      format: 'CSV',
      recipients: ['a@b.com'],
      isActive: true,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...over,
    });

    test('what no active report owns is removed, and every active report has one schedule of its own', async () => {
      prisma.store.push(
        report({ id: 'sr_live', organizationId: ORG_A, cron: '0 9 * * 1' }),
        report({ id: 'sr_other', organizationId: ORG_B, cron: '30 7 * * *' }),
        report({ id: 'sr_paused', organizationId: ORG_A, cron: '0 9 1 * *', isActive: false }),
      );
      // Left by the old code: sr_live's schedule and an old time of it, and sr_paused's.
      queue.legacy('f2d70fa37e82fdbbc97b76ea303156dc', '0 9 * * 1');
      queue.legacy('1b2c3d4e5f60718293a4b5c6d7e8f901', '0 8 * * 1');
      queue.legacy('0a1b2c3d4e5f60718293a4b5c6d7e8f9', '0 9 1 * *');
      // And one for a report deleted since.
      await queue.upsertJobScheduler('scheduled-report-sr_deleted', { pattern: '0 6 * * *' }, { name: 'run', data: { scheduledReportId: 'sr_deleted', organizationId: ORG_A } });

      await expect(service.reconcileSchedules()).resolves.toEqual({ removed: 4, scheduled: 2 });

      expect([...queue.schedulers.keys()].sort()).toEqual(['scheduled-report-sr_live', 'scheduled-report-sr_other']);
      expect(queue.of('sr_live').map((s) => s.pattern)).toEqual(['0 9 * * 1']);
      expect(queue.of('sr_other')).toEqual([expect.objectContaining({ pattern: '30 7 * * *', data: { scheduledReportId: 'sr_other', organizationId: ORG_B } })]);
    });

    test('run again, it changes nothing', async () => {
      prisma.store.push(report({ id: 'sr_live', organizationId: ORG_A, cron: '0 9 * * 1' }));
      await service.reconcileSchedules();
      await expect(service.reconcileSchedules()).resolves.toEqual({ removed: 0, scheduled: 1 });
      expect([...queue.schedulers.keys()]).toEqual(['scheduled-report-sr_live']);
    });

    test('without Redis at start-up, the app still starts', async () => {
      queue.getJobSchedulers.mockRejectedValueOnce(new Error('no redis'));
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });
});
