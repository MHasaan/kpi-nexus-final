import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ConnectorType, Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { KpiDataService } from '../kpis/kpi-data.service.js';
import { assertOutboundUrl } from '../outbound/assert-outbound-url.js';
import { outboundFetch } from '../outbound/outbound-fetch.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ConnectorSchedulerService } from './connector-scheduler.service.js';
import {
  type ExtractedRow,
  type GraphqlConfig,
  type RestConfig,
  extractGraphqlRows,
  extractRestRows,
  parseConnectorConfig,
} from './connector-extract.js';
import type { CreateConnectorDto, UpdateConnectorDto } from './dto/connector.dto.js';

const connectorSelect = {
  id: true,
  organizationId: true,
  name: true,
  type: true,
  config: true,
  schedule: true,
  isActive: true,
  lastRunAt: true,
  lastRunStatus: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ConnectorSelect;

export type PublicConnector = Prisma.ConnectorGetPayload<{ select: typeof connectorSelect }>;

export interface ConnectorRunResult {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  rowCount: number;
  error?: string;
}

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly data: KpiDataService,
    private readonly scheduler: ConnectorSchedulerService,
  ) {}

  async list(): Promise<PublicConnector[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.connector.findMany({ where: { organizationId: ctx.organizationId }, select: connectorSelect, orderBy: [{ createdAt: 'desc' }] });
  }

  async getById(id: string): Promise<PublicConnector> {
    const ctx = RequestContextStore.require();
    const conn = await this.prisma.connector.findFirst({ where: { id, organizationId: ctx.organizationId }, select: connectorSelect });
    if (!conn) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Connector not found' });
    return conn;
  }

  async create(dto: CreateConnectorDto): Promise<PublicConnector> {
    await assertOutboundUrl(dto.config.url, 'config.url');
    const ctx = RequestContextStore.require();
    const created = await this.prisma.connector.create({
      data: {
        organizationId: ctx.organizationId,
        name: dto.name,
        type: dto.type as ConnectorType,
        config: dto.config as Prisma.InputJsonValue,
        schedule: dto.schedule || null,
        isActive: dto.isActive,
        createdById: ctx.userId,
      },
      select: connectorSelect,
    });
    await this.scheduler.sync(created);
    await this.audit.record({ action: 'CREATE', entityType: 'Connector', entityId: created.id, metadata: { name: created.name, type: created.type } });
    return created;
  }

  async update(id: string, dto: UpdateConnectorDto): Promise<PublicConnector> {
    await this.getById(id);
    await assertOutboundUrl(dto.config?.url, 'config.url');
    const updated = await this.prisma.connector.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type as ConnectorType | undefined,
        config: dto.config as Prisma.InputJsonValue | undefined,
        schedule: dto.schedule === undefined ? undefined : dto.schedule || null,
        isActive: dto.isActive,
      },
      select: connectorSelect,
    });
    await this.scheduler.sync(updated);
    await this.audit.record({ action: 'UPDATE', entityType: 'Connector', entityId: id });
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.connector.delete({ where: { id } });
    await this.scheduler.remove(id);
    await this.audit.record({ action: 'DELETE', entityType: 'Connector', entityId: id });
  }

  async listRuns(id: string): Promise<unknown[]> {
    const ctx = RequestContextStore.require();
    await this.getById(id);
    return this.prisma.ingestionJob.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
  }

  /** Manually run a connector now; logs an IngestionJob and returns its status. */
  async runNow(id: string): Promise<ConnectorRunResult & { jobId: string }> {
    const ctx = RequestContextStore.require();
    const connector = await this.getById(id);
    const startedAt = new Date();
    let result: ConnectorRunResult;
    try {
      result = await this.runConnector(connector);
    } catch (err) {
      result = { status: 'FAILED', rowCount: 0, error: err instanceof Error ? err.message : String(err) };
    }

    const job = await this.prisma.ingestionJob.create({
      data: {
        organizationId: ctx.organizationId,
        kind: `${connector.type.toLowerCase()}_connector`,
        source: { label: connector.name, connectorId: connector.id, rowCount: result.rowCount } as Prisma.InputJsonValue,
        status: result.status,
        startedAt,
        finishedAt: new Date(),
        errorLog: result.error,
      },
      select: { id: true },
    });

    await this.prisma.connector.update({ where: { id }, data: { lastRunAt: new Date(), lastRunStatus: result.status } });
    return { ...result, jobId: job.id };
  }

  /** Fetch + extract + bulk-record. Throws on fetch/extract failure (caught by runNow). */
  private async runConnector(connector: PublicConnector): Promise<ConnectorRunResult> {
    let rows: ExtractedRow[];
    if (connector.type === 'REST') {
      rows = await this.runRest(parseConnectorConfig('REST', connector.config));
    } else if (connector.type === 'GRAPHQL') {
      rows = await this.runGraphql(parseConnectorConfig('GRAPHQL', connector.config));
    } else {
      throw new Error(`Connector type ${connector.type} is not supported yet (REST/GraphQL only in P8)`);
    }

    if (rows.length === 0) return { status: 'SUCCEEDED', rowCount: 0 };
    const out = await this.data.bulkRecordOrgWide(rows.map((r) => ({ ...r, sourceType: 'INTEGRATION', sourceRef: `connector:${connector.id}` })));
    const status = out.failed === 0 ? 'SUCCEEDED' : out.succeeded === 0 ? 'FAILED' : 'PARTIAL';
    return { status, rowCount: out.succeeded, error: out.errors[0] };
  }

  private async runRest(config: RestConfig): Promise<ExtractedRow[]> {
    const url = new URL(config.url);
    for (const [k, v] of Object.entries(config.queryParams ?? {})) url.searchParams.set(k, v);
    const res = await outboundFetch(url.toString(), { method: config.method ?? 'GET', headers: config.headers });
    if (!res.ok) throw new Error(`REST connector got HTTP ${res.status}`);
    return extractRestRows(await res.json(), config);
  }

  private async runGraphql(config: GraphqlConfig): Promise<ExtractedRow[]> {
    const res = await outboundFetch(config.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(config.headers ?? {}) },
      body: JSON.stringify({ query: config.query, variables: config.variables ?? {} }),
    });
    if (!res.ok) throw new Error(`GraphQL connector got HTTP ${res.status}`);
    return extractGraphqlRows(await res.json(), config);
  }
}
