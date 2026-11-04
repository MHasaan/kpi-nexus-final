/**
 * ConnectorsService unit tests. CRUD is org-scoped; runNow fetches (stubbed),
 * extracts rows, bulk-records them, and logs an IngestionJob with the right
 * status. Covers REST happy path, GraphQL errors → FAILED job, unsupported type.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { KpiDataService } from '../kpis/kpi-data.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ConnectorsService } from './connectors.service.js';

// The SSRF guard has its own spec (src/outbound/outbound-fetch.spec.ts). Here
// the fake hostnames shouldn't hit DNS, and requests go to the stubbed fetch.
vi.mock('../outbound/outbound-fetch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../outbound/outbound-fetch.js')>()),
  validateOutboundUrl: vi.fn(async () => undefined),
  outboundFetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
}));

interface FakeConnector {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  config: unknown;
  schedule: string | null;
  isActive: boolean;
  lastRunStatus: string | null;
  createdById: string;
}

class FakePrisma {
  private cn = 1;
  private jn = 1;
  connectors: FakeConnector[] = [];
  jobs: Array<Record<string, unknown>> = [];

  connector = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => this.connectors.filter((c) => c.organizationId === where.organizationId)),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => this.connectors.find((c) => c.id === where.id && c.organizationId === where.organizationId) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const c: FakeConnector = {
        id: `conn_${this.cn++}`,
        organizationId: data.organizationId as string,
        name: data.name as string,
        type: data.type as string,
        config: data.config,
        schedule: (data.schedule as string) ?? null,
        isActive: (data.isActive as boolean) ?? true,
        lastRunStatus: null,
        createdById: data.createdById as string,
      };
      this.connectors.push(c);
      return c;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const c = this.connectors.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) if (data[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = data[k];
      return c;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.connectors = this.connectors.filter((c) => c.id !== where.id);
      return {};
    }),
  };

  ingestionJob = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const j = { id: `job_${this.jn++}`, ...data };
      this.jobs.push(j);
      return j;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => this.jobs.filter((j) => j.organizationId === where.organizationId)),
  };
}

const ORG = 'org_alpha';
function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'admin', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const bulk = vi.fn(async (rows: unknown[]) => ({ succeeded: (rows as unknown[]).length, failed: 0, errors: [] as string[] }));
  const data = { bulkRecordOrgWide: bulk } as unknown as KpiDataService;
  const audit = { record: vi.fn(async () => {}) };
  const service = new ConnectorsService(prisma as unknown as PrismaService, audit as unknown as AuditService, data);
  return { service, prisma, bulk };
}

function stubFetch(body: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConnectorsService CRUD', () => {
  test('create + list org-scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ name: 'GH stars', type: 'REST', config: { url: 'http://x', valuePath: 'n', kpiId: 'k' } }));
    await withCtx({ organizationId: 'other' }, () => service.create({ name: 'X', type: 'REST', config: { url: 'http://y', valuePath: 'n', kpiId: 'k' } }));
    const rows = await withCtx({}, () => service.list());
    expect(rows.map((r) => r.name)).toEqual(['GH stars']);
  });

  test('getById cross-tenant → 404', async () => {
    const { service } = makeService();
    const c = await withCtx({ organizationId: 'a' }, () => service.create({ name: 'X', type: 'REST', config: { url: 'http://x', valuePath: 'n', kpiId: 'k' } }));
    await expect(withCtx({ organizationId: 'b' }, () => service.getById(c.id))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ConnectorsService.runNow', () => {
  test('REST: fetches, extracts a value, bulk-records, logs SUCCEEDED', async () => {
    const { service, prisma, bulk } = makeService();
    stubFetch({ stargazers_count: 256 });
    const c = await withCtx({}, () => service.create({ name: 'GH', type: 'REST', config: { url: 'https://api.github.test/repo', valuePath: 'stargazers_count', kpiId: 'kpi_1' } }));
    const job = await withCtx({}, () => service.runNow(c.id));
    expect(bulk).toHaveBeenCalledTimes(1);
    expect((bulk.mock.calls[0]![0] as unknown[])).toHaveLength(1);
    expect(job.status).toBe('SUCCEEDED');
    expect(prisma.connectors[0]!.lastRunStatus).toBe('SUCCEEDED');
  });

  test('GraphQL errors[] → FAILED job, no bulk record', async () => {
    const { service, bulk } = makeService();
    stubFetch({ errors: [{ message: 'rate limited' }], data: null });
    const c = await withCtx({}, () => service.create({ name: 'GQL', type: 'GRAPHQL', config: { url: 'https://api.test/graphql', query: '{ x }', valuePath: 'x', kpiId: 'kpi_1' } }));
    const job = await withCtx({}, () => service.runNow(c.id));
    expect(job.status).toBe('FAILED');
    expect(bulk).not.toHaveBeenCalled();
  });

  test('unsupported connector type → FAILED job', async () => {
    const { service } = makeService();
    const c = await withCtx({}, () => service.create({ name: 'S3', type: 'S3', config: {} }));
    const job = await withCtx({}, () => service.runNow(c.id));
    expect(job.status).toBe('FAILED');
  });
});
