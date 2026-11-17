import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  RETENTION_ENTITY_TYPES,
  RETENTION_TIERS,
  type RetentionEntityType,
  type RetentionTier,
  resolveTierDays,
} from './retention-tiers.js';

const policySelect = {
  id: true,
  organizationId: true,
  entityType: true,
  days: true,
  isActive: true,
  purgeEnabledAt: true,
  lastRunAt: true,
  lastRunDeleted: true,
} satisfies Prisma.RetentionPolicySelect;

export type PublicRetentionPolicy = Prisma.RetentionPolicyGetPayload<{ select: typeof policySelect }>;

/** What one policy would delete if it ran now. */
export interface RetentionPreviewRow {
  entityType: string;
  days: number;
  /** Whether an administrator has turned purging on for this policy. */
  purging: boolean;
  /** Rows older than the policy's days. */
  rows: number;
}

/** Rows deleted per round, so one purge never holds a long lock. */
const BATCH = 1000;
/** Rounds per policy per run: a backlog larger than this is finished on the following days. */
const MAX_BATCHES = 200;
const DAY_MS = 86_400_000;

/** The minimal table shape a purge needs. */
interface PurgeTable {
  count(args: { where: Record<string, unknown> }): Promise<number>;
  findMany(args: { where: Record<string, unknown>; select: { id: true }; take: number }): Promise<Array<{ id: string }>>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

function isEntityType(value: string): value is RetentionEntityType {
  return (RETENTION_ENTITY_TYPES as readonly string[]).includes(value);
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PublicRetentionPolicy[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.retentionPolicy.findMany({ where: { organizationId: ctx.organizationId }, select: policySelect, orderBy: [{ entityType: 'asc' }] });
  }

  listTiers(): Array<{ tier: RetentionTier; days: number }> {
    return (Object.keys(RETENTION_TIERS) as RetentionTier[]).map((tier) => ({ tier, days: RETENTION_TIERS[tier] }));
  }

  /** One-click: set every entity type's retention to the tier's day count. */
  async applyTier(tier: RetentionTier): Promise<PublicRetentionPolicy[]> {
    const days = resolveTierDays(tier);
    for (const entityType of RETENTION_ENTITY_TYPES) await this.saveDays(entityType, days);
    await this.audit.record({ action: 'UPDATE', entityType: 'RetentionPolicy', entityId: tier, metadata: { tier, days } });
    return this.list();
  }

  /** Set how long one kind of row is kept. */
  async setDays(entityType: string, days: number): Promise<PublicRetentionPolicy[]> {
    const type = this.entityType(entityType);
    await this.saveDays(type, days);
    await this.audit.record({ action: 'UPDATE', entityType: 'RetentionPolicy', entityId: type, metadata: { entityType: type, days } });
    return this.list();
  }

  /**
   * Write a policy's days. A change of days turns purging off for that policy:
   * a new (perhaps much shorter) period must be previewed and turned on again
   * before it deletes anything.
   */
  private async saveDays(entityType: RetentionEntityType, days: number): Promise<void> {
    const ctx = RequestContextStore.require();
    const key = { organizationId_entityType: { organizationId: ctx.organizationId, entityType } };
    const existing = await this.prisma.retentionPolicy.findUnique({ where: key, select: { days: true } });
    await this.prisma.retentionPolicy.upsert({
      where: key,
      create: { organizationId: ctx.organizationId, entityType, days },
      update: existing && existing.days === days ? { days } : { days, purgeEnabledAt: null },
    });
  }

  /** Turn purging on or off for one policy. Off is the state every policy starts in. */
  async setPurging(entityType: string, enabled: boolean, now: Date = new Date()): Promise<PublicRetentionPolicy[]> {
    const ctx = RequestContextStore.require();
    const type = this.entityType(entityType);
    const policy = await this.prisma.retentionPolicy.findUnique({
      where: { organizationId_entityType: { organizationId: ctx.organizationId, entityType: type } },
      select: { id: true },
    });
    if (!policy) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Set how many days to keep this data before turning purging on' });
    await this.prisma.retentionPolicy.update({ where: { id: policy.id }, data: { purgeEnabledAt: enabled ? now : null } });
    await this.audit.record({ action: 'UPDATE', entityType: 'RetentionPolicy', entityId: type, metadata: { entityType: type, purging: enabled } });
    return this.list();
  }

  /** What each of the organisation's policies would delete if it ran now. Deletes nothing. */
  async preview(now: Date = new Date()): Promise<RetentionPreviewRow[]> {
    const ctx = RequestContextStore.require();
    const policies = await this.prisma.retentionPolicy.findMany({
      where: { organizationId: ctx.organizationId },
      select: policySelect,
      orderBy: [{ entityType: 'asc' }],
    });
    const out: RetentionPreviewRow[] = [];
    for (const p of policies) {
      if (!isEntityType(p.entityType)) continue;
      const rows = await this.table(p.entityType).count({ where: this.olderThan(p.entityType, p.organizationId, p.days, now) });
      out.push({ entityType: p.entityType, days: p.days, purging: p.purgeEnabledAt !== null, rows });
    }
    return out;
  }

  /** Run the purge now for the caller's organisation — only the policies that are turned on. */
  async purgeOrganization(now: Date = new Date()): Promise<{ policies: number; deleted: number }> {
    const ctx = RequestContextStore.require();
    return RequestContextStore.runWithBypass('retention-purge', () => this.purge({ organizationId: ctx.organizationId }, now));
  }

  /** The daily job: every organisation's policies that are turned on. */
  async purgeAll(now: Date = new Date()): Promise<{ policies: number; deleted: number }> {
    return RequestContextStore.runWithBypass('retention-purge', () => this.purge({}, now));
  }

  /**
   * Delete, for each policy that is active AND has purging turned on, the rows
   * older than its days — in batches, inside the policy's own organisation.
   * A policy with purging off is never read here, so it can delete nothing.
   */
  private async purge(scope: { organizationId?: string }, now: Date): Promise<{ policies: number; deleted: number }> {
    const policies = await this.prisma.retentionPolicy.findMany({
      where: { ...scope, isActive: true, purgeEnabledAt: { not: null } },
      select: policySelect,
    });
    let total = 0;
    let ran = 0;
    for (const p of policies) {
      if (!isEntityType(p.entityType) || p.purgeEnabledAt === null || !p.isActive) continue;
      try {
        const deleted = await this.purgePolicy(p.entityType, p.organizationId, p.days, now);
        await this.prisma.retentionPolicy.update({ where: { id: p.id }, data: { lastRunAt: now, lastRunDeleted: deleted } });
        await this.audit.record({
          action: 'DELETE',
          entityType: 'RetentionPurge',
          entityId: p.entityType,
          organizationId: p.organizationId,
          metadata: { entityType: p.entityType, days: p.days, deleted },
        });
        total += deleted;
        ran += 1;
      } catch (err) {
        // One organisation's failure must not stop the others.
        this.logger.error(`Retention purge failed for ${p.organizationId} / ${p.entityType}: ${String(err)}`);
      }
    }
    return { policies: ran, deleted: total };
  }

  private async purgePolicy(entityType: RetentionEntityType, organizationId: string, days: number, now: Date): Promise<number> {
    const table = this.table(entityType);
    const where = this.olderThan(entityType, organizationId, days, now);
    let deleted = 0;
    for (let round = 0; round < MAX_BATCHES; round++) {
      const ids = (await table.findMany({ where, select: { id: true }, take: BATCH })).map((r) => r.id);
      if (ids.length === 0) break;
      if (entityType === 'kpi_data_point') {
        // The correction history of a value goes with the value (it is referenced by id, with no foreign key).
        await this.prisma.kPIDataPointHistory.deleteMany({ where: { organizationId, dataPointId: { in: ids } } });
      }
      const result = await table.deleteMany({ where: { organizationId, id: { in: ids } } });
      deleted += result.count;
      if (ids.length < BATCH) break;
    }
    return deleted;
  }

  /** Rows of one organisation older than `days`, by the date that says how old the row is. */
  private olderThan(entityType: RetentionEntityType, organizationId: string, days: number, now: Date): Record<string, unknown> {
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const dateField: Record<RetentionEntityType, string> = {
      audit_log: 'createdAt',
      // A recorded value is as old as the period it is for, not the day it was typed in.
      kpi_data_point: 'periodEnd',
      notification_delivery: 'createdAt',
      report_run: 'ranAt',
      ingestion_job: 'createdAt',
    };
    return { organizationId, [dateField[entityType]]: { lt: cutoff } };
  }

  private table(entityType: RetentionEntityType): PurgeTable {
    const tables: Record<RetentionEntityType, unknown> = {
      audit_log: this.prisma.auditLog,
      kpi_data_point: this.prisma.kPIDataPoint,
      notification_delivery: this.prisma.notificationDelivery,
      report_run: this.prisma.reportRun,
      ingestion_job: this.prisma.ingestionJob,
    };
    return tables[entityType] as PurgeTable;
  }

  private entityType(value: string): RetentionEntityType {
    if (!isEntityType(value)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `entityType must be one of ${RETENTION_ENTITY_TYPES.join(', ')}` });
    }
    return value;
  }
}
