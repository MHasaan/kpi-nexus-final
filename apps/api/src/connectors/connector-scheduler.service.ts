import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export const CONNECTOR_RUN_QUEUE = 'connector-run';
export const CONNECTOR_RUN_JOB = 'connector-run';

export interface ConnectorJobData {
  connectorId: string;
  organizationId: string;
}

interface SchedulableConnector {
  id: string;
  organizationId: string;
  schedule: string | null;
  isActive: boolean;
}

const SCHEDULER_PREFIX = 'connector:';

/**
 * Keeps one BullMQ job scheduler per connector in step with its row: an active
 * connector with a schedule has one, keyed `connector:<id>`; any other has
 * none. upsertJobScheduler is idempotent per key, so re-syncing only replaces
 * the pattern. Boot reconciles every connector, so schedules survive a Redis
 * flush and schedulers left by deleted connectors are dropped.
 */
@Injectable()
export class ConnectorSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConnectorSchedulerService.name);

  constructor(
    @InjectQueue(CONNECTOR_RUN_QUEUE) private readonly queue: Queue<ConnectorJobData>,
    private readonly prisma: PrismaService,
  ) {}

  private schedulerId(connectorId: string): string {
    return `${SCHEDULER_PREFIX}${connectorId}`;
  }

  async sync(connector: SchedulableConnector): Promise<void> {
    if (!connector.isActive || !connector.schedule) {
      await this.remove(connector.id);
      return;
    }
    await this.queue.upsertJobScheduler(
      this.schedulerId(connector.id),
      { pattern: connector.schedule },
      {
        name: CONNECTOR_RUN_JOB,
        data: { connectorId: connector.id, organizationId: connector.organizationId },
        opts: { removeOnComplete: 50, removeOnFail: 50 },
      },
    );
  }

  async remove(connectorId: string): Promise<void> {
    await this.queue.removeJobScheduler(this.schedulerId(connectorId));
  }

  /** Cross-org on purpose: the boot-time view of every scheduled connector. */
  async reconcileAll(): Promise<void> {
    const wanted = await RequestContextStore.runWithBypass('connector-schedule-reconcile', () =>
      this.prisma.connector.findMany({
        where: { isActive: true, schedule: { not: null } },
        select: { id: true, organizationId: true, schedule: true, isActive: true },
      }),
    );
    const wantedIds = new Set(wanted.map((c) => this.schedulerId(c.id)));
    for (const s of await this.queue.getJobSchedulers()) {
      if (s.key.startsWith(SCHEDULER_PREFIX) && !wantedIds.has(s.key)) await this.queue.removeJobScheduler(s.key);
    }
    // One at a time: a schedule saved before the DTO validated it must not
    // stop every other connector being scheduled.
    let skipped = 0;
    for (const c of wanted) {
      try {
        await this.sync(c);
      } catch (err) {
        skipped++;
        this.logger.warn(`Connector ${c.id} not scheduled (schedule "${c.schedule ?? ''}"): ${String(err)}`);
      }
    }
    this.logger.log(`Connector schedules reconciled: ${wanted.length - skipped} active, ${skipped} skipped`);
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcileAll();
    } catch (err) {
      // Non-fatal: the API still starts; the next boot (or any connector save) re-syncs.
      this.logger.warn(`Failed to reconcile connector schedules: ${String(err)}`);
    }
  }
}
