import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { ReportFormat } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
 * Creates/manages ScheduledReport rows and synchronises BullMQ repeatable jobs.
 *
 * Job naming convention:
 *   name: 'run'
 *   jobId (for deduplication): 'scheduled-report:<id>'
 *   repeat pattern: the stored cron expression
 */
@Injectable()
export class ScheduledReportService {
  private readonly logger = new Logger(ScheduledReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_NAME) private readonly queue: Queue<ScheduledReportJobData>,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  private jobId(id: string): string {
    return `scheduled-report:${id}`;
  }

  /**
   * Register a BullMQ repeatable job for the given scheduled report.
   * In BullMQ v5 the repeatable job identity key is:
   *   `<queue>:<name>:<jobId>:<cron>`
   * We use a deterministic jobId so we can remove it by pattern.
   */
  private async addRepeatableJob(id: string, organizationId: string, cron: string): Promise<void> {
    await this.queue.add(
      'run',
      { scheduledReportId: id, organizationId },
      {
        repeat: { pattern: cron },
        jobId: this.jobId(id),
      },
    );
    this.logger.log(`Registered repeatable job for scheduled-report ${id} with cron "${cron}"`);
  }

  /**
   * Remove the repeatable job for a scheduled report.
   * BullMQ v5: removeRepeatableByKey expects the repeat job's key which is
   *   `repeat:<jobId>:<cron-hash>`.
   * A more reliable approach is to iterate getRepeatableJobs() and remove by
   * matching our jobId pattern, which is deterministic.
   */
  private async removeRepeatableJob(id: string): Promise<void> {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const target = repeatableJobs.find((j) => j.id === this.jobId(id));
    if (target) {
      await this.queue.removeRepeatableByKey(target.key);
      this.logger.log(`Removed repeatable job for scheduled-report ${id}`);
    } else {
      this.logger.warn(`No repeatable job found for scheduled-report ${id} — skipping removal`);
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateScheduledReportDto) {
    const ctx = RequestContextStore.require();

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

    await this.addRepeatableJob(row.id, ctx.organizationId, dto.cron);

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
    return this.prisma.scheduledReport.findMany({
      where: { organizationId: ctx.organizationId },
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
    return row;
  }

  async update(id: string, patch: UpdateScheduledReportDto) {
    const ctx = RequestContextStore.require();

    const existing = await this.prisma.scheduledReport.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Scheduled report not found' });
    }

    const cronChanged = patch.cron !== undefined && patch.cron !== existing.cron;
    const isActiveChanged = patch.isActive !== undefined && patch.isActive !== existing.isActive;

    // Synchronise the repeatable job:
    // - If cron changed: remove old, add new (if still/becoming active).
    // - If toggled inactive: remove.
    // - If toggled active (no cron change): re-add with existing cron.
    const newCron = patch.cron ?? existing.cron;
    const newIsActive = patch.isActive ?? existing.isActive;

    if (cronChanged || isActiveChanged) {
      // Always remove first to avoid duplicates.
      await this.removeRepeatableJob(id);

      if (newIsActive) {
        await this.addRepeatableJob(id, ctx.organizationId, newCron);
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
    const ctx = RequestContextStore.require();

    const existing = await this.prisma.scheduledReport.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Scheduled report not found' });
    }

    await this.removeRepeatableJob(id);

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

    const existing = await this.prisma.scheduledReport.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Scheduled report not found' });
    }

    await this.queue.add('run', {
      scheduledReportId: id,
      organizationId: ctx.organizationId,
      manual: true,
    });

    this.logger.log(`Manually triggered scheduled-report ${id}`);
  }
}
