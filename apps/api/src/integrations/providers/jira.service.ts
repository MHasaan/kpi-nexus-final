import { Injectable } from '@nestjs/common';
import type { TaskStatus } from '@kpi-nexus/db';

import { PrismaService } from '../../prisma/prisma.service.js';
import { mapJiraStatusToTask } from './jira-map.js';

export interface JiraWebhookPayload {
  issue?: { key?: string; fields?: { status?: { name?: string } } };
}

/**
 * Receives Jira issue-update webhooks and mirrors the issue status onto the
 * linked Task (matched by `externalRef` containing the issue key). The task's
 * own org is used — no cross-tenant write.
 */
@Injectable()
export class JiraService {
  constructor(private readonly prisma: PrismaService) {}

  async handleWebhook(payload: JiraWebhookPayload): Promise<{ updated: boolean }> {
    const key = payload.issue?.key;
    const statusName = payload.issue?.fields?.status?.name;
    if (!key || !statusName) return { updated: false };

    const mapped = mapJiraStatusToTask(statusName);
    if (!mapped) return { updated: false };

    const task = await this.prisma.task.findFirst({
      where: { externalRef: { contains: key } },
      select: { id: true },
    });
    if (!task) return { updated: false };

    await this.prisma.task.update({ where: { id: task.id }, data: { status: mapped as TaskStatus } });
    return { updated: true };
  }
}
