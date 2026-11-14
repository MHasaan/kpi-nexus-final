/**
 * ConnectorRunProcessor runs a due connector. There is no HTTP request, so it
 * loads the connector under a system context, then runs it AS THE CONNECTOR'S
 * CREATOR (like a manual run by them), with the org's id on the context so
 * every query stays org-scoped. Stale jobs (connector deleted, deactivated or
 * unscheduled) do nothing; a deleted connector's scheduler is removed.
 */
import { describe, expect, test, vi } from 'vitest';
import type { Job } from 'bullmq';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ConnectorRunProcessor } from './connector-run.processor.js';
import type { ConnectorJobData, ConnectorSchedulerService } from './connector-scheduler.service.js';
import type { ConnectorsService } from './connectors.service.js';

const ORG = 'org_a';

function makeProcessor(connector: Record<string, unknown> | null, creatorRoleId: string | null = 'role_mgr') {
  const seen: { runCtx?: RequestContext; loadCtx?: RequestContext } = {};
  const prisma = {
    connector: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
        seen.loadCtx = RequestContextStore.get();
        return connector && connector.id === where.id && connector.organizationId === where.organizationId ? connector : null;
      }),
    },
    user: { findFirst: vi.fn(async () => (creatorRoleId === undefined ? null : { roleId: creatorRoleId })) },
  };
  const runNow = vi.fn(async () => {
    seen.runCtx = RequestContextStore.get();
    return { status: 'SUCCEEDED' as const, rowCount: 1, jobId: 'job_1' };
  });
  const remove = vi.fn(async () => {});
  const processor = new ConnectorRunProcessor(
    prisma as unknown as PrismaService,
    { runNow } as unknown as ConnectorsService,
    { remove } as unknown as ConnectorSchedulerService,
  );
  return { processor, runNow, remove, seen, prisma };
}

const job = (data: ConnectorJobData) => ({ id: 'repeat:1', data }) as Job<ConnectorJobData>;
const CONN = { id: 'conn_1', organizationId: ORG, schedule: '0 8 * * *', isActive: true, createdById: 'user_creator' };

describe('ConnectorRunProcessor', () => {
  test('runs the connector as its creator, in the connector’s org', async () => {
    const { processor, runNow, seen } = makeProcessor(CONN);
    await processor.process(job({ connectorId: 'conn_1', organizationId: ORG }));
    expect(runNow).toHaveBeenCalledWith('conn_1');
    expect(seen.runCtx).toMatchObject({ userId: 'user_creator', organizationId: ORG, roleId: 'role_mgr', principalType: 'user' });
    expect(seen.loadCtx).toMatchObject({ organizationId: ORG, bypassRls: true });
  });

  test('the lookup is org-scoped: a job naming another org finds nothing and runs nothing', async () => {
    const { processor, runNow } = makeProcessor(CONN);
    await processor.process(job({ connectorId: 'conn_1', organizationId: 'org_other' }));
    expect(runNow).not.toHaveBeenCalled();
  });

  test('a deleted connector: no run, and its scheduler is removed', async () => {
    const { processor, runNow, remove } = makeProcessor(null);
    await processor.process(job({ connectorId: 'conn_1', organizationId: ORG }));
    expect(runNow).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('conn_1');
  });

  test('a deactivated or unscheduled connector does not run', async () => {
    for (const c of [{ ...CONN, isActive: false }, { ...CONN, schedule: null }]) {
      const { processor, runNow } = makeProcessor(c);
      await processor.process(job({ connectorId: 'conn_1', organizationId: ORG }));
      expect(runNow).not.toHaveBeenCalled();
    }
  });
});
