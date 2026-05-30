import { Injectable } from '@nestjs/common';

import { AlertsService } from '../../alerts/alerts.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';

export interface SlackInteractivePayload {
  team_id: string;
  actions?: Array<{ action_id: string; value: string }>;
}

/**
 * Handles Slack interactive callbacks (button clicks). The org is resolved from
 * the Slack `team_id` via its IntegrationConnection metadata, then the in-app
 * effect runs inside a synthesized tenant context.
 */
@Injectable()
export class SlackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  async handleInteractive(payload: SlackInteractivePayload): Promise<{ handled: boolean }> {
    const action = payload.actions?.[0];
    if (!action) return { handled: false };

    const organizationId = await this.resolveOrg(payload.team_id);
    if (!organizationId) return { handled: false };

    if (action.action_id === 'acknowledge_alert') {
      await (RequestContextStore.run(
        { userId: 'slack-bot', organizationId, roleId: null, principalType: 'user' },
        () => this.alerts.acknowledge(action.value),
      ) as Promise<unknown>);
      return { handled: true };
    }
    return { handled: false };
  }

  private async resolveOrg(teamId: string): Promise<string | null> {
    const conn = await this.prisma.integrationConnection.findFirst({
      where: { provider: 'slack', metadata: { path: ['team_id'], equals: teamId } },
      select: { organizationId: true },
    });
    return conn?.organizationId ?? null;
  }
}
