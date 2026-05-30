/**
 * Provider webhook handlers. SlackService.handleInteractive resolves the org
 * from the Slack team_id and acknowledges the alert; JiraService.handleWebhook
 * maps the Jira status and updates the linked Task. External identity is
 * resolved via IntegrationConnection / Task.externalRef.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AlertsService } from '../../alerts/alerts.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
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
  function make() {
    const tasks = [{ id: 't_1', organizationId: 'org_a', externalRef: 'https://jira/browse/KP-9', status: 'TODO' }];
    const prisma = {
      task: {
        findFirst: vi.fn(async ({ where }: { where: { externalRef: { contains: string } } }) =>
          tasks.find((t) => t.externalRef.includes(where.externalRef.contains)) ?? null,
        ),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
          const t = tasks.find((x) => x.id === where.id)!;
          t.status = data.status;
          return t;
        }),
      },
    };
    return { service: new JiraService(prisma as unknown as PrismaService), tasks, prisma };
  }

  test('maps Jira "Done" → Task DONE for the linked task', async () => {
    const { service, tasks } = make();
    const res = await service.handleWebhook({ issue: { key: 'KP-9', fields: { status: { name: 'Done' } } } });
    expect(res.updated).toBe(true);
    expect(tasks[0]!.status).toBe('DONE');
  });

  test('unknown Jira status → no update', async () => {
    const { service, tasks } = make();
    const res = await service.handleWebhook({ issue: { key: 'KP-9', fields: { status: { name: 'Backlog' } } } });
    expect(res.updated).toBe(false);
    expect(tasks[0]!.status).toBe('TODO');
  });

  test('no linked task → no update', async () => {
    const { service } = make();
    const res = await service.handleWebhook({ issue: { key: 'KP-404', fields: { status: { name: 'Done' } } } });
    expect(res.updated).toBe(false);
  });
});
