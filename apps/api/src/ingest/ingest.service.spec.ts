/**
 * IngestService unit tests. Bulk webhook ingest authenticated by API key (scope
 * enforcement is at the guard layer). Covers: rows forwarded to bulkRecordOrgWide,
 * IngestionJob logged with apiKeyId + status (SUCCEEDED/PARTIAL/FAILED).
 */
import { describe, expect, test, vi } from 'vitest';

import type { KpiDataService } from '../kpis/kpi-data.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { IngestService } from './ingest.service.js';

const ORG = 'org_alpha';
function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: 'system', organizationId: ORG, roleId: null, principalType: 'api_key', apiKeyId: ctx.apiKeyId ?? 'key_1', ...ctx },
    fn,
  );
}

function makeService(bulkResult: { succeeded: number; failed: number; errors: string[] }) {
  const jobs: Array<Record<string, unknown>> = [];
  const prisma = {
    ingestionJob: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const j = { id: `job_${jobs.length + 1}`, ...data };
        jobs.push(j);
        return j;
      }),
    },
  };
  const bulk = vi.fn(async (_rows: Array<{ recordedAt?: Date }>) => bulkResult);
  const data = { bulkRecordOrgWide: bulk } as unknown as KpiDataService;
  const service = new IngestService(prisma as unknown as PrismaService, data);
  return { service, jobs, bulk };
}

describe('IngestService.ingest', () => {
  test('forwards rows and logs a SUCCEEDED job carrying the apiKeyId', async () => {
    const { service, jobs, bulk } = makeService({ succeeded: 3, failed: 0, errors: [] });
    const res = await withCtx({ apiKeyId: 'key_xyz' }, () =>
      service.ingest({ source: 'github', rows: [
        { kpiId: 'k', value: 1 },
        { kpiId: 'k', value: 2 },
        { kpiId: 'k', value: 3 },
      ] }),
    );
    expect(bulk).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('SUCCEEDED');
    expect(res.succeeded).toBe(3);
    expect(jobs[0]!.status).toBe('SUCCEEDED');
    expect((jobs[0]!.source as { apiKeyId?: string }).apiKeyId).toBe('key_xyz');
    expect((jobs[0]!.source as { rowCount?: number }).rowCount).toBe(3);
  });

  test('partial failures → PARTIAL', async () => {
    const { service } = makeService({ succeeded: 2, failed: 1, errors: ['k: bad'] });
    const res = await withCtx({}, () => service.ingest({ rows: [{ kpiId: 'k', value: 1 }] }));
    expect(res.status).toBe('PARTIAL');
  });

  test('all rows failing → FAILED', async () => {
    const { service, jobs } = makeService({ succeeded: 0, failed: 2, errors: ['k: bad'] });
    const res = await withCtx({}, () => service.ingest({ rows: [{ kpiId: 'k', value: 1 }, { kpiId: 'k', value: 2 }] }));
    expect(res.status).toBe('FAILED');
    expect(jobs[0]!.status).toBe('FAILED');
  });

  test('recordedAt strings are coerced to Date for bulk recording', async () => {
    const { service, bulk } = makeService({ succeeded: 1, failed: 0, errors: [] });
    // Pass a raw string (as the wire would) to prove the service coerces it.
    await withCtx({}, () => service.ingest({ rows: [{ kpiId: 'k', value: 1, recordedAt: '2026-05-01T00:00:00Z' as unknown as Date }] }));
    const passed = bulk.mock.calls[0]![0];
    expect(passed[0]!.recordedAt).toBeInstanceOf(Date);
  });
});
