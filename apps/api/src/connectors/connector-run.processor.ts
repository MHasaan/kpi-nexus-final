import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { CONNECTOR_RUN_QUEUE, type ConnectorJobData, ConnectorSchedulerService } from './connector-scheduler.service.js';
import { ConnectorsService } from './connectors.service.js';

/**
 * Runs a connector when its schedule fires. Same two-phase context as
 * ScheduledReportProcessor: load the connector under a system context, then
 * run it AS ITS CREATOR (what a manual run by them would do), with the org id
 * on the context so every query stays org-scoped. bypassRls only lets the
 * Prisma RLS middleware pass; the organizationId filters still apply.
 */
@Processor(CONNECTOR_RUN_QUEUE)
export class ConnectorRunProcessor extends WorkerHost {
  private readonly logger = new Logger(ConnectorRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorsService,
    private readonly scheduler: ConnectorSchedulerService,
  ) {
    super();
  }

  async process(job: Job<ConnectorJobData>): Promise<void> {
    const { connectorId, organizationId } = job.data;

    const loaded = await RequestContextStore.run(
      { userId: 'scheduler-system', organizationId, roleId: null, principalType: 'user', bypassRls: true },
      async () => {
        const connector = await this.prisma.connector.findFirst({
          where: { id: connectorId, organizationId },
          select: { id: true, schedule: true, isActive: true, createdById: true },
        });
        if (!connector) return null;
        const creator = await this.prisma.user.findFirst({
          where: { id: connector.createdById, organizationId },
          select: { roleId: true },
        });
        return { connector, creatorRoleId: creator?.roleId ?? null };
      },
    );

    if (!loaded) {
      this.logger.warn(`Connector ${connectorId} not found; removing its schedule`);
      await this.scheduler.remove(connectorId);
      return;
    }
    if (!loaded.connector.isActive || !loaded.connector.schedule) return;

    const result = await RequestContextStore.run(
      { userId: loaded.connector.createdById, organizationId, roleId: loaded.creatorRoleId, principalType: 'user', bypassRls: true },
      () => this.connectors.runNow(connectorId),
    );
    this.logger.log(`Scheduled run of connector ${connectorId}: ${result.status} (${result.rowCount} rows)`);
  }
}
