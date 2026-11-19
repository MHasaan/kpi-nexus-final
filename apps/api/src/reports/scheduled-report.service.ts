import { isTimeZone } from '@kpi-nexus/contracts';
import { BillingService } from '../billing/billing.service.js';
import { Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { ReportFormat } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { scopedUserIds } from '../rbac/visibility/domain-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/reports.dto.js';

export interface ScheduledReportJobData {
  scheduledReportId: string;
  organizationId: string;
  manual?: boolean;
}

const QUEUE_NAME = 'scheduled-report';

/**
 * P3.7 — ScheduledReportService.
 * Creates/manages ScheduledReport rows and keeps each active report on a schedule of its own.
 *
 * Each active report has one BullMQ job scheduler, named `scheduled-report-<id>`, that adds a
 * 'run' job at the stored cron time on the organisation's clock. The name is how it is found again
 * to move it to a new time (an upsert replaces it) or to remove it.
 *
 * Until 2026-11-20 reports were scheduled with `add(…, { repeat, jobId })` and found again by that
 * jobId, which BullMQ 5's schedules do not carry: nothing was ever removed. A changed time left the
 * old schedule running beside the new one, so the report went out at both, and every paused or
 * deleted report left its schedule behind. `reconcileSchedules` clears those at start-up.
 */
@Injectable()
export class ScheduledReportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_NAME) private readonly queue: Queue<ScheduledReportJobData>,
    private readonly accessContext: AccessContextService,
    private readonly billing: BillingService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  /** `{ in: ids }` restricting scheduled reports to creators in the REPORTS scope,
   *  or `undefined` (ORG / admin ⇒ no creator narrowing). Default REPORTS scope is
   *  ORG ⇒ undefined ⇒ all reports in tenant (parity). */
  private async creatorScope(): Promise<{ in: string[] } | undefined> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return undefined;
    const scope = profile.scopeByDomain.REPORTS ?? 'ORG';
    if (scope === 'ORG') return undefined;
    const unitMemberUserIds = scope === 'UNITS' ? await this.accessContext.unitMemberUserIds() : [];
    const ids = scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    })!; // non-null: scope !== ORG
    return { in: ids };
  }

  /**
   * No colon in it: asked about an id with one that it does not hold, BullMQ reads the id as an
   * old-style repeat key and answers with an empty placeholder instead of nothing.
   */
  private schedulerId(id: string): string {
    return `scheduled-report-${id}`;
  }

  /** "08:00 every day" means 08:00 where the organisation is, not 08:00 UTC. */
  private async timezoneOf(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
    return org?.timezone && isTimeZone(org.timezone) ? org.timezone : 'UTC';
  }

  /**
   * Put a report on its schedule, or move it to a new time: the scheduler named for the report is
   * replaced, so no earlier time stays behind.
   */
  private async schedule(id: string, organizationId: string, cron: string, tz?: string): Promise<void> {
    await this.queue.upsertJobScheduler(
      this.schedulerId(id),
      { pattern: cron, tz: tz ?? (await this.timezoneOf(organizationId)) },
      { name: 'run', data: { scheduledReportId: id, organizationId } },
    );
  }

  /** Take a report off its schedule (paused or deleted). Nothing to remove is not a problem. */
  private async unschedule(id: string): Promise<void> {
    if (await this.queue.removeJobScheduler(this.schedulerId(id))) {
      this.logger.log(`Took report ${id} off its schedule`);
    }
  }

  /** On start-up, make the schedules match the reports; see `reconcileSchedules`. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const { removed, scheduled } = await this.reconcileSchedules();
      this.logger.log(`Report schedules: ${scheduled} active, ${removed} left over removed`);
    } catch (err) {
      // Redis may not be up yet; the schedules are reconciled on the next start.
      this.logger.warn(`Could not reconcile report schedules: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Make BullMQ's schedules for this queue exactly one per active report: remove every schedule
   * that is not an active report's own — those left by paused, deleted or re-timed reports, which
   * could not be removed before 2026-11-20 — and put each active report on its own. Running it
   * again changes nothing. This queue holds report schedules only.
   */
  async reconcileSchedules(): Promise<{ removed: number; scheduled: number }> {
    const active = await RequestContextStore.runWithBypass('scheduled-report-schedules', () =>
      this.prisma.scheduledReport.findMany({ where: { isActive: true }, select: { id: true, organizationId: true, cron: true } }),
    );
    const wanted = new Set(active.map((r) => this.schedulerId(r.id)));
    let removed = 0;
    for (const scheduler of await this.queue.getJobSchedulers(0, -1)) {
      if (wanted.has(scheduler.key)) continue;
      if (await this.queue.removeJobScheduler(scheduler.key)) removed += 1;
    }
    const zones = new Map<string, string>();
    for (const report of active) {
      let tz = zones.get(report.organizationId);
      if (tz === undefined) {
        tz = await RequestContextStore.runWithBypass('scheduled-report-schedules', () => this.timezoneOf(report.organizationId));
        zones.set(report.organizationId, tz);
      }
      await this.schedule(report.id, report.organizationId, report.cron, tz);
    }
    return { removed, scheduled: active.length };
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateScheduledReportDto) {
    const ctx = RequestContextStore.require();
    // Only on a plan that includes it: 402 FEATURE_NOT_IN_PLAN otherwise.
    await this.billing.assertFeature('scheduled_reports');

    const row = await this.prisma.scheduledReport.create({
      data: {
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        name: dto.name,
        description: dto.description ?? null,
        dashboardId: dto.dashboardId ?? null,
        kpiIds: dto.kpiIds ?? [],
        cron: dto.cron,
        format: dto.format as ReportFormat,
        recipients: dto.recipients,
        isActive: true,
      },
    });

    await this.schedule(row.id, ctx.organizationId, dto.cron);
    this.logger.log(`Scheduled report ${row.id} at "${dto.cron}"`);

    await this.audit.record({
      action: 'CREATE',
      entityType: 'ScheduledReport',
      entityId: row.id,
      metadata: { name: dto.name, cron: dto.cron, format: dto.format },
    });

    return row;
  }

  async list() {
    const ctx = RequestContextStore.require();
    const creatorScope = await this.creatorScope();
    return this.prisma.scheduledReport.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(creatorScope ? { createdById: creatorScope } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const ctx = RequestContextStore.require();
    const row = await this.prisma.scheduledReport.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        runs: {
          orderBy: { ranAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Scheduled report not found' });
    }
    const creatorScope = await this.creatorScope();
    if (creatorScope && !creatorScope.in.includes(row.createdById)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Scheduled report not found' });
    }
    return row;
  }

  async update(id: string, patch: UpdateScheduledReportDto) {
    const ctx = RequestContextStore.require();

    const existing = await this.get(id); // tenant + REPORTS-scope gate (404 if out of scope)

    const cronChanged = patch.cron !== undefined && patch.cron !== existing.cron;
    const isActiveChanged = patch.isActive !== undefined && patch.isActive !== existing.isActive;

    // Keep the schedule in step: active ⇒ on its schedule at the (new) time, which replaces any
    // earlier one; paused ⇒ off it.
    const newCron = patch.cron ?? existing.cron;
    const newIsActive = patch.isActive ?? existing.isActive;

    if (cronChanged || isActiveChanged) {
      if (newIsActive) {
        await this.schedule(id, ctx.organizationId, newCron);
        this.logger.log(`Scheduled report ${id} at "${newCron}"`);
      } else {
        await this.unschedule(id);
      }
    }

    const updated = await this.prisma.scheduledReport.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.dashboardId !== undefined && { dashboardId: patch.dashboardId }),
        ...(patch.kpiIds !== undefined && { kpiIds: patch.kpiIds }),
        ...(patch.cron !== undefined && { cron: patch.cron }),
        ...(patch.format !== undefined && { format: patch.format as ReportFormat }),
        ...(patch.recipients !== undefined && { recipients: patch.recipients }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
      },
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'ScheduledReport',
      entityId: id,
      metadata: { patch },
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.get(id); // tenant + REPORTS-scope gate (404 if out of scope)

    await this.unschedule(id);

    await this.prisma.scheduledReport.delete({ where: { id } });

    await this.audit.record({
      action: 'DELETE',
      entityType: 'ScheduledReport',
      entityId: id,
      metadata: { name: existing.name },
    });
  }

  /**
   * Enqueue a one-off (non-repeating) run for an existing scheduled report.
   * Used for "Run now" / integration testing — does not interfere with the
   * repeatable schedule.
   */
  async trigger(id: string): Promise<void> {
    const ctx = RequestContextStore.require();

    await this.get(id); // tenant + REPORTS-scope gate (404 if out of scope)

    await this.queue.add('run', {
      scheduledReportId: id,
      organizationId: ctx.organizationId,
      manual: true,
    });

    this.logger.log(`Manually triggered scheduled-report ${id}`);
  }
}
