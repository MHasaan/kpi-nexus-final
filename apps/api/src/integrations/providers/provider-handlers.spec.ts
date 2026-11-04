/**
 * Provider webhook handlers. SlackService.handleInteractive resolves the org
 * from the Slack team_id and acknowledges the alert; JiraService.handleWebhook
 * authenticates one Jira connection by its webhookSecret and updates the linked
 * Task in that connection's org only (exact issue-key match).
 */
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';

import type { AlertsService } from '../../alerts/alerts.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { IntegrationCryptoService } from '../integration-crypto.service.js';
import { JiraService } from './jira.service.js';
import { SlackService } from './slack.service.js';

describe('SlackService.handleInteractive', () => {
  function make() {
    const prisma = {
      integrationConnection: {
        findFirst: vi.fn(async ({ where }: { where: { metadata: { path: string[]; equals: string } } }) =>
          where.metadata.equals === 'T123' ? { organizationId: 'org_a' } : null,
        ),
      },
    };
    const alerts = { acknowledge: vi.fn(async () => ({ id: 'al_1', status: 'ACKNOWLEDGED' })) };
    return { service: new SlackService(prisma as unknown as PrismaService, alerts as unknown as AlertsService), alerts };
  }

  test('acknowledge_alert action acks the alert in the resolved org', async () => {
    const { service, alerts } = make();
    const res = await service.handleInteractive({ team_id: 'T123', actions: [{ action_id: 'acknowledge_alert', value: 'al_1' }] });
    expect(res.handled).toBe(true);
    expect(alerts.acknowledge).toHaveBeenCalledWith('al_1');
  });

  test("real Slack block_actions shape (team: { id }) resolves the org and acks (BE-029)", async () => {
    const { service, alerts } = make();
    const res = await service.handleInteractive({
      type: 'block_actions',
      team: { id: 'T123', domain: 'helios' },
      actions: [{ action_id: 'acknowledge_alert', value: 'al_1' }],
    });
    expect(res.handled).toBe(true);
    expect(alerts.acknowledge).toHaveBeenCalledWith('al_1');
  });

  test('unknown team → not handled, no ack', async () => {
    const { service, alerts } = make();
    const res = await service.handleInteractive({ team_id: 'T_UNKNOWN', actions: [{ action_id: 'acknowledge_alert', value: 'al_1' }] });
    expect(res.handled).toBe(false);
    expect(alerts.acknowledge).not.toHaveBeenCalled();
  });

  test('non-ack action → not handled', async () => {
    const { service, alerts } = make();
    const res = await service.handleInteractive({ team_id: 'T123', actions: [{ action_id: 'snooze_alert', value: 'al_1' }] });
    expect(res.handled).toBe(false);
    expect(alerts.acknowledge).not.toHaveBeenCalled();
  });
});

describe('JiraService.handleWebhook', () => {
  const crypto = new IntegrationCryptoService({ INTEGRATION_CRYPTO_KEY: 'unit-test-key' });
  const SECRET = 'whsec-unit-test';

  type Task = { id: string; organizationId: string; externalRef: string; status: string };
  type Where = { organizationId: string; OR: Array<{ externalRef: string | { endsWith: string } }> };

  function make() {
    const tasks: Task[] = [
      { id: 't_a', organizationId: 'org_a', externalRef: 'https://jira/browse/KP-9', status: 'TODO' },
      { id: 't_b', organizationId: 'org_b', externalRef: 'https://jira/browse/KP-9', status: 'TODO' },
      { id: 't_a2', organizationId: 'org_a', externalRef: 'https://jira/browse/KP-90', status: 'TODO' },
    ];
    const connections = [
      { id: 'conn_a', provider: 'jira', organizationId: 'org_a', encryptedTokens: crypto.encrypt({ webhookSecret: SECRET }) },
      { id: 'conn_nosecret', provider: 'jira', organizationId: 'org_a', encryptedTokens: crypto.encrypt({ access_token: 'x' }) },
    ];
    const matches = (t: Task, where: Where) =>
      t.organizationId === where.organizationId &&
      where.OR.some((c) => (typeof c.externalRef === 'string' ? t.externalRef === c.externalRef : t.externalRef.endsWith(c.externalRef.endsWith)));
    const prisma = {
      integrationConnection: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; provider: string } }) =>
          connections.find((c) => c.id === where.id && c.provider === where.provider) ?? null,
        ),
      },
      task: {
        findFirst: vi.fn(async ({ where }: { where: Where }) => tasks.find((t) => matches(t, where)) ?? null),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
          const t = tasks.find((x) => x.id === where.id)!;
          t.status = data.status;
          return t;
        }),
      },
    };
    return { service: new JiraService(prisma as unknown as PrismaService, crypto), tasks };
  }

  const done = (key: string) => ({ issue: { key, fields: { status: { name: 'Done' } } } });

  test("maps Jira \"Done\" → Task DONE for the linked task in the connection's org only", async () => {
    const { service, tasks } = make();
    const res = await service.handleWebhook('conn_a', SECRET, done('KP-9'));
    expect(res.updated).toBe(true);
    expect(tasks.find((t) => t.id === 't_a')!.status).toBe('DONE');
    expect(tasks.find((t) => t.id === 't_b')!.status).toBe('TODO');
  });

  test('issue key must match exactly — KP-9 does not touch KP-90', async () => {
    const { service, tasks } = make();
    await service.handleWebhook('conn_a', SECRET, done('KP-9'));
    expect(tasks.find((t) => t.id === 't_a2')!.status).toBe('TODO');
  });

  test('unknown Jira status → no update', async () => {
    const { service, tasks } = make();
    const res = await service.handleWebhook('conn_a', SECRET, { issue: { key: 'KP-9', fields: { status: { name: 'Backlog' } } } });
    expect(res.updated).toBe(false);
    expect(tasks[0]!.status).toBe('TODO');
  });

  test('no linked task → no update', async () => {
    const { service } = make();
    expect((await service.handleWebhook('conn_a', SECRET, done('KP-404'))).updated).toBe(false);
  });

  test.each([
    ['wrong secret', 'conn_a', 'nope'],
    ['missing secret', 'conn_a', undefined],
    ['unknown connection', 'conn_x', SECRET],
    ['connection without a webhookSecret', 'conn_nosecret', SECRET],
  ])('%s → UnauthorizedException, nothing updated', async (_label, conn, secret) => {
    const { service, tasks } = make();
    await expect(service.handleWebhook(conn, secret, done('KP-9'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tasks.every((t) => t.status === 'TODO')).toBe(true);
  });
});
