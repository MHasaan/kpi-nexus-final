/**
 * Scheduled connector runs. Connector.schedule used to be stored but never run;
 * connectors only ran on POST /connectors/:id/run. ConnectorSchedulerService
 * keeps one BullMQ job scheduler per connector (deterministic id
 * `connector:<id>`) in step with the row: create/update upsert or remove it,
 * delete removes it, and boot reconciles every connector so a flushed Redis
 * can't silently drop schedules.
 */
import { describe, expect, test, vi } from 'vitest';
import type { Queue } from 'bullmq';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { CONNECTOR_RUN_JOB, ConnectorSchedulerService } from './connector-scheduler.service.js';
import { CreateConnectorDtoSchema, UpdateConnectorDtoSchema } from './dto/connector.dto.js';

function fakeQueue(existing: string[] = []) {
  const schedulers = new Map<string, string>(existing.map((id) => [id, '0 * * * *']));
  const queue = {
    upsertJobScheduler: vi.fn(async (id: string, repeat: { pattern: string }) => {
      schedulers.set(id, repeat.pattern);
      return {};
    }),
    removeJobScheduler: vi.fn(async (id: string) => schedulers.delete(id)),
    getJobSchedulers: vi.fn(async () => [...schedulers.keys()].map((key) => ({ key, pattern: schedulers.get(key) }))),
  };
  return { queue, schedulers };
}

function makeScheduler(opts: { existing?: string[]; connectors?: Array<Record<string, unknown>> } = {}) {
  const { queue, schedulers } = fakeQueue(opts.existing);
  const findMany = vi.fn(async (_args?: unknown) => opts.connectors ?? []);
  const prisma = { connector: { findMany } } as unknown as PrismaService;
  const service = new ConnectorSchedulerService(queue as unknown as Queue, prisma);
  return { service, queue, schedulers, findMany };
}

const C = { id: 'conn_1', organizationId: 'org_a', schedule: '0 8 * * *', isActive: true };

describe('ConnectorSchedulerService.sync', () => {
  test('an active connector with a schedule gets a job scheduler with a deterministic id', async () => {
    const { service, queue, schedulers } = makeScheduler();
    await service.sync(C);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'connector:conn_1',
      { pattern: '0 8 * * *' },
      expect.objectContaining({ name: CONNECTOR_RUN_JOB, data: { connectorId: 'conn_1', organizationId: 'org_a' } }),
    );
    expect(schedulers.get('connector:conn_1')).toBe('0 8 * * *');
  });

  test('syncing twice keeps ONE scheduler and takes the new pattern', async () => {
    const { service, schedulers } = makeScheduler();
    await service.sync(C);
    await service.sync({ ...C, schedule: '*/15 * * * *' });
    expect([...schedulers.keys()]).toEqual(['connector:conn_1']);
    expect(schedulers.get('connector:conn_1')).toBe('*/15 * * * *');
  });

  test('an inactive connector, or one without a schedule, has no scheduler', async () => {
    const { service, queue, schedulers } = makeScheduler({ existing: ['connector:conn_1'] });
    await service.sync({ ...C, isActive: false });
    expect(schedulers.has('connector:conn_1')).toBe(false);
    await service.sync({ ...C, schedule: null });
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('connector:conn_1');
  });

  test('remove() deletes the scheduler', async () => {
    const { service, schedulers } = makeScheduler({ existing: ['connector:conn_1'] });
    await service.remove('conn_1');
    expect(schedulers.size).toBe(0);
  });
});

describe('ConnectorSchedulerService.reconcileAll (boot)', () => {
  test('upserts every active scheduled connector across orgs and drops stale connector schedulers only', async () => {
    const { service, schedulers, findMany } = makeScheduler({
      existing: ['connector:gone', 'connector:conn_2', 'onboarding-stale-draft-cleanup'],
    });
    let bypass: boolean | undefined;
    findMany.mockImplementation(async () => {
      bypass = RequestContextStore.get()?.bypassRls;
      return [
        { id: 'conn_1', organizationId: 'org_a', schedule: '0 8 * * *', isActive: true },
        { id: 'conn_2', organizationId: 'org_b', schedule: '*/5 * * * *', isActive: true },
      ];
    });
    await service.reconcileAll();
    expect(bypass).toBe(true);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { isActive: true, schedule: { not: null } } });
    expect([...schedulers.keys()].sort()).toEqual(['connector:conn_1', 'connector:conn_2', 'onboarding-stale-draft-cleanup']);
    expect(schedulers.get('connector:conn_2')).toBe('*/5 * * * *');
  });

  test('a schedule saved before validation existed is skipped; the other connectors are still scheduled', async () => {
    const { service, queue, schedulers } = makeScheduler({
      connectors: [
        { id: 'conn_bad', organizationId: 'org_a', schedule: 'every morning', isActive: true },
        { id: 'conn_ok', organizationId: 'org_a', schedule: '0 8 * * *', isActive: true },
      ],
    });
    queue.upsertJobScheduler.mockImplementation(async (id: string, repeat: { pattern: string }) => {
      if (repeat.pattern === 'every morning') throw new Error('Validation error, cannot resolve alias "eve"');
      schedulers.set(id, repeat.pattern);
      return {};
    });
    await service.reconcileAll();
    expect([...schedulers.keys()]).toEqual(['connector:conn_ok']);
  });

  test('a Redis failure at boot is logged, not thrown (the API still starts)', async () => {
    const { service, queue } = makeScheduler({ connectors: [C] });
    queue.getJobSchedulers.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});

describe('connector schedule validation', () => {
  const base = { name: 'GH', type: 'REST' as const, config: { url: 'https://x.test' } };

  test('accepts a 5-field cron', () => {
    expect(CreateConnectorDtoSchema.safeParse({ ...base, schedule: '0 8 * * *' }).success).toBe(true);
    expect(CreateConnectorDtoSchema.safeParse({ ...base, schedule: '*/15 * * * 1-5' }).success).toBe(true);
  });

  test('rejects text the scheduler cannot parse', () => {
    expect(CreateConnectorDtoSchema.safeParse({ ...base, schedule: 'every morning' }).success).toBe(false);
    expect(CreateConnectorDtoSchema.safeParse({ ...base, schedule: '61 * * * *' }).success).toBe(false);
  });

  test('rejects a 6-field (seconds) cron: a connector calls an outside URL, at most once a minute', () => {
    expect(CreateConnectorDtoSchema.safeParse({ ...base, schedule: '* * * * * *' }).success).toBe(false);
  });

  test('an update can clear the schedule with null or an empty string', () => {
    expect(UpdateConnectorDtoSchema.safeParse({ schedule: null }).success).toBe(true);
    expect(UpdateConnectorDtoSchema.safeParse({ schedule: '' }).success).toBe(true);
  });
});
